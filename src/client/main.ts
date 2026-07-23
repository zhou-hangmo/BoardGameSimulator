// ============================================================
// BoardGameSimulator — Client MVP (QR dual-scan P2P)
// ============================================================
import { GameEngine } from '../core/engine';
import { P2PManager } from '../core/p2p';
import { Renderer, type GameMeta } from './renderer';
import type { GameState, GameAction, GameConfig, PlayerView } from '../core/types';
import doudizhuConfig from '../games/doudizhu/config.json';

const renderer = new Renderer(document.getElementById('app')!);
const p2p = new P2PManager();
let engine: GameEngine | null = null;
let myIdx = 0;
let isHost = false;
let room = '';

const installedGames: GameMeta[] = [{
  id: 'doudizhu', name: '斗地主', description: '经典三人扑克',
  playerCount: '3', cardCount: 54, tags: ['卡牌', '回合制'], ready: true,
  config: doudizhuConfig as GameConfig
}];

function broadcastGame() {
  if (!engine || !isHost) return;
  const state = engine.getState();
  for (let i = 0; i < state.players.length; i++) {
    const v = engine.buildPlayerView(i);
    if (i === 0) {
      renderer.showGame(v);
    } else {
      const pid = p2p.getPeerIds()[i - 1];
      if (pid) p2p.sendPlayerView(pid, v);
    }
  }
}

renderer.init({
  installedGames,

  onImportGame: async () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
    input.onchange = async () => {
      const f = input.files?.[0]; if (!f) return;
      try {
        const cfg = JSON.parse(await f.text()) as GameConfig;
        installedGames.push({ id: cfg.meta.name, name: cfg.meta.name, description: f.name, playerCount: String(cfg.meta.maxPlayers), tags: ['导入'], ready: true, config: cfg });
        renderer.showToast('导入成功'); renderer.showHomeLibrary();
      } catch { renderer.showToast('JSON 格式错误'); }
    };
    input.click();
  },

  // ── HOST: Create Room → QR with SDP offer ──
  onCreateRoom: async (gameId: string) => {
    const g = installedGames.find(x => x.id === gameId);
    if (!g?.config) { renderer.showToast('配置加载中'); return ''; }
    isHost = true; myIdx = 0;

    const { roomCode } = await p2p.createRoom();
    room = roomCode;

    // Init engine
    const s0: GameState = { version: 0, players: [], deck: [], discard: [], bottomCards: [], landlordIndex: -1, currentTurn: 0, phase: 'idle', lastPlay: null, passCount: 0, winner: null };
    engine = new GameEngine(s0);
    const errs = engine.loadGame(g.config as GameConfig);
    if (errs.filter(e => e.level === 'error').length > 0) {
      console.error('Config errors:', errs);
      renderer.showToast('游戏配置校验失败');
      return '';
    }

    const players: { name: string; isHost: boolean }[] = [{ name: '你', isHost: true }];
    const qrImg = await p2p.getQrOfferImage();
    renderer.showLobby(room, players, qrImg);

    // Host handles actions from connected guests
    p2p.onAction(async (action: GameAction) => {
      if (!engine) return;
      const err = await engine.dispatch(action);
      if (err) {
        const pid = p2p.getPeerIds()[action.playerIndex - 1];
        if (pid) p2p.sendError(pid, err);
        return;
      }
      broadcastGame();
    });

    // Host scans guest's QR to complete handshake
    p2p.onPlayerJoin((peerId: string) => {
      const idx = p2p.getPeerIds().indexOf(peerId) + 1;
      players.push({ name: `玩家 ${idx}`, isHost: false });
      renderer.showLobby(room, players, qrImg);
    });

    return room;
  },

  // ── HOST: Start Game ──
  onStartGame: () => {
    if (!engine || !isHost) return;
    engine.startGame();
    broadcastGame();
  },

  // ── GUEST: Scan host QR → create answer QR ──
  onJoinRoom: async (qrData: string) => {
    isHost = false; myIdx = 0;
    try {
      await p2p.joinFromOffer(qrData);
      room = p2p.getRoomCode();
      const answerImg = await p2p.getQrAnswerImage();
      renderer.showGuestQr(room, answerImg);

      // Guest listens for state updates
      p2p.onMessage((_peerId, data) => {
        const d = data as { type: string; payload: unknown };
        if (d.type === 'state') {
          const view = d.payload as PlayerView;
          myIdx = view.playerIndex;
          renderer.showGame(view);
        } else if (d.type === 'error') {
          renderer.showToast('无效操作');
        }
      });

    } catch {
      renderer.showToast('加入失败，请检查二维码');
    }
  },

  // ── HOST: Scan guest's answer QR ──
  onScanGuestQr: async (qrData: string) => {
    try {
      await p2p.acceptGuestAnswer(qrData);
      renderer.showToast('玩家已连接');
    } catch { renderer.showToast('连接失败'); }
  },

  // ── ANY: Action ──
  onPlayAction: (type: string, payload: unknown) => {
    if (isHost) {
      engine?.dispatch({ type, playerIndex: myIdx, payload, timestamp: Date.now() }).then(() => broadcastGame());
    } else {
      p2p.sendAction({ type, playerIndex: myIdx, payload, timestamp: Date.now() });
    }
  },

  onShareRoom: async () => {
    const qr = await p2p.shareRoom();
    if (qr) renderer.showToast('已复制/分享');
    else renderer.showToast('分享失败');
  },

  onSaveGame: async () => {
    if (!engine) return '';
    const { encodeQR } = await import('../core/qrcode');
    return encodeQR({ roomCode: 'save', sdp: JSON.stringify(engine.getState()), peerId: 'save' });
  },
  onLoadGame: (data: string) => {
    try {
      const state = JSON.parse(data);
      if (!state.players) { renderer.showToast('无效存档'); return; }
      engine = new GameEngine(state);
      isHost = true; myIdx = 0;
      renderer.showGame(engine.buildPlayerView(0));
      renderer.showToast('棋局已恢复');
    } catch { renderer.showToast('存档损坏'); }
  },
  onLeaveRoom: () => { p2p.leave(); engine?.destroy(); engine = null; isHost = false; myIdx = 0; room = ''; },
});
