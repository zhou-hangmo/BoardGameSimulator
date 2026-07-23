// P2P Manager — QR-based SDP exchange
import type { GameAction, PlayerView, ErrorResponse } from './types';
import { hostCreateOffer, hostAcceptAnswer, guestCreateAnswer, sendJson, type Connection } from './webrtc';
import { encodeQR } from './qrcode';

type MsgCb = (fromPeerId: string, data: unknown) => void;

export class P2PManager {
  private conns = new Map<string, Connection>(); // peerId → connection
  private roomCode: string = '';
  private hostOfferConn: Connection | null = null;
  private qrOffer: string = '';
  private qrAnswer: string = '';
  private peerIdx = 0;
  private onActionCb: ((action: GameAction) => void) | null = null;
  private onMsgCb: MsgCb | null = null;
  private onPeerJoinCb: ((id: string) => void) | null = null;

  // ─── Host ───

  async createRoom(): Promise<{ roomCode: string; offerQr: string }> {
    this.roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    this.hostOfferConn = await hostCreateOffer(this.roomCode, (conn, data) => {
      this.handleIncoming(conn.peerId, data);
    });
    this.qrOffer = JSON.stringify({
      roomCode: this.roomCode,
      sdp: JSON.stringify(this.hostOfferConn.pc.localDescription),
    });
    return { roomCode: this.roomCode, offerQr: this.qrOffer };
  }

  async acceptGuestAnswer(answerQrData: string): Promise<string> {
    const data = JSON.parse(answerQrData) as { roomCode: string; sdp: string };
    if (data.roomCode !== this.roomCode) throw new Error('房间码不匹配');
    await hostAcceptAnswer(this.roomCode, data.sdp);
    this.peerIdx++;
    const pid = `player-${this.peerIdx}`;
    // Store the host conn with the guest's peer id
    this.conns.set(pid, this.hostOfferConn!);
    this.onPeerJoinCb?.(pid);
    // Re-create offer for next guest
    this.hostOfferConn = await hostCreateOffer(this.roomCode, (conn, data) => {
      this.handleIncoming(conn.peerId, data);
    });
    this.qrOffer = JSON.stringify({
      roomCode: this.roomCode,
      sdp: JSON.stringify(this.hostOfferConn.pc.localDescription),
    });
    return pid;
  }

  getQrOfferData(): string { return this.qrOffer; }

  async getQrOfferImage(): Promise<string> {
    return encodeQR({ roomCode: this.roomCode, sdp: this.qrOffer, peerId: 'host' });
  }

  // ─── Guest ───

  async joinFromOffer(offerQrData: string): Promise<string> {
    const data = JSON.parse(offerQrData) as { roomCode: string; sdp: string };
    this.roomCode = data.roomCode;
    const conn = await guestCreateAnswer(data.sdp, (c, d) => {
      this.handleIncoming(c.peerId, d);
    });
    this.conns.set('host', conn);
    this.qrAnswer = JSON.stringify({
      roomCode: this.roomCode,
      sdp: JSON.stringify(conn.pc.localDescription),
    });
    return this.qrAnswer;
  }

  getQrAnswerData(): string { return this.qrAnswer; }

  async getQrAnswerImage(): Promise<string> {
    return encodeQR({ roomCode: this.roomCode, sdp: this.qrAnswer, peerId: 'guest' });
  }

  // ─── Messaging ───

  sendAction(action: GameAction) {
    this.broadcastRaw('action', action);
  }

  sendPlayerView(peerId: string, view: PlayerView) {
    this.sendRaw(peerId, 'state', view);
  }

  sendError(peerId: string, error: ErrorResponse) {
    this.sendRaw(peerId, 'error', error);
  }

  sendRaw(peerId: string, type: string, payload: unknown) {
    const conn = this.conns.get(peerId);
    if (conn) sendJson(conn, { type, payload });
  }

  broadcastRaw(type: string, payload: unknown) {
    for (const [, conn] of this.conns) {
      sendJson(conn, { type, payload });
    }
  }

  // ─── Events ───

  onAction(cb: (action: GameAction) => void) { this.onActionCb = cb; }
  onMessage(cb: MsgCb) { this.onMsgCb = cb; }
  onPlayerJoin(cb: (id: string) => void) { this.onPeerJoinCb = cb; }

  getPeerIds(): string[] { return Array.from(this.conns.keys()).filter(k => k !== 'host'); }
  getPeerCount(): number { return this.peerIdx; }
  getRoomCode(): string { return this.roomCode; }

  async shareRoom(): Promise<string> {
    return encodeQR({ roomCode: this.roomCode, sdp: this.qrOffer, peerId: 'host' });
  }

  leave() {
    for (const [, conn] of this.conns) conn.pc.close();
    this.conns.clear();
    this.peerIdx = 0;
    this.qrOffer = '';
    this.qrAnswer = '';
    this.hostOfferConn = null;
  }

  private handleIncoming(peerId: string, data: unknown) {
    const msg = data as { type: string; payload: unknown };
    if (msg.type === 'action') this.onActionCb?.(msg.payload as GameAction);
    this.onMsgCb?.(peerId, msg);
  }
}
