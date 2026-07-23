// P2P Manager — QR-based SDP exchange
import type { GameAction, PlayerView, ErrorResponse } from './types';
import { hostCreateOffer, hostAcceptAnswer, guestCreateAnswer, sendJson, type Connection } from './webrtc';
import { encodeQR, type SignalingData } from './qrcode';

type MsgCb = (fromPeerId: string, data: unknown) => void;

export class P2PManager {
  private conns = new Map<string, Connection>();
  private roomCode: string = '';
  private hostOfferSdp: string = '';
  private guestAnswerSdp: string = '';
  private peerIdx = 0;
  private onActionCb: ((action: GameAction) => void) | null = null;
  private onMsgCb: MsgCb | null = null;
  private onPeerJoinCb: ((id: string) => void) | null = null;

  // ─── Host ───

  async createRoom(): Promise<string> {
    this.roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    const conn = await hostCreateOffer(this.roomCode, (_c, data) => this.handleIncoming('guest', data));
    this.conns.set('_pending', conn);
    this.hostOfferSdp = JSON.stringify(conn.pc.localDescription!);
    return this.roomCode;
  }

  async acceptGuestAnswer(answerQrData: string): Promise<string> {
    const data = JSON.parse(answerQrData) as SignalingData;
    if (data.roomCode !== this.roomCode) throw new Error('房间码不匹配');
    await hostAcceptAnswer(this.roomCode, data.sdp!);
    this.peerIdx++;
    const pid = `player-${this.peerIdx}`;
    const conn = this.conns.get('_pending');
    if (conn) this.conns.set(pid, conn);
    this.conns.delete('_pending');
    this.onPeerJoinCb?.(pid);
    // Pre-create next offer for multi-guest
    const next = await hostCreateOffer(this.roomCode, (_c, d) => this.handleIncoming('guest', d));
    this.conns.set('_pending', next);
    this.hostOfferSdp = JSON.stringify(next.pc.localDescription!);
    return pid;
  }

  async getHostQrImage(): Promise<string> {
    return encodeQR({ type: 'offer', roomCode: this.roomCode, sdp: this.hostOfferSdp, peerId: 'host' });
  }

  // ─── Guest ───

  async joinFromOffer(offerQrData: string): Promise<string> {
    const sig = JSON.parse(offerQrData) as SignalingData;
    this.roomCode = sig.roomCode;
    const conn = await guestCreateAnswer(sig.sdp!, (_c, d) => this.handleIncoming('host', d));
    this.conns.set('host', conn);
    this.guestAnswerSdp = JSON.stringify(conn.pc.localDescription!);
    return this.roomCode;
  }

  async getGuestQrImage(): Promise<string> {
    return encodeQR({ type: 'answer', roomCode: this.roomCode, sdp: this.guestAnswerSdp, peerId: 'guest' });
  }

  // ─── Messaging ───

  sendAction(action: GameAction) { this.broadcastRaw('action', action); }
  sendPlayerView(peerId: string, view: PlayerView) { this.sendRaw(peerId, 'state', view); }
  sendError(peerId: string, error: ErrorResponse) { this.sendRaw(peerId, 'error', error); }

  sendRaw(peerId: string, type: string, payload: unknown) {
    const conn = this.conns.get(peerId);
    if (conn) sendJson(conn, { type, payload });
  }

  broadcastRaw(type: string, payload: unknown) {
    for (const [, conn] of this.conns) sendJson(conn, { type, payload });
  }

  onAction(cb: (action: GameAction) => void) { this.onActionCb = cb; }
  onMessage(cb: MsgCb) { this.onMsgCb = cb; }
  onPlayerJoin(cb: (id: string) => void) { this.onPeerJoinCb = cb; }
  getPeerIds(): string[] { return Array.from(this.conns.keys()).filter(k => k !== 'host' && k !== '_pending'); }
  getPeerCount(): number { return this.peerIdx; }
  getRoomCode(): string { return this.roomCode; }

  async shareRoom(): Promise<string> {
    return encodeQR({ type: 'offer', roomCode: this.roomCode, sdp: this.hostOfferSdp, peerId: 'host' });
  }

  leave() {
    for (const [, conn] of this.conns) conn.pc.close();
    this.conns.clear();
    this.peerIdx = 0;
    this.hostOfferSdp = '';
    this.guestAnswerSdp = '';
  }

  private handleIncoming(peerId: string, data: unknown) {
    const msg = data as { type: string; payload: unknown };
    if (msg.type === 'action') this.onActionCb?.(msg.payload as GameAction);
    this.onMsgCb?.(peerId, msg);
  }
}
