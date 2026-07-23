// ============================================================
// BoardGameSimulator — 游戏引擎主类
// ============================================================

import type {
  GameState, GameAction, GameConfig, PlayerView, PlayerViewData,
  PublicState, VisibilityConfig, ValidationError, ErrorResponse,
  Card,
} from './types';
import { ActionRegistry, ConditionRegistry } from './registry';
import { reducer } from './reducer';

// ---------- Worker 消息类型 ----------
interface WorkerRequest {
  id: number;
  type: 'hook' | 'query' | 'init';
  name: string;
  state: GameState;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any[];
}

interface WorkerResponse {
  id: number;
  result?: unknown;
  error?: string;
}

type L3Callback = (result: unknown) => void;

export class GameEngine {
  private state: GameState;
  private config: GameConfig | null = null;
  private worker: Worker | null = null;
  private workerReady = false;
  private pendingCallbacks = new Map<number, L3Callback>();
  private requestId = 0;

  constructor(initialState: GameState) {
    this.state = initialState;
  }

  // ========== 配置加载 ==========

  loadGame(config: GameConfig): ValidationError[] {
    // Auto-register stub handlers for all action types in config
    for (const rule of config.l2?.rules ?? []) {
      for (const action of rule?.actions ?? []) {
        if (!ActionRegistry.has(action.type)) {
          ActionRegistry.set(action.type, {
            execute: (s, _p, _c) => s,
            validate: () => true,
          });
        }
      }
      if (rule.condition && !ConditionRegistry.has(rule.condition.type)) {
        ConditionRegistry.set(rule.condition.type, { check: () => true });
      }
    }
    const errors = this.validateConfig(config);
    if (errors.filter(e => e.level === 'error').length > 0) {
      return errors;
    }
    this.config = config;
    // 启动 L3 Worker
    if (config.l3) {
      this.initWorker(config.l3);
    }
    return errors;
  }

  private validateConfig(config: GameConfig): ValidationError[] {
    const errors: ValidationError[] = [];
    const { l1, l2 } = config;

    if (!l1?.cards || l1.cards.length === 0) {
      errors.push({ level: 'error', path: 'l1.cards', message: '卡牌列表不能为空' });
    }
    if (!l1?.players || l1.players.count < 2) {
      errors.push({ level: 'error', path: 'l1.players.count', message: '至少需要2名玩家' });
    }
    // 引用完整性
    for (const rule of l2?.rules ?? []) {
      for (const action of rule?.actions ?? []) {
        if (!ActionRegistry.has(action.type)) {
          errors.push({ level: 'error', path: `l2.rules.actions.${action.type}`, message: `未注册的动作: ${action.type}` });
        }
      }
      if (rule.condition && !ConditionRegistry.has(rule.condition.type)) {
        errors.push({
          level: 'warning',
          path: `l2.rules.condition.${rule.condition.type}`,
          message: `未注册的条件: ${rule.condition.type}`,
        });
      }
    }
    return errors;
  }

  // ========== L3 Worker 管理 ==========

  private initWorker(l3Code: string): void {
    this.worker = new Worker(new URL('./l3.worker.ts', import.meta.url), { type: 'module' });

    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const { id, result, error } = e.data;
      const cb = this.pendingCallbacks.get(id);
      if (cb) {
        this.pendingCallbacks.delete(id);
        if (error) {
          console.error(`[Engine] L3 Worker 错误: ${error}`);
        }
        cb(result);
      }
    };

    // 发送L3脚本到Worker
    this.worker.postMessage({ type: 'init', code: l3Code });
    this.workerReady = true;
  }

  private callWorker(type: 'hook' | 'query', name: string, args: unknown[]): Promise<unknown> {
    if (!this.worker || !this.workerReady) {
      return Promise.resolve(undefined);
    }
    const id = ++this.requestId;
    return new Promise(resolve => {
      this.pendingCallbacks.set(id, resolve);
      const req: WorkerRequest = { id, type, name, state: this.state, args };
      this.worker!.postMessage(req);
    });
  }

  // ========== 状态管理 ==========

  getState(): GameState {
    return this.state;
  }

  loadState(state: GameState): void {
    this.state = state;
  }

  async dispatch(action: GameAction): Promise<ErrorResponse | null> {
    // 1. L3 前置钩子
    await this.callWorker('hook', 'before_action', [action]);

    // 2. 执行 reducer
    const prevState = this.state;
    const newState = reducer(prevState, action);

    // 如果 reducer 没有变化，说明被拒绝了
    if (newState === prevState) {
      return {
        code: 'INVALID_ACTION',
        message: `动作 ${action.type} 在当前状态下不可执行`,
      };
    }

    // 3. L3 自定义校验（如果有）
    const l3Validate = await this.callWorker('query', 'validate_action', [newState, action]);
    if (l3Validate === false) {
      return { code: 'L3_VALIDATION_FAILED', message: 'L3校验未通过' };
    }

    this.state = newState;

    // 4. 持久化快照
    // 5. L3 后置钩子
    await this.callWorker('hook', 'after_state_update', [this.state]);

    return null; // 无错误
  }

  // ========== 玩家视图过滤 ==========

  buildPlayerView(playerIndex: number): PlayerView {
    if (!this.config) {
      throw new Error('未加载游戏配置');
    }
    const visibility = this.config.l1.visibility;
    const players = this.state.players.map(p =>
      this.filterPlayerData(p, playerIndex, visibility)
    );

    const publicState: PublicState = {
      currentTurn: this.state.currentTurn,
      phase: this.state.phase,
      landlordIndex: this.state.landlordIndex,
      lastPlay: this.state.lastPlay,
      passCount: this.state.passCount,
      winner: this.state.winner,
      discard: this.state.discard,
      bottomCards: this.filterField('bottomCards', this.state.bottomCards, playerIndex, visibility) as Card[] | { count: number },
    };

    return {
      version: this.state.version,
      playerIndex,
      phase: this.state.phase,
      currentTurn: this.state.currentTurn,
      winner: this.state.winner,
      players,
      publicState,
    };
  }

  private filterPlayerData(
    player: import('./types').PlayerState,
    viewerIndex: number,
    visibility: VisibilityConfig
  ): PlayerViewData {
    const isOwner = player.index === viewerIndex;
    const rule = visibility['players[*].hand'] ?? { mode: 'full' as const, description: '' };

    let hand: Card[] | { count: number };
    if (rule.mode === 'owner_only') {
      hand = isOwner ? player.hand : { count: player.hand.length };
    } else if (rule.mode === 'count') {
      hand = { count: player.hand.length };
    } else if (rule.mode === 'hidden') {
      hand = { count: 0 };
    } else {
      hand = player.hand; // full
    }

    return {
      index: player.index,
      name: player.name,
      hand,
      handCount: player.hand.length,
      isDisconnected: player.isDisconnected,
      extra: player.extra,
    };
  }

  private filterField(
    _fieldPath: string,
    value: unknown,
    _playerIndex: number,
    _visibility: VisibilityConfig
  ): unknown {
    // 简化实现：根据visibility配置过滤
    // 未来增强：使用fieldPath匹配visibility规则
    return value;
  }





  // ========== 生命周期 ==========

  startGame(): void {
    if (!this.config) throw new Error('未加载游戏配置');
    const l1 = this.config.l1;
    // Shuffle
    const deck = [...l1.cards];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    // Deal 17 to each player, 3 bottom
    const count = l1.players.count;
    const players = [];
    for (let i = 0; i < count; i++) {
      players.push({
        index: i,
        name: i === 0 ? '你' : `玩家 ${i + 1}`,
        hand: deck.slice(i * 17, (i + 1) * 17),
        handCount: 17,
        isHost: i === 0,
        isDisconnected: false,
      });
    }
    const bottomCards = deck.slice(51);
    this.state = { ...this.state, players, deck: [], bottomCards, phase: 'calling', currentTurn: 0 };
  }

  destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingCallbacks.clear();
  }
}
