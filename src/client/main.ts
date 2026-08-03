// ============================================================
// BoardGameSimulator — 应用入口（EventBus 驱动）
// 测试模式：?test=1&game=<id>&role=host|guest（仅 dev 生效）
// ============================================================
import '../components/GameCard';
import '../components/PlayerRow';

import { GameEngine } from '../core/engine';
import { P2PManager } from '../core/p2p';
import { TestP2P } from '../core/testP2p';
import { bus } from '../utils/EventBus';
import { Logger } from '../utils/Logger';
import { ToastManager } from '../views/ToastView';
import { HomeView, type GameMeta } from '../views/HomeView';
import { LobbyView, type PlayerInfo } from '../views/LobbyView';
import { GameView } from '../views/GameView';
import { ScannerView } from '../views/ScannerView';
import { SpectatorView, type SpectateData } from '../views/SpectatorView';
import { logView } from '../views/LogView';
import { EVENTS } from '../utils/messages';

import type { GameState, GameAction, GameConfig, PlayerView } from '../core/types';
import { findTestModule } from '../test/registry';
import { battleshipTest } from '../games/battleship/test';

// ========== 测试模式判定 ==========
const params = new URLSearchParams(location.search);
const TEST = import.meta.env.DEV && params.get('test') !== null;
const TEST_ROLE = (params.get('role') ?? 'host') as 'host' | 'guest';
const TEST_GAME = params.get('game') ?? 'battleship';

// ========== 全局状态 ==========
const app = document.getElementById('app')!;
const homeView = new HomeView(app, () => installedGames);
const lobbyView = new LobbyView(app);
const gameView = new GameView(app);
const spectatorView = new SpectatorView(app);
const scanner = new ScannerView();

// 全局悬浮 home 按钮（始终可见）
const globalHomeBtn = document.createElement('div');
globalHomeBtn.id = 'global-home';
globalHomeBtn.textContent = '⌂';
globalHomeBtn.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);width:48px;height:48px;border-radius:50%;background:#fff;border:1px solid rgba(0,0,0,.1);box-shadow:0 2px 12px rgba(0,0,0,.08);display:none;align-items:center;justify-content:center;font-size:20px;cursor:pointer;z-index:99999;color:#333;';
globalHomeBtn.addEventListener('click', () => showHome());
document.body.appendChild(globalHomeBtn);

let engine: GameEngine | null = null;
let p2p: P2PManager | TestP2P | null = null;
let myIdx = 0;
let isHost = false;
let room = '';
let gameNeeds = 2;
let lobbyPlayers: PlayerInfo[] = [];
let lobbyQrImg = '';

const installedGames: GameMeta[] = [{
  id: battleshipTest.id, name: battleshipTest.name, description: '双人策略海战',
  playerCount: '2', tags: ['策略', '回合制'], ready: true,
  config: battleshipTest.config,
}];

// 网络环境信息
const nav = navigator as any;
Logger.log('NET', `online=${navigator.onLine}, IP6=${!!nav.connection?.effectiveType}, type=${nav.connection?.effectiveType || '?'}`);
Logger.log('NET', `IPv6 stack: ${window.location.protocol.includes('https') ? 'checking...' : 'N/A'}`);
if (TEST) Logger.log('APP', `测试模式: game=${TEST_GAME} role=${TEST_ROLE}`);

// ========== 视图管理 ==========
function showHome(): void {
  homeView.mount();
  globalHomeBtn.style.display = 'none';
}

function showNonHomeView(): void {
  globalHomeBtn.style.display = 'flex';
}

function showLobby(): void {
  lobbyView.showLobby(room, lobbyPlayers, lobbyQrImg, gameNeeds);
  lobbyView.mount();
  showNonHomeView();
}

function showGameView(v: PlayerView): void {
  gameView.render(v);
  gameView.mount();
  showNonHomeView();
}

function createP2P(): P2PManager | TestP2P {
  return TEST ? new TestP2P(TEST_ROLE) : new P2PManager();
}

function broadcastGame(): void {
  if (!engine || !isHost || !p2p) return;
  const state = engine.getState();
  const extra = state.extra as { log?: SpectateData['log'] } | undefined;
  for (let i = 0; i < state.players.length; i++) {
    const v = engine.buildPlayerView(i);
    if (i === 0) {
      showGameView(v);
    } else {
      const pid = p2p.getPeerIds()[i - 1];
      if (pid) p2p.sendPlayerView(pid, v);
    }
  }
  // 观战者（有效玩家之后的 peer）
  const pids = p2p.getPeerIds();
  const spectate: SpectateData = {
    phase: state.phase,
    currentTurn: state.currentTurn,
    winner: state.winner,
    log: extra?.log ?? [],
  };
  for (let i = state.players.length - 1; i < pids.length; i++) {
    p2p.sendRaw(pids[i], 'spectate', spectate);
  }
}

// ========== 连接流程（真实 / 测试共用） ==========

async function doJoinRoom(qrData: string): Promise<void> {
  isHost = false;
  if (!p2p) p2p = createP2P();
  room = await p2p.joinFromOffer(qrData);
  Logger.log('APP', `joinRoom: room=${room}`);
  const answerImg = await p2p.getGuestQrImage();
  if (TEST) {
    lobbyView.showWaitRoom(room, []);
  } else {
    lobbyView.showGuestQr(room, answerImg);
  }
  lobbyView.mount();
  showNonHomeView();

  p2p.onMessage((_peerId, data) => {
    const d = data as { type: string; payload: unknown };
    if (d.type === 'state') {
      const view = d.payload as PlayerView;
      myIdx = view.playerIndex;
      showGameView(view);
    } else if (d.type === 'assign') {
      const a = d.payload as { playerIndex: number; spectator?: boolean };
      myIdx = a.playerIndex;
    } else if (d.type === 'lobby') {
      const l = d.payload as { players: PlayerInfo[] };
      lobbyView.showWaitRoom(room, l.players ?? []);
      lobbyView.mount();
    } else if (d.type === 'spectate') {
      spectatorView.render(d.payload as SpectateData);
      spectatorView.mount();
      showNonHomeView();
    }
  });
}

async function doScanGuest(qrData: string): Promise<void> {
  if (!p2p || !isHost) return;
  const pid = await p2p.acceptGuestAnswer(qrData);
  Logger.log('APP', `scanGuest: pid=${pid}`);
  const validCount = lobbyPlayers.filter(p => !p.isIdle && !p.isSpectator).length;
  const isPlayer = validCount < gameNeeds;
  if (isPlayer) {
    lobbyPlayers.push({ name: `玩家 ${validCount}`, isHost: false, status: '正在连接' });
  } else {
    lobbyPlayers.push({ name: `玩家 ${validCount + 1}`, isHost: false, isIdle: true, canSpectate: true, status: '已连接' });
  }
  showLobby();
  // 异步等待 DC 打开（不阻塞扫码器关闭）
  p2p.waitForDcOpen(pid, 10000).then(ready => {
    if (!ready) {
      const p = lobbyPlayers.find(x => !x.isHost && x.status === '正在连接');
      if (p) p.status = '连接超时';
      showLobby();
      ToastManager.show('连接超时');
      return;
    }
    const p = lobbyPlayers.find(x => !x.isHost && x.status === '正在连接');
    if (p) p.status = '已连接';
    showLobby();
    p2p!.sendRaw(pid, 'assign', { playerIndex: isPlayer ? validCount : -1, spectator: !isPlayer });
    const plist: PlayerInfo[] = lobbyPlayers.map(x => ({ name: x.name, isHost: x.isHost, isSpectator: x.isSpectator }));
    p2p!.sendRaw(pid, 'lobby', { players: plist });
    ToastManager.show(isPlayer ? '玩家已连接' : '已满员，等待观战');
  });
}

// ========== EventBus 绑定 ==========
bus.on(EVENTS.TOAST, (msg: string) => ToastManager.show(msg));
bus.on(EVENTS.VIEW_CHANGE, (view: string) => {
  if (view === 'home') showHome();
});

// 导入游戏
bus.on(EVENTS.UI_IMPORT_GAME, async () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async () => {
    const f = input.files?.[0]; if (!f) return;
    try {
      const cfg = JSON.parse(await f.text()) as GameConfig;
      installedGames.push({
        id: cfg.meta.name,
        name: cfg.meta.name,
        description: f.name,
        playerCount: String(cfg.meta.maxPlayers),
        tags: ['导入'],
        ready: true,
        config: cfg,
      });
      ToastManager.show('导入成功');
      showHome();
    } catch { ToastManager.show('JSON 格式错误'); }
  };
  input.click();
});

// 创建房间
bus.on(EVENTS.UI_CREATE_ROOM, async (gameId: string) => {
  const g = installedGames.find(x => x.id === gameId) ?? findTestModule(gameId);
  if (!g?.config) { ToastManager.show('配置加载中'); return; }

  isHost = true; myIdx = 0;
  p2p = createP2P();
  room = await p2p.createRoom();
  gameNeeds = (g.config as GameConfig).meta.maxPlayers;

  const s0: GameState = {
    version: 0, players: [], deck: [], discard: [], bottomCards: [],
    landlordIndex: -1, currentTurn: 0, phase: 'idle',
    lastPlay: null, passCount: 0, winner: null,
  };
  engine = new GameEngine(s0);
  const errs = engine.loadGame(g.config as GameConfig);
  if (errs.filter(e => e.level === 'error').length > 0) {
    console.error('Config errors:', errs);
    ToastManager.show('游戏配置校验失败');
    return;
  }

  lobbyPlayers = [{ name: '你', isHost: true }];
  lobbyQrImg = await p2p.getHostQrImage();
  Logger.log('APP', `createRoom: room=${room}, test=${TEST}`);
  showLobby();

  p2p.onAction(async (action: GameAction) => {
    if (!engine) return;
    const err = await engine.dispatch(action);
    if (err) {
      const pid = p2p!.getPeerIds()[action.playerIndex - 1];
      if (pid && pid !== undefined) p2p!.sendError(pid, err);
      return;
    }
    broadcastGame();
  });

  if (TEST) {
    (p2p as TestP2P).onAnswer((ans: string) => { void doScanGuest(ans); });
  }
});

// 开始游戏（有效玩家数达到上限才可开）
bus.on(EVENTS.UI_START_GAME, () => {
  if (!engine || !isHost || !p2p) return;
  const valid = lobbyPlayers.filter(p => !p.isIdle && !p.isSpectator).length;
  if (valid < gameNeeds) {
    ToastManager.show(`需要至少 ${gameNeeds} 名玩家`);
    return;
  }
  engine.startGame(valid);
  broadcastGame();
});

// 加入房间
bus.on(EVENTS.UI_JOIN_ROOM, async (qrData: string) => {
  await doJoinRoom(qrData);
});

// 扫码访客
bus.on(EVENTS.UI_SCAN_GUEST, async (qrData: string) => {
  await doScanGuest(qrData);
});

// 空闲玩家 -> 观战（主持人操作）
bus.on('ui:spectate_player', (name: string) => {
  const p = lobbyPlayers.find(x => x.name === name);
  if (!p || !p2p || !isHost) return;
  p.isIdle = false;
  p.canSpectate = false;
  p.isSpectator = true;
  showLobby();
  const plist: PlayerInfo[] = lobbyPlayers.map(x => ({ name: x.name, isHost: x.isHost, isSpectator: x.isSpectator }));
  for (const pid of p2p.getPeerIds()) p2p.sendRaw(pid, 'lobby', { players: plist });
  ToastManager.show(`${p.name} 转为观战`);
});

// 出牌/动作
bus.on(EVENTS.UI_PLAY_ACTION, async (type: string, payload: unknown) => {
  if (isHost && engine) {
    await engine.dispatch({ type, playerIndex: myIdx, payload, timestamp: Date.now() });
    broadcastGame();
  } else if (p2p) {
    p2p.sendAction({ type, playerIndex: myIdx, payload, timestamp: Date.now() });
  }
});

// 分享房间
bus.on(EVENTS.UI_SHARE_ROOM, async () => {
  if (!p2p) return;
  const qr = await p2p.shareRoom();
  ToastManager.show(qr ? '已复制/分享' : '分享失败');
});

// 保存游戏
bus.on(EVENTS.UI_SAVE_GAME, async (cb: (url: string) => void) => {
  if (!engine) return;
  const { encodeQR } = await import('../core/qrcode');
  const url = await encodeQR({ roomCode: 'save', sdp: JSON.stringify(engine.getState()), peerId: 'save' });
  cb(url);
});

// 加载游戏
bus.on(EVENTS.UI_LOAD_GAME, (data: string) => {
  try {
    const state = JSON.parse(data);
    if (!state.players) { ToastManager.show('无效存档'); return; }
    engine = new GameEngine(state);
    isHost = true; myIdx = 0;
    gameView.render(engine.buildPlayerView(0));
    gameView.mount();
    showNonHomeView();
    ToastManager.show('棋局已恢复');
  } catch { ToastManager.show('存档损坏'); }
});

// 离开房间
bus.on(EVENTS.UI_LEAVE_ROOM, () => {
  p2p?.leave();
  engine?.destroy();
  engine = null;
  p2p = null;
  isHost = false;
  myIdx = 0;
  room = '';
  gameNeeds = 2;
  lobbyPlayers = [];
  lobbyQrImg = '';
});

// 显示游戏详情
bus.on('ui:show_game_detail', (gameId: string) => {
  const g = installedGames.find(x => x.id === gameId);
  if (g) { lobbyView.showGameDetail(g.name, g.description, g.playerCount, g.id); lobbyView.mount(); showNonHomeView(); }
});

// 回到首页
bus.on('ui:go_home', () => showHome());

// 打开日志
bus.on('ui:show_log', () => logView.show());

// 打开扫描器
bus.on('ui:open_scanner', (cb: (data: unknown) => void) => {
  if (TEST) {
    ToastManager.show('测试模式：免扫码自动连接');
    return;
  }
  scanner.start((data, done, retry) => {
    ToastManager.show('正在连接...');
    try {
      cb(data);
      setTimeout(done, 500);
    } catch (e: any) {
      ToastManager.show('连接失败');
      setTimeout(retry, 2000);
    }
  }).catch(e => {
    ToastManager.show('相机失败: ' + (e.message || '未知错误'));
  });
});

// ========== 启动 ==========
if (TEST) {
  const mod = findTestModule(TEST_GAME);
  if (!mod) {
    ToastManager.show(`未知测试游戏: ${TEST_GAME}`);
    showHome();
  } else if (TEST_ROLE === 'host') {
    bus.emit(EVENTS.UI_CREATE_ROOM, mod.id);
  } else {
    isHost = false;
    p2p = createP2P();
    (p2p as TestP2P).onOffer((offer: string) => { void doJoinRoom(offer); });
    lobbyView.showWaitRoom('--test--', []);
    lobbyView.mount();
    showNonHomeView();
  }
} else {
  showHome();
}
