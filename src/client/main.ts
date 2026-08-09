// ============================================================
// BoardGameSimulator — 应用入口（游戏大厅）
// 状态机：connecting → lobby ↔ playing
// 引擎权威在设备服务器（Node host-server），本端纯客户端
// 用法: ?ws=1（同源）或 ?ws=ws://地址:端口
// ============================================================
import '../components/GameCard';
import '../components/PlayerRow';

import { WSTransport } from '../core/wsTransport';
import { bus } from '../utils/EventBus';
import { Logger } from '../utils/Logger';
import { ToastManager } from '../views/ToastView';
import { LobbyView } from '../views/LobbyView';
import { BattleView } from '../views/BattleView';
import { SpectatorView, type SpectateData } from '../views/SpectatorView';
import { logView } from '../views/LogView';
import { EVENTS } from '../utils/messages';
import type { LobbyState, GameStarted, SeatAssign } from '../core/lobbyTypes';
import type { PlayerView } from '../core/types';

// ========== 连接参数 ==========
const params = new URLSearchParams(location.search);
const WS_URL = params.get('ws') === '1' || params.get('ws') === null
  ? `ws://${location.host}`
  : params.get('ws') as string;

// ========== 全局状态 ==========
const app = document.getElementById('app')!;
const lobbyView = new LobbyView(app);
const battleView = new BattleView(app);
const spectatorView = new SpectatorView(app);

let transport: WSTransport | null = null;
let myId = '';
let amHost = false;
let currentGameId = '';
let mySeat: number | null = null;   // 我在游戏中的位置（null=观战或大厅）
let inGame = false;
let reconnectCount = 0;

// ========== 视图管理 ==========

function showLobby(): void {
  lobbyView.mount();
  battleView.destroy();
  spectatorView.destroy();
  inGame = false;
  mySeat = null;
}

function showGame(v: PlayerView): void {
  const extra = v.extra as { boards?: unknown[] } | undefined;
  if (extra && Array.isArray(extra.boards)) {
    battleView.amHost = amHost;
    battleView.render(v);
    battleView.mount();
  } else {
    // 通用游戏视图（未来游戏库扩展用）
    ToastManager.show(`游戏类型不支持: ${currentGameId}`);
  }
}

function showSpectate(data: SpectateData): void {
  spectatorView.render(data);
  spectatorView.mount();
}

// ========== 消息处理 ==========

function handleMsg(msg: { type: string; payload?: unknown }): void {
  switch (msg.type) {
    case 'lobby_state': {
      const st = msg.payload as LobbyState;
      myId = st.you;
      try { localStorage.setItem('bgs-pid', myId); } catch { /* 无 localStorage */ }
      amHost = !!st.players.find(p => p.id === myId)?.isHost;
      lobbyView.showLobby(st);
      lobbyView.mount();
      break;
    }
    case 'game_started': {
      const gs = msg.payload as GameStarted;
      currentGameId = gs.gameId;
      if (gs.seats[myId] !== undefined) {
        mySeat = gs.seats[myId];
        inGame = true;
        Logger.log('APP', `进入游戏 ${gs.gameId}，位置 ${mySeat}`);
      } else if (gs.spectators.includes(myId)) {
        mySeat = null;
        Logger.log('APP', `观战 ${gs.gameId}`);
      }
      break;
    }
    case 'game_state': {
      const v = msg.payload as PlayerView;
      showGame(v);
      break;
    }
    case 'spectate': {
      showSpectate(msg.payload as SpectateData);
      break;
    }
    case 'back_to_lobby': {
      const notice = (msg.payload as { notice?: string } | undefined)?.notice;
      if (notice) ToastManager.show(notice);
      showLobby();
      break;
    }
    case 'error': {
      const e = msg.payload as { message: string };
      ToastManager.show(e.message);
      break;
    }
    case 'closed': {
      ToastManager.show('连接断开，正在重连…');
      scheduleReconnect();
      break;
    }
  }
}

// ========== 重连 ==========

function scheduleReconnect(): void {
  if (reconnectCount >= 5) {
    ToastManager.show('无法连接服务器，请检查网络');
    return;
  }
  reconnectCount++;
  setTimeout(() => {
    if (transport) return; // 已有连接
    connect().catch(() => scheduleReconnect());
  }, 2000 * reconnectCount);
}

async function connect(): Promise<void> {
  const t = new WSTransport(WS_URL);
  transport = t;
  t.onMessage(handleMsg);
  await t.connect();
  reconnectCount = 0;
  // 断线恢复：携带持久化 playerId
  const saved = localStorage.getItem('bgs-pid') ?? undefined;
  t.register(saved);
  Logger.log('APP', `已连接 ${WS_URL}${saved ? `（恢复身份 ${saved}）` : ''}`);
}

// ========== UI 事件 ==========

// 大厅：座位声明
bus.on('ui:set_seat', (wantPlay: boolean) => transport?.setSeat(!!wantPlay));
// 大厅：改名
bus.on('ui:rename', (name: string) => transport?.rename(name));
// 大厅：主机发起游戏
bus.on('ui:start_game', (gameId: string, seats: SeatAssign[]) => transport?.startGame(gameId, seats));
// 游戏：动作
bus.on(EVENTS.UI_PLAY_ACTION, (type: string, payload: unknown) => {
  if (!inGame) return;
  transport?.sendAction({ type, playerIndex: mySeat ?? 0, payload, timestamp: Date.now() });
});
// 游戏：主机中止回大厅
bus.on('ui:back_to_lobby', () => transport?.backToLobby());
// 日志
bus.on('ui:show_log', () => logView.show());

// ========== 启动 ==========

// 调试钩子
(window as unknown as Record<string, unknown>).__bgs = {
  get transport() { return transport; },
  get myId() { return myId; },
  get currentGameId() { return currentGameId; },
  get battleView() { return battleView; },
  bus,
};

connect().catch(e => {
  ToastManager.show('连接失败: ' + (e as Error).message);
  scheduleReconnect();
});
