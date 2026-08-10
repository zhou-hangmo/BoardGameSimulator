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
import { el } from '../utils/dom';
import { ToastManager } from '../views/ToastView';
import { LobbyView } from '../views/LobbyView';
import { BattleView } from '../views/BattleView';
import { SpectatorView, type SpectateData } from '../views/SpectatorView';
import { KeepAliveView } from '../views/KeepAliveView';
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
const keepAliveView = new KeepAliveView(app);

let transport: WSTransport | null = null;
let myId = '';
let amHost = false;
let currentGameId = '';
let mySeat: number | null = null;   // 我在游戏中的位置（null=观战或大厅）
let inGame = false;
let reconnectCount = 0;
let gameSeatMap: Record<string, number> = {};  // playerId -> 游戏位置（conn_state 映射用）

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
      gameSeatMap = gs.seats;
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
    case 'peer_disconnected': {
      const pd = msg.payload as { playerId: string; notice?: string };
      ToastManager.show(pd.notice ?? '玩家掉线，等待重连…');
      break;
    }
    case 'pong': {
      // 应用层心跳应答，忽略
      break;
    }
    case 'conn_state': {
      const cs = msg.payload as { players: { playerId: string; state: string }[] };
      // 转给当前视图（游戏/观战）——按玩家在游戏中的位置映射
      if (!inGame) break;
      const map: Record<number, string> = {};
      if (currentGameId === 'battleship' && gameSeatMap) {
        for (const p of cs.players) {
          const idx = gameSeatMap[p.playerId];
          if (idx !== undefined) map[idx] = p.state;
        }
      }
      battleView.setConnState(map);
      spectatorView.setConnState(map);
      break;
    }
    case 'kicked': {
      const k = msg.payload as { notice?: string } | undefined;
      transport?.close();
      transport = null;
      document.body.innerHTML = `<div style="display:flex;height:100%;align-items:center;justify-content:center;font-family:sans-serif;color:#888;">${k?.notice ?? '已被移出大厅'}</div>`;
      break;
    }
    case 'error': {
      const e = msg.payload as { message: string };
      ToastManager.show(e.message);
      if (e.message.includes('口令')) {
        // 口令错误：提示输入后重连（本地存储口令，重连自动携带）
        openPasswordDialog((pwd) => {
          try { localStorage.setItem('bgs-pwd', pwd); } catch { /* ignore */ }
          reconnectCount = 0;
          scheduleReconnect();
        });
      }
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
  // 断线恢复：携带持久化 playerId；口令从 URL ?pwd= 或 localStorage
  const saved = localStorage.getItem('bgs-pid') ?? undefined;
  const pwd = params.get('pwd') ?? localStorage.getItem('bgs-pwd') ?? undefined;
  t.register(saved, pwd);
  Logger.log('APP', `已连接 ${WS_URL}${saved ? `（恢复身份 ${saved}）` : ''}`);
}

/** 口令输入弹层（主机设置口令/玩家输入口令共用） */
function openPasswordDialog(onSubmit: (pwd: string) => void): void {
  const prev = document.getElementById('pwd-dialog');
  prev?.remove();
  const mask = el('div', { id: 'pwd-dialog', style: 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;' });
  const panel = el('div', { style: 'background:#fff;border-radius:14px;padding:16px;width:80vw;max-width:320px;' });
  panel.append(el('div', { style: 'font-weight:600;font-size:15px;margin-bottom:10px;' }, ['房间口令']));
  const input = el('input', { style: 'width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #ddd;border-radius:8px;font-size:14px;letter-spacing:2px;' }) as HTMLInputElement;
  input.placeholder = '请输入口令';
  input.maxLength = 8;
  panel.append(input);
  const confirm = el('button', { class: 'btn btn-primary', style: 'width:100%;margin-top:10px;' }, ['确定']);
  confirm.addEventListener('pointerdown', () => {
    const v = input.value.trim();
    if (v) { mask.remove(); onSubmit(v); }
  });
  const cancel = el('button', { class: 'btn btn-secondary', style: 'width:100%;margin-top:8px;' }, ['取消']);
  cancel.addEventListener('pointerdown', () => mask.remove());
  panel.append(confirm, cancel);
  mask.append(panel);
  document.body.append(mask);
  setTimeout(() => input.focus(), 0);
}

// ========== UI 事件 ==========

// 大厅：座位声明
bus.on('ui:set_seat', (wantPlay: boolean) => transport?.setSeat(!!wantPlay));
// 大厅：改名
bus.on('ui:rename', (name: string) => transport?.rename(name));
// 大厅：主机发起游戏
bus.on('ui:start_game', (gameId: string, seats: SeatAssign[]) => transport?.startGame(gameId, seats));
// 大厅：主机踢人
bus.on('ui:kick_player', (playerId: string) => transport?.kickPlayer(String(playerId)));
// 大厅：主机设置/清除口令
bus.on('ui:set_password', () => {
  openPasswordDialog((pwd) => {
    transport?.setPassword(pwd);
    try { localStorage.setItem('bgs-pwd', pwd); } catch { /* ignore */ }
  });
});
// 游戏：动作
bus.on(EVENTS.UI_PLAY_ACTION, (type: string, payload: unknown) => {
  if (!inGame) return;
  transport?.sendAction({ type, playerIndex: mySeat ?? 0, payload, timestamp: Date.now() });
});
// 游戏：主机中止回大厅
bus.on('ui:back_to_lobby', () => transport?.backToLobby());
// 日志
bus.on('ui:show_log', () => logView.show());
// 保活设置引导（App 主机内展示；仅常驻入口触发，不自动弹出）
bus.on('ui:show_keepalive', () => keepAliveView.show());

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
