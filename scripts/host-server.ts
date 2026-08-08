// ============================================================
// BoardGameSimulator — Node 主机服务器（方案A 服务器端）
// 引擎权威在服务器（Node 进程内跑 L3，无 Worker）：
//   浏览器 host/guest 都是纯客户端，连接后自动开局
// 用法: npx tsx scripts/host-server.ts [port]   (默认 8787)
// ============================================================
import { WebSocketServer, WebSocket } from 'ws';
import { GameEngine } from '../src/core/engine';
import { battleshipTest } from '../src/games/battleship/test';
import { initBoards } from '../src/games/battleship/rules';
import { filterExtra } from '../src/games/battleship/view';
import type { BattleshipExtra } from '../src/games/battleship/rules';
import type { GameState, GameAction, PlayerView } from '../src/core/types';

const PORT = parseInt(process.argv[2] || '8787', 10);

const s0: GameState = {
  version: 0, players: [], deck: [], discard: [], bottomCards: [],
  landlordIndex: -1, currentTurn: 0, phase: 'idle',
  lastPlay: null, passCount: 0, winner: null,
};

let engine: GameEngine | null = null;
const clients = new Map<WebSocket, number>(); // ws -> playerIndex

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function broadcastState(): void {
  if (!engine) return;
  const state = engine.getState();
  for (const [ws, idx] of clients) {
    const v: PlayerView = engine.buildPlayerView(idx);
    const ex = state.extra as BattleshipExtra | undefined;
    if (ex && Array.isArray(ex.boards)) v.extra = filterExtra(ex, idx);
    send(ws, { type: 'state', payload: v });
  }
}

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

wss.on('connection', (ws) => {
  log('客户端接入');
  ws.on('message', (raw) => {
    let msg: { type: string; payload?: unknown; playerIndex?: number };
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'register') {
      if (clients.size >= 2) { log(`拒绝: 房间已满`); ws.close(); return; }
      const idx = clients.size;
      clients.set(ws, idx);
      log(`player-${idx} 加入 (${clients.size}/2)`);
      send(ws, { type: 'assign', payload: { playerIndex: idx } });
      if (clients.size === 2) startGame();
      return;
    }

    if (msg.type === 'action') {
      const idx = clients.get(ws);
      if (idx === undefined || !engine) return;
      const action = msg.payload as GameAction;
      action.playerIndex = action.playerIndex ?? idx;
      log(`action: ${action.type} by ${action.playerIndex}`);
      void engine.dispatch(action).then(err => {
        if (err) log(`dispatch 拒绝: ${err.message}`);
        broadcastState();
      });
    }
  });

  ws.on('close', () => {
    const idx = clients.get(ws);
    if (idx !== undefined) {
      clients.delete(ws);
      log(`player-${idx} 断开 (${clients.size}/2)`);
    }
  });
  ws.on('error', () => { /* ignore */ });
});

function startGame(): void {
  const config = battleshipTest.config;
  if (!config) { log('配置缺失'); return; }
  engine = new GameEngine(s0);
  const errs = engine.loadGame(config);
  if (errs.filter(e => e.level === 'error').length > 0) {
    log(`配置错误: ${errs.map(e => e.message).join('; ')}`);
    return;
  }
  engine.startGame(2);
  const s = engine.getState();
  engine.loadState({ ...s, extra: initBoards(2), phase: 'idle' });
  log('满员 2/2，开局（布阵阶段）');
  broadcastState();
}

log(`host-server listening 0.0.0.0:${PORT}`);
