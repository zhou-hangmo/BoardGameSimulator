// P2P Manager — QR-based SDP exchange
import type { GameAction, PlayerView, ErrorResponse } from './types';
import { hostCreateOffer, hostAcceptAnswer, guestCreateAnswer, extractFields, sendJson, type Connection, type SdpFields } from './webrtc';
import { encodeQR } from './qrcode';
import { Logger } from '../utils/Logger';

type MsgCb = (fromPeerId: string, data: unknown) => void;

export class P2PManager {
  private conns = new Map<string, Connection>();
  private roomCode: string = '';
  private hostFields: SdpFields | null = null;
  private guestFields: SdpFields | null = null;
  private peerIdx = 0;
  private onActionCb: ((action: GameAction) => void) | null = null;
  private onMsgCb: MsgCb | null = null;

  async createRoom(): Promise<string> {
    this.roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    const conn = await hostCreateOffer(this.roomCode, (_c, data) => this.handleIncoming('guest', data));
    this.conns.set('_pending', conn);
    this.hostFields = extractFields(conn.pc.localDescription!.sdp!);
    return this.roomCode;
  }

  async acceptGuestAnswer(answerQrJson: string): Promise<string> {
    const flat = JSON.parse(answerQrJson);
    if (flat.rc !== this.roomCode) throw new Error('房间码不匹配');
    await hostAcceptAnswer(this.roomCode, flat);
    this.peerIdx++;
    const pid = `player-${this.peerIdx}`;
    const conn = this.conns.get('_pending');
    if (conn) this.conns.set(pid, conn);
    this.conns.delete('_pending');
    const next = await hostCreateOffer(this.roomCode, (_c, d) => this.handleIncoming('guest', d));
    this.conns.set('_pending', next);
    this.hostFields = extractFields(next.pc.localDescription!.sdp!);
    return pid;
  }

  async getHostQrImage(): Promise<string> {
    return encodeQR({ t: 'offer', rc: this.roomCode, ...this.hostFields } as any);
  }

  /** 调试/自动化用：host 侧 offer 字段 JSON（与 QR 内容一致） */
  getHostOfferJson(): string {
    return JSON.stringify({ t: 'offer', rc: this.roomCode, ...this.hostFields });
  }

  /** 调试/自动化用：guest 侧 answer 字段 JSON（与 QR 内容一致） */
  getGuestAnswerJson(): string {
    return JSON.stringify({ t: 'answer', rc: this.roomCode, ...this.guestFields });
  }

  async joinFromOffer(offerQrJson: string): Promise<string> {
    const flat = JSON.parse(offerQrJson);
    this.roomCode = flat.rc;
    const conn = await guestCreateAnswer(flat, (_c, d) => this.handleIncoming('host', d));
    this.conns.set('host', conn);
    this.guestFields = extractFields(conn.pc.localDescription!.sdp!);
    return this.roomCode;
  }

  async getGuestQrImage(): Promise<string> {
    return encodeQR({ t: 'answer', rc: this.roomCode, ...this.guestFields } as any);
  }

  sendAction(action: GameAction) { this.broadcastRaw('action', action); }
  sendPlayerView(peerId: string, view: PlayerView) { this.sendRaw(peerId, 'state', view); }
  sendError(peerId: string, error: ErrorResponse) { this.sendRaw(peerId, 'error', error); }

  sendRaw(peerId: string, type: string, payload: unknown) {
    const conn = this.conns.get(peerId);
    if (conn?.dc?.readyState === 'open') sendJson(conn, { type, payload });
    else Logger.log('P2P', `sendRaw(${peerId}) blocked: dc=${conn?.dc?.readyState || 'nonexistent'}, type=${type}`);
  }

  broadcastRaw(type: string, payload: unknown) {
    for (const [, conn] of this.conns) sendJson(conn, { type, payload });
  }

  onAction(cb: (action: GameAction) => void) { this.onActionCb = cb; }
  onMessage(cb: MsgCb) { this.onMsgCb = cb; }
  getPeerIds(): string[] { return Array.from(this.conns.keys()).filter(k => k !== 'host' && k !== '_pending'); }
  getPeerCount(): number { return this.peerIdx; }
  getRoomCode(): string { return this.roomCode; }

  async shareRoom(): Promise<string> {
    return encodeQR({ t: 'offer', rc: this.roomCode, ...this.hostFields } as any);
  }

  async waitForDcOpen(peerId: string, timeoutMs = 10000): Promise<boolean> {
    const conn = this.conns.get(peerId);
    if (!conn) { Logger.log('P2P', `waitForDcOpen(${peerId}): conn not found`); return false; }
    if (conn.dc?.readyState === 'open') { Logger.log('P2P', `waitForDcOpen(${peerId}): already open`); return true; }
    Logger.log('P2P', `waitForDcOpen(${peerId}): waiting (timeout=${timeoutMs}ms)...`);
    const start = Date.now();
    return new Promise(resolve => {
      const onOpen = () => { Logger.log('P2P', `waitForDcOpen(${peerId}): ✅ opened after ${Date.now() - start}ms`); resolve(true); };
      const timer = setTimeout(() => { Logger.log('P2P', `waitForDcOpen(${peerId}): ❌ timeout after ${Date.now() - start}ms`); resolve(false); }, timeoutMs);
      const prev = conn.onDcOpen;
      conn.onDcOpen = () => { clearTimeout(timer); prev?.(); onOpen(); };
    });
  }

  leave() {
    for (const [, conn] of this.conns) conn.pc.close();
    this.conns.clear();
    this.peerIdx = 0;
    this.hostFields = null;
    this.guestFields = null;
  }

  private handleIncoming(peerId: string, data: unknown) {
    const msg = data as { type: string; payload: unknown };
    if (msg.type === 'action') this.onActionCb?.(msg.payload as GameAction);
    this.onMsgCb?.(peerId, msg);
  }
}
