// ============================================================
// BoardGameSimulator — 大厅连接（WS 客户端）
// 纯连接：register → 收 lobby_state/game_started/game_state/spectate
// 发 set_seat/start_game/action/back_to_lobby
// ============================================================
import type { SeatAssign } from './lobbyTypes';
import type { GameAction } from './types';
import { Logger } from '../utils/Logger';

type MsgCb = (msg: { type: string; payload?: unknown }) => void;

export class WSTransport {
  private ws: WebSocket | null = null;
  private url: string;
  private onMsgCb: MsgCb | null = null;

  constructor(url: string) {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => {
        Logger.log('WS', `connected ${this.url}`);
        resolve();
      };
      ws.onerror = () => reject(new Error(`连接失败: ${this.url}`));
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        Logger.log('WS', 'closed');
        this.onMsgCb?.({ type: 'closed' });
      };
      ws.onmessage = (e) => {
        let msg: { type: string; payload?: unknown };
        try { msg = JSON.parse(e.data as string); } catch { return; }
        this.onMsgCb?.(msg);
      };
    });
  }

  register(name?: string): void { this.post({ type: 'register', name }); }
  rename(name: string): void { this.post({ type: 'rename', name }); }
  setSeat(wantPlay: boolean): void { this.post({ type: 'set_seat', wantPlay }); }
  startGame(gameId: string, seats: SeatAssign[]): void { this.post({ type: 'start_game', gameId, seats }); }
  sendAction(action: GameAction): void { this.post({ type: 'action', payload: action }); }
  backToLobby(): void { this.post({ type: 'back_to_lobby' }); }

  onMessage(cb: MsgCb): void { this.onMsgCb = cb; }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }

  private post(msg: unknown): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      Logger.log('WS', `post 跳过 (state=${this.ws?.readyState})`);
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }
}
