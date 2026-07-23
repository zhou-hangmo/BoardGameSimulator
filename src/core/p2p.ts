// P2P Manager — QR-based SDP exchange
import type { GameAction, PlayerView, ErrorResponse } from './types';
import { hostCreateOffer, hostAcceptAnswer, guestCreateAnswer, extractFields, sendJson, type Connection, type SdpFields } from './webrtc';
import { encodeQR } from './qrcode';

type MsgCb = (fromPeerId: string, data: unknown) => void;

export class P2PManager {
  private conns = new Map<string, Connection>();
  private roomCode: string = '';
  private hostFields: SdpFields | null = null;
  private guestFields: SdpFields | null = null;
  private peerIdx = 0;
  private onActionCb: ((action: GameAction) => void) | null = null;
  private onMsgCb: MsgCb | null = null;
  private onPeerJoinCb: ((id: string) => void) | null = null;

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
    this.onPeerJoinCb?.(pid);
    const next = await hostCreateOffer(this.roomCode, (_c, d) => this.handleIncoming('guest', d));
    this.conns.set('_pending', next);
    this.hostFields = extractFields(next.pc.localDescription!.sdp!);
    return pid;
  }

  async getHostQrImage(): Promise<string> {
    return encodeQR({ t: 'offer', rc: this.roomCode, ...this.hostFields } as any);
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
    return encodeQR({ t: 'offer', rc: this.roomCode, ...this.hostFields } as any);
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
