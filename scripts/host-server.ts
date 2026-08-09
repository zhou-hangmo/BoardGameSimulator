// ============================================================
// BoardGameSimulator — Node 大厅服务器（设备服务器）
// 单端口：HTTP 静态页面（docs/）+ WS 大厅（常驻玩家/游戏会话）
// 状态机：lobby（常驻）↔ playing（游戏会话，结束自动回大厅）
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
import type { GameMeta, LobbyState, LobbyPlayer, SeatAssign, GameStarted, ClientMsg } from '../src/core/lobbyTypes';

const PORT = parseInt(process.argv[2] || '8787', 10);
// docs 目录：App 内通过 BGS_DOCS 环境变量指定（nodejs-project/docs），电脑上默认 ../docs
const DOCS = process.env.BGS_DOCS || path.join(__dirname, '..', 'docs');

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

// ========== 游戏库注册表 ==========

const GAMES: GameMeta[] = [{
  id: battleshipTest.id,
  name: battleshipTest.name,
  description: '双人策略海战',
  minPlayers: 2,
  maxPlayers: 2,
  ready: true,
}];

// ========== 大厅状态 ==========

interface Conn {
  ws: WebSocket;
  player: LobbyPlayer;
}

let seq = 0;
const conns = new Map<WebSocket, Conn>();       // 所有在线连接
const playersCache = new Map<string, { name: string; wantPlay: boolean }>();  // 离线身份缓存（断线恢复）
let hostId = '';

// 游戏会话（null = 大厅）
interface Session {
  gameId: string;
  engine: GameEngine;
  seats: Map<string, number>;   // playerId -> 游戏位置
  spectators: string[];
}
let session: Session | null = null;

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg: unknown): void {
  for (const c of conns.values()) send(c.ws, msg);
}

function lobbyState(): LobbyState {
  return {
    status: session ? 'playing' : 'lobby',
    players: Array.from(conns.values()).map(c => c.player),
    games: GAMES,
    currentGame: session?.gameId ?? null,
    you: '', // 按连接填充
  };
}

function broadcastLobby(notice?: string): void {
  for (const c of conns.values()) {
    send(c.ws, { type: 'lobby_state', payload: { ...lobbyState(), you: c.player.id, notice } });
  }
}

// ========== 引擎会话 ==========

const s0: GameState = {
  version: 0, players: [], deck: [], discard: [], bottomCards: [],
  landlordIndex: -1, currentTurn: 0, phase: 'idle',
  lastPlay: null, passCount: 0, winner: null,
};

function startSession(gameId: string, seats: SeatAssign[]): void {
  const meta = GAMES.find(g => g.id === gameId);
  if (!meta) { log(`未知游戏: ${gameId}`); return; }
  const players = seats.filter(s => s.seat === 'player');
  if (players.length < meta.minPlayers || players.length > meta.maxPlayers) {
    log(`游戏位数量不符: 允许 ${meta.minPlayers}~${meta.maxPlayers}，实际 ${players.length}`);
    return;
  }
  const engine = new GameEngine(s0);
  const config = battleshipTest.config;
  const errs = engine.loadGame(config);
  if (errs.filter(e => e.level === 'error').length > 0) {
    log(`配置错误: ${errs.map(e => e.message).join('; ')}`);
    return;
  }
  engine.startGame(players.length);
  const s = engine.getState();
  engine.loadState({ ...s, extra: initBoards(players.length), phase: 'idle' });

  const seatMap = new Map<string, number>();
  players.forEach((p, i) => seatMap.set(p.playerId, i));
  session = {
    gameId,
    engine,
    seats: seatMap,
    spectators: seats.filter(s => s.seat === 'spectator').map(s => s.playerId),
  };
  log(`游戏会话开始: ${gameId} 玩家=[${players.map(p => p.playerId).join(',')}] 观战=[${session.spectators.join(',')}]`);

  broadcast({ type: 'game_started', payload: { gameId, seats: Object.fromEntries(seatMap), spectators: session.spectators } as GameStarted });
  broadcastGameState();
}

function broadcastGameState(): void {
  if (!session) return;
  const state = session.engine.getState();
  // 游戏位玩家：按座位过滤的 PlayerView
  for (const [playerId, idx] of session.seats) {
    const c = Array.from(conns.values()).find(c => c.player.id === playerId);
    if (!c) continue;
    const v: PlayerView = session.engine.buildPlayerView(idx);
    const ex = state.extra as BattleshipExtra | undefined;
    if (ex && Array.isArray(ex.boards)) v.extra = filterExtra(ex, idx);
    send(c.ws, { type: 'game_state', payload: v });
  }
  // 观战玩家：spectate 数据
  const spectate = {
    phase: state.phase,
    currentTurn: state.currentTurn,
    winner: state.winner,
    log: (state.extra as { log?: unknown[] } | undefined)?.log ?? [],
  };
  for (const pid of session.spectators) {
    const c = Array.from(conns.values()).find(c => c.player.id === pid);
    if (c) send(c.ws, { type: 'spectate', payload: spectate });
  }
}

function endSession(notice: string): void {
  if (!session) return;
  log(`游戏会话结束: ${notice}`);
  session = null;
  broadcast({ type: 'back_to_lobby', payload: { notice } });
  broadcastLobby(notice);
}

// ========== 消息处理 ==========

function handleMsg(c: Conn, msg: ClientMsg): void {
  const { ws, player } = c;

  switch (msg.type) {
    case 'register': {
      // 断线恢复：携带 playerId 且缓存存在 → 复用身份
      const savedId = String((msg as { playerId?: string }).playerId ?? '');
      const cached = playersCache.get(savedId);
      if (cached && savedId && !Array.from(conns.values()).some(c => c.player.id === savedId)) {
        player.id = savedId;
        player.name = cached.name;
        player.wantPlay = cached.wantPlay;
        log(`${player.id} 身份恢复 (${cached.name})`);
        broadcastLobby();
      }
      break;
    }
    case 'rename': {
      const name = String(msg.name ?? '').trim().slice(0, 12) || player.name;
      player.name = name;
      log(`${player.id} 改名 → ${name}`);
      broadcastLobby();
      break;
    }
    case 'set_seat': {
      player.wantPlay = !!msg.wantPlay;
      log(`${player.id} 声明 ${player.wantPlay ? '想玩' : '观战'}`);
      broadcastLobby();
      break;
    }
    case 'start_game': {
      if (player.id !== hostId) { send(ws, { type: 'error', payload: { message: '只有主机可以发起游戏' } }); return; }
      if (session) { send(ws, { type: 'error', payload: { message: '已有进行中的游戏' } }); return; }
      const valid = Array.isArray(msg.seats) ? msg.seats : [];
      // 校验座位只包含在线玩家
      const online = new Set(Array.from(conns.values()).map(x => x.player.id));
      if (!valid.every(s => online.has(s.playerId))) {
        send(ws, { type: 'error', payload: { message: '座位包含不在线玩家' } });
        return;
      }
      startSession(String(msg.gameId), valid);
      break;
    }
    case 'action': {
      if (!session) return;
      const idx = session.seats.get(player.id);
      if (idx === undefined) return; // 观战者不能操作
      const action = msg.payload as GameAction;
      action.playerIndex = idx;
      log(`action: ${action.type} by ${player.id}(位置${idx})`);
      void session.engine.dispatch(action).then(err => {
        if (err) log(`dispatch 拒绝: ${err.message}`);
        if (!session) return;
        const state = session.engine.getState();
        broadcastGameState();
        if (state.phase === 'ended') {
          endSession('对局结束');
        }
      });
      break;
    }
    case 'back_to_lobby': {
      if (player.id !== hostId) { send(ws, { type: 'error', payload: { message: '只有主机可以中止游戏' } }); return; }
      endSession('主机中止');
      break;
    }
  }
}

function removePlayer(c: Conn, reason: string): void {
  conns.delete(c.ws);
  // 缓存身份供断线恢复（仅大厅玩家，不缓存游戏内状态）
  playersCache.set(c.player.id, { name: c.player.name, wantPlay: c.player.wantPlay });
  log(`${c.player.id} 断开 (${reason})，剩余 ${conns.size}`);
  if (c.player.id === hostId && conns.size > 0) {
    // 主机转移给最早连接者
    hostId = Array.from(conns.values())[0].player.id;
    log(`主机转移 → ${hostId}`);
  }
  if (session) {
    const inGame = session.seats.has(c.player.id) || session.spectators.includes(c.player.id);
    if (inGame && session.seats.has(c.player.id)) {
      endSession(`玩家 ${c.player.id} 掉线`);
    }
  }
  broadcastLobby();
}

// ========== HTTP 静态页面 ==========

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
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

// ========== WebSocket（大厅） ==========

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  const id = `player-${seq++}`;
  // 自动分配座位：游戏位有空则进游戏位，否则观战
  const maxCap = GAMES.filter(g => g.ready)[0]?.maxPlayers ?? 2;
  const seated = Array.from(conns.values()).filter(c => c.player.wantPlay).length;
  const player: LobbyPlayer = { id, name: `玩家${seq}`, isHost: conns.size === 0, wantPlay: seated < maxCap };
  const c: Conn = { ws, player };
  conns.set(ws, c);
  if (conns.size === 1) hostId = id;
  log(`${id} 加入大厅 (${conns.size} 人在线, 主机=${hostId})`);
  send(ws, { type: 'lobby_state', payload: { ...lobbyState(), you: id } });
  broadcastLobby();

  ws.on('message', (raw) => {
    let msg: ClientMsg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    handleMsg(c, msg);
  });

  ws.on('close', () => removePlayer(c, 'close'));
  ws.on('error', () => removePlayer(c, 'error'));
});

server.listen(PORT, '0.0.0.0', () => {
  log(`大厅服务器 listening 0.0.0.0:${PORT} (页面 http://<ip>:${PORT}/ + ws 大厅)`);
});
