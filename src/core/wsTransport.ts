// ============================================================
// BoardGameSimulator — WS 传输层（方案A：设备当服务器）
// 与 TestP2P 同款公开接口：浏览器侧改动面最小
// host/guest 都主动出站连接本地/远端 ws 转发服务器
// ============================================================
import type { GameAction, PlayerView, ErrorResponse } from './types';
import { Logger } from '../utils/Logger';

type MsgCb = (fromPeerId: string, data: unknown) => void;

export const WS_ROOM = 'WS';
const WS_PID = 'player-1';

export class WSTransport {
  private ws: WebSocket | null = null;
  private role: 'host' | 'guest';
  private url: string;
  private joined = false;                  // host 侧：guest 是否已接入
  private onActionCb: ((action: GameAction) => void) | null = null;
  private onMsgCb: MsgCb | null = null;
  private onAnswerCb: ((answerJson: string) => void) | null = null;

  constructor(role: 'host' | 'guest', url: string) {
    this.role = role;
    this.url = url;
  }

  // ---------- 连接 ----------

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'register', role: this.role }));
        Logger.log('WS', `${this.role} connected ${this.url}`);
        resolve();
      };
      ws.onerror = () => reject(new Error(`ws 连接失败: ${this.url}`));
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        Logger.log('WS', `${this.role} closed`);
      };
      ws.onmessage = (e) => {
        let msg: { type: string; payload: unknown; from?: string };
        try { msg = JSON.parse(e.data as string); } catch { return; }
        if (this.role === 'host' && msg.type === 'answer' && !this.joined) {
          this.joined = true;
          this.onAnswerCb?.(JSON.stringify(msg.payload ?? msg));
        }
        if (msg.type === 'action') this.onActionCb?.(msg.payload as GameAction);
        this.onMsgCb?.(msg.from ?? WS_PID, msg);
      };
    });
  }

  onAnswer(cb: (answerJson: string) => void): void { this.onAnswerCb = cb; }

  // ---------- 房间管理（与 P2PManager/TestP2P 同签名） ----------

  async createRoom(): Promise<string> {
    await this.connect();
    return WS_ROOM;
  }

  async getHostQrImage(): Promise<string> { return ''; }

  async acceptGuestAnswer(_answerJson: string): Promise<string> {
    this.joined = true;
    return WS_PID;
  }

  async joinFromOffer(_offerJson: string): Promise<string> {
    await this.connect();
    // 通知 host：guest 已接入（模拟扫码 answer）
    this.post('host', 'answer', { t: 'answer', rc: WS_ROOM, guestId: WS_PID });
    return WS_ROOM;
  }

  async getGuestQrImage(): Promise<string> { return ''; }

  async shareRoom(): Promise<string> { return ''; }

  // ---------- 消息收发（与 TestP2P 同语义） ----------

  sendAction(action: GameAction): void { this.broadcastRaw('action', action); }

  sendPlayerView(peerId: string, view: PlayerView): void { this.sendRaw(peerId, 'state', view); }

  sendError(peerId: string, error: ErrorResponse): void { this.sendRaw(peerId, 'error', error); }

  sendRaw(peerId: string, type: string, payload: unknown): void {
    this.post(peerId === WS_PID ? 'guest' : peerId, type, payload);
  }

  broadcastRaw(type: string, payload: unknown): void {
    this.post('all', type, payload);
  }

  onAction(cb: (action: GameAction) => void): void { this.onActionCb = cb; }
  onMessage(cb: MsgCb): void { this.onMsgCb = cb; }

  getPeerIds(): string[] { return this.role === 'host' && this.joined ? [WS_PID] : []; }
  getPeerCount(): number { return this.role === 'host' && this.joined ? 1 : 0; }
  getRoomCode(): string { return WS_ROOM; }

  async waitForDcOpen(_peerId: string, _timeoutMs = 10000): Promise<boolean> {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  leave(): void {
    this.ws?.close();
    this.ws = null;
    this.joined = false;
  }

  // ---------- 内部 ----------

  private post(to: string, type: string, payload: unknown): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      Logger.log('WS', `post 跳过 (state=${this.ws?.readyState}), type=${type}`);
      return;
    }
    this.ws.send(JSON.stringify({ to, from: this.role === 'host' ? 'host' : WS_PID, type, payload }));
  }
}
