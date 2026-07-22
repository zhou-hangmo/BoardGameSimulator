// ============================================================
// BoardGameSimulator — Client MVP
// ============================================================
import { GameEngine } from '../core/engine';
import { P2PManager } from '../core/p2p';
import { Renderer, type GameMeta } from './renderer';
import type { GameState, GameAction, GameConfig, PlayerView } from '../core/types';
import doudizhuConfig from '../games/doudizhu/config.json';
import { StateBackup } from '../core/backup';
import { HostMigration } from '../core/migration';

const renderer = new Renderer(document.getElementById('app')!);
const p2p = new P2PManager();
const backup = new StateBackup();
const migration = new HostMigration(backup);
let engine: GameEngine | null = null;
let myIdx = 0;
let isHost = false;
let room = '';
const DEV_MODE = false;

const installedGames: GameMeta[] = [{
  id: 'doudizhu', name: '斗地主', description: '经典三人扑克',
  playerCount: '3', cardCount: 54, tags: ['卡牌', '回合制'], ready: true,
  config: doudizhuConfig as GameConfig
}];

// ── Host: broadcast game state to all peers ──
function broadcastGame() {
  if (!engine || !isHost) return;
  const state = engine.getState();
  // Backup to all peers
  backup.setTransport((pid, data) => p2p.sendRaw(pid, (data as any).type, (data as any).payload));
  backup.broadcast(p2p.getPeerIds(), state);
  // Send player views
  for (let i = 0; i < state.players.length; i++) {
    const v = engine.buildPlayerView(i);
    if (i === 0) renderer.showGame(v);
    else {
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

  // ── HOST: Create Room ──
  onCreateRoom: async (gameId: string) => {
    const g = installedGames.find(x => x.id === gameId);
    if (!g?.config || !(g.config as GameConfig).meta) { renderer.showToast('配置加载中，请稍后'); return ''; }
    await p2p.init();
    room = await p2p.createRoom();
    isHost = true; myIdx = 0;
    migration.setup({
      myPeerId: 'host', isHost: true, peers: [],
      broadcast: (d) => p2p.broadcastToAll(d as any),
      sendTo: (pid, d) => p2p.sendRaw(pid, (d as any).type, (d as any).payload),
      onBecomeHost: (state) => { engine?.loadState(state); broadcastGame(); },
      election: (peers) => peers[0],
    });
    const s0: GameState = { version: 0, players: [], deck: [], discard: [], bottomCards: [], landlordIndex: -1, currentTurn: 0, phase: 'idle', lastPlay: null, passCount: 0, winner: null };
    engine = new GameEngine(s0);
    const errs = engine.loadGame(g.config as GameConfig);
    if (errs.filter(e => e.level === 'error').length > 0) {
      console.error('Config errors:', errs);
      renderer.showToast('游戏配置校验失败');
      return '';
    }

    // Host receives actions from peers
    p2p.onAction(async (action: GameAction) => {
      if (!engine || !isHost) return;
      const err = await engine.dispatch(action);
      if (err) {
        const pid = p2p.getPeerIds()[action.playerIndex - 1];
        if (pid) p2p.sendError(pid, err);
        return;
      }
      broadcastGame();
    });

    // Player tracking
    const players: { name: string; isHost: boolean }[] = [{ name: '你', isHost: true }];
    if (DEV_MODE) {
      players.push({ name: '玩家 2', isHost: false }, { name: '玩家 3', isHost: false });
    }
    renderer.showLobby(room, players);

    p2p.onPlayerJoin((peerId: string) => {
      const idx = p2p.getPeerIds().indexOf(peerId) + 1;
      players.push({ name: `玩家 ${idx}`, isHost: false });
      renderer.showLobby(room, players);
      p2p.sendRaw(peerId, 'assign', { playerIndex: idx });
      // Notify all peers of updated player list
      p2p.broadcastRaw('lobby', { players });
    });

    p2p.onPlayerLeave((peerId: string) => {
      const idx = p2p.getPeerIds().indexOf(peerId);
      if (idx >= 0) { players.splice(idx + 1, 1); renderer.showLobby(room, players); }
      p2p.broadcastRaw('lobby', { players });
    });

    return room;
  },

  // ── HOST: Start Game ──
  onStartGame: () => {
    if (!engine || !isHost) return;
    engine.startGame();
    broadcastGame();
  },

  // ── JOINER: Join Room ──
  onJoinRoom: async (code: string) => {
    await p2p.init();
    isHost = false; room = code;
    renderer.showWaitRoom(code, [{ name: '主持人', isHost: true }, { name: '你', isHost: false }]);

    // Joiner listens for state updates from host
    
    p2p.onMessage((_peerId, data) => {
      const d = data as { type: string; payload: unknown };
      if (d.type === 'assign') {
        myIdx = (d.payload as { playerIndex: number }).playerIndex;
        renderer.showToast(`你已加入 - 位置 ${myIdx}`);
      } else if (d.type === 'lobby') {
        const plist = (d.payload as { players: { name: string; isHost: boolean }[] }).players;
        if (plist) renderer.showWaitRoom(code, plist);
      } else if (d.type === 'state') {
        renderer.showGame(d.payload as PlayerView);
      } else if (d.type === 'error') {
        renderer.showToast(`无效操作`);
      }
    });

    await p2p.joinRoom(code);
    renderer.showToast('已连接，等待主持人开局');
  },

  // ── ANY PLAYER: Action ──
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
    if (!engine) return "";
    const { encodeQR } = await import("../core/qrcode");
    return encodeQR({ roomCode: "save", peerId: "save", sdp: JSON.stringify(engine.getState()) });
  },
  onLoadGame: (data: string) => {
    try {
      const state = JSON.parse(data);
      if (!state.players) { renderer.showToast("无效存档"); return; }
      engine = new GameEngine(state);
      isHost = true; myIdx = 0;
      renderer.showGame(engine.buildPlayerView(0));
      renderer.showToast("棋局已恢复");
    } catch { renderer.showToast("存档损坏"); }
  },
  onLeaveRoom: () => { p2p.leave(); engine?.destroy(); engine = null; isHost = false; myIdx = 0; room = ''; backup.clear(); },
});
