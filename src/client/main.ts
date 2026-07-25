// ============================================================
// BoardGameSimulator — 应用入口（EventBus 驱动）
// ============================================================
import '../components/GameCard';
import '../components/PlayerRow';

import { GameEngine } from '../core/engine';
import { P2PManager } from '../core/p2p';
import { bus } from '../utils/EventBus';
import { ToastManager } from '../views/ToastView';
import { HomeView, type GameMeta } from '../views/HomeView';
import { LobbyView } from '../views/LobbyView';
import { GameView } from '../views/GameView';
import { ScannerView } from '../views/ScannerView';
import { EVENTS } from '../utils/messages';

import type { GameState, GameAction, GameConfig, PlayerView } from '../core/types';
import doudizhuConfig from '../games/doudizhu/config.json';

// ========== 全局状态 ==========
const app = document.getElementById('app')!;
const homeView = new HomeView(app, () => installedGames);
const lobbyView = new LobbyView(app);
const gameView = new GameView(app);
const scanner = new ScannerView();

// 全局悬浮 home 按钮（始终可见）
const globalHomeBtn = document.createElement('div');
globalHomeBtn.id = 'global-home';
globalHomeBtn.textContent = '⌂';
globalHomeBtn.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);width:48px;height:48px;border-radius:50%;background:#fff;border:1px solid rgba(0,0,0,.1);box-shadow:0 2px 12px rgba(0,0,0,.08);display:none;align-items:center;justify-content:center;font-size:20px;cursor:pointer;z-index:99999;color:#333;';
globalHomeBtn.addEventListener('click', () => showHome());
document.body.appendChild(globalHomeBtn);

let engine: GameEngine | null = null;
let p2p: P2PManager | null = null;
let myIdx = 0;
let isHost = false;
let room = '';
let lobbyPlayers: { name: string; isHost: boolean; status?: string }[] = [];
let lobbyQrImg = '';

const installedGames: GameMeta[] = [{
  id: 'doudizhu', name: '斗地主', description: '经典三人扑克',
  playerCount: '3', cardCount: 54, tags: ['卡牌', '回合制'], ready: true,
  config: doudizhuConfig as GameConfig,
}];

// ========== 视图管理 ==========
function showHome(): void {
  homeView.mount();
  globalHomeBtn.style.display = 'none';
}

function showNonHomeView(): void {
  globalHomeBtn.style.display = 'flex';
}

function showLobby(): void {
  lobbyView.showLobby(room, lobbyPlayers, lobbyQrImg);
  lobbyView.mount();
  showNonHomeView();
}

function showGameView(v: PlayerView): void {
  gameView.render(v);
  gameView.mount();
  showNonHomeView();
}

function broadcastGame(): void {
  if (!engine || !isHost || !p2p) return;
  const state = engine.getState();
  for (let i = 0; i < state.players.length; i++) {
    const v = engine.buildPlayerView(i);
    if (i === 0) {
      showGameView(v);
    } else {
      const pid = p2p.getPeerIds()[i - 1];
      if (pid) p2p.sendPlayerView(pid, v);
    }
  }
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
  const g = installedGames.find(x => x.id === gameId);
  if (!g?.config) { ToastManager.show('配置加载中'); return; }

  isHost = true; myIdx = 0;
  p2p = new P2PManager();
  room = await p2p.createRoom();

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
  showLobby();

  p2p.onAction(async (action: GameAction) => {
    if (!engine) return;
    const err = await engine.dispatch(action);
    if (err) {
      const pid = p2p!.getPeerIds()[action.playerIndex - 1];
      if (pid) p2p!.sendError(pid, err);
      return;
    }
    broadcastGame();
  });
});

// 开始游戏
bus.on(EVENTS.UI_START_GAME, () => {
  if (!engine || !isHost || !p2p) return;
  const needs = (doudizhuConfig as GameConfig).meta.maxPlayers;
  if (p2p.getPeerCount() + 1 < needs) {
    ToastManager.show(`需要至少 ${needs} 人`);
    return;
  }
  engine.startGame(p2p.getPeerCount() + 1);
  broadcastGame();
});

// 加入房间
bus.on(EVENTS.UI_JOIN_ROOM, async (qrData: string) => {
  isHost = false;
  p2p = new P2PManager();
  room = await p2p.joinFromOffer(qrData);
  const answerImg = await p2p.getGuestQrImage();
  lobbyView.showGuestQr(room, answerImg);
  lobbyView.mount();
  showNonHomeView();

  p2p.onMessage((_peerId, data) => {
    const d = data as { type: string; payload: unknown };
    if (d.type === 'state') {
      const view = d.payload as PlayerView;
      myIdx = view.playerIndex;
      showGameView(view);
    }
  });
});

// 扫码访客
bus.on(EVENTS.UI_SCAN_GUEST, async (qrData: string) => {
  if (!p2p || !isHost) return;
  const pid = await p2p.acceptGuestAnswer(qrData);
  const idx = p2p.getPeerCount();
  lobbyPlayers.push({ name: `玩家 ${idx}`, isHost: false, status: '正在连接' });
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
    p2p!.sendRaw(pid, 'assign', { playerIndex: idx });
    const plist: { name: string; isHost: boolean }[] = [
      { name: '你', isHost: true },
      ...p2p!.getPeerIds().map((_, i) => ({ name: `玩家 ${i + 1}`, isHost: false })),
    ];
    p2p!.sendRaw(pid, 'lobby', { players: plist });
    ToastManager.show('玩家已连接');
  });
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
});

// 显示游戏详情
bus.on('ui:show_game_detail', (gameId: string) => {
  const g = installedGames.find(x => x.id === gameId);
  if (g) { lobbyView.showGameDetail(g.name, g.description, g.playerCount, g.id); lobbyView.mount(); showNonHomeView(); }
});

// 回到首页
bus.on('ui:go_home', () => showHome());

// 打开扫描器
bus.on('ui:open_scanner', (cb: (data: unknown) => void) => {
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
showHome();
