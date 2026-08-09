// ============================================================
// BoardGameSimulator — Node 一体主机服务器（手机 App 的前身）
// 单端口 8787：
//   HTTP  → 静态页面（docs/ 构建产物）——手机浏览器 localhost 直访
//   WS    → 引擎权威（进程内 L3）+ 客户端接入
// 用法: node host-server.cjs [port]   (默认 8787)
// ============================================================
import { createServer } from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { GameEngine } from '../src/core/engine';
import { battleshipTest } from '../src/games/battleship/test';
import { initBoards } from '../src/games/battleship/rules';
import { filterExtra } from '../src/games/battleship/view';
import type { BattleshipExtra } from '../src/games/battleship/rules';
import type { GameState, GameAction, PlayerView } from '../src/core/types';

const PORT = parseInt(process.argv[2] || '8787', 10);
const DOCS = path.join(__dirname, '..', 'docs');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

// ---------- 引擎 ----------

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

// ---------- HTTP 静态页面 ----------

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    // 兼容 vite base 前缀（构建产物资源路径带 /BoardGameSimulator/）
    urlPath = urlPath.replace(/^\/BoardGameSimulator/, '');
    if (urlPath === '/') urlPath = '/index.html';
    const file = path.normalize(path.join(DOCS, urlPath));
    if (!file.startsWith(DOCS)) { res.writeHead(403); res.end('forbidden'); return; }
    const data = await fs.readFile(file);
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

// ---------- WebSocket（引擎权威） ----------

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  log('客户端接入');
  ws.on('message', (raw) => {
    let msg: { type: string; payload?: unknown; playerIndex?: number };
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'register') {
      if (clients.size >= 2) { log('拒绝: 房间已满'); ws.close(); return; }
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

server.listen(PORT, '0.0.0.0', () => {
  log(`一体服务器 listening 0.0.0.0:${PORT} (页面 http://<ip>:${PORT}/ + ws)`);
});
