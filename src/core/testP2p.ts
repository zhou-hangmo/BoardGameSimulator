// ============================================================
// BoardGameSimulator — 测试模式假传输（BroadcastChannel 驱动）
// 与 P2PManager 同款公开 API，仅在 dev 测试模式使用。
// 消息格式：{ to, from, type, payload }，to ∈ 'host' | guestId | 'all'
// ============================================================

import type { GameAction, PlayerView, ErrorResponse } from './types';
import { Logger } from '../utils/Logger';

type MsgCb = (fromPeerId: string, data: unknown) => void;

interface ChannelMsg {
  to: string;
  from: string;
  type: string;
  payload: unknown;
}

export const TEST_ROOM_CODE = '000000';

const OFFER_KEY = 'bgs-test-offer';
const POLL_MS = 400;

export class TestP2P {
  private channel: BroadcastChannel;
  private role: 'host' | 'guest';
  private guestId = `guest-${Math.random().toString(36).slice(2, 8)}`;
  private roomCode = '';
  private guests = new Map<string, unknown>(); // host 侧：guestId -> answer
  private joinSeq = 0;                          // host 侧：加入序号
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private onActionCb: ((action: GameAction) => void) | null = null;
  private onMsgCb: MsgCb | null = null;
  private onOfferCb: ((offerJson: string) => void) | null = null;
  private onAnswerCb: ((answerJson: string) => void) | null = null;

  constructor(role: 'host' | 'guest') {
    this.role = role;
    this.channel = new BroadcastChannel('bgs-test');
    this.channel.onmessage = (e: MessageEvent<ChannelMsg>) => this.handleMessage(e.data);
    if (role === 'guest') this.startOfferPoll();
  }

  /** guest 后开时，通过 localStorage 轮询发现 host 写入的 offer */
  private startOfferPoll(): void {
    if (typeof localStorage === 'undefined') return;
    this.pollTimer = setInterval(() => {
      if (this.roomCode) return;
      const raw = localStorage.getItem(OFFER_KEY);
      if (!raw) return;
      try {
        const payload = JSON.parse(raw) as { rc: string };
        this.onOfferCb?.(JSON.stringify(payload));
      } catch { /* 忽略损坏数据 */ }
    }, POLL_MS);
  }

  // ---------- 自动连接注册口 ----------

  onOffer(cb: (offerJson: string) => void): void { this.onOfferCb = cb; }
  onAnswer(cb: (answerJson: string) => void): void { this.onAnswerCb = cb; }

  // ---------- 房间管理（同 P2PManager） ----------

  async createRoom(): Promise<string> {
    this.roomCode = TEST_ROOM_CODE;
    Logger.log('TEST', `createRoom: ${TEST_ROOM_CODE} (BroadcastChannel)`);
    const offer = { t: 'offer', rc: this.roomCode, test: true };
    this.post('all', 'offer', offer);
    try {
      localStorage.setItem(OFFER_KEY, JSON.stringify(offer));
    } catch { /* 无 localStorage 环境（测试）跳过 */ }
    return this.roomCode;
  }

  async getHostQrImage(): Promise<string> { return ''; }

  async acceptGuestAnswer(answerJson: string): Promise<string> {
    const flat = JSON.parse(answerJson) as { guestId: string; rc: string };
    if (flat.rc !== this.roomCode) throw new Error('房间码不匹配');
    const pid = flat.guestId;
    this.guests.set(pid, flat);
    this.joinSeq++;
    Logger.log('TEST', `acceptGuestAnswer: pid=${pid} order=${this.joinSeq}`);
    return pid;
  }

  async joinFromOffer(offerJson: string): Promise<string> {
    const flat = JSON.parse(offerJson) as { rc: string };
    this.roomCode = flat.rc;
    Logger.log('TEST', `joinFromOffer: room=${this.roomCode} guestId=${this.guestId}`);
    this.post('host', 'answer', { t: 'answer', rc: this.roomCode, test: true, guestId: this.guestId });
    return this.roomCode;
  }

  async getGuestQrImage(): Promise<string> { return ''; }

  // ---------- 消息收发 ----------

  sendAction(action: GameAction): void { this.broadcastRaw('action', action); }

  sendPlayerView(peerId: string, view: PlayerView): void { this.sendRaw(peerId, 'state', view); }

  sendError(peerId: string, error: ErrorResponse): void { this.sendRaw(peerId, 'error', error); }

  sendRaw(peerId: string, type: string, payload: unknown): void {
    this.post(this.role === 'host' ? peerId : 'host', type, payload);
  }

  broadcastRaw(type: string, payload: unknown): void {
    this.post(this.role === 'guest' ? 'host' : 'all', type, payload);
  }

  onAction(cb: (action: GameAction) => void): void { this.onActionCb = cb; }
  onMessage(cb: MsgCb): void { this.onMsgCb = cb; }

  getPeerIds(): string[] {
    return this.role === 'host' ? Array.from(this.guests.keys()) : [];
  }

  getPeerCount(): number {
    return this.role === 'host' ? this.guests.size : 0;
  }

  getRoomCode(): string { return this.roomCode; }

  async shareRoom(): Promise<string> { return ''; }

  async waitForDcOpen(_peerId: string, _timeoutMs = 10000): Promise<boolean> {
    Logger.log('TEST', 'waitForDcOpen: 立即成功（假传输）');
    return true;
  }

  leave(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.role === 'host') {
      try {
        localStorage.removeItem(OFFER_KEY);
      } catch { /* 无 localStorage 环境（测试）跳过 */ }
    }
    this.channel.close();
    this.guests.clear();
  }

  // ---------- 内部 ----------

  private post(to: string, type: string, payload: unknown): void {
    try {
      this.channel.postMessage({ to, from: this.role === 'host' ? 'host' : this.guestId, type, payload });
    } catch (err) {
      Logger.log('TEST', `post 失败: ${(err as Error).message}`);
    }
  }

  private handleMessage(msg: ChannelMsg): void {
    const me = this.role === 'host' ? 'host' : this.guestId;
    if (msg.to !== 'all' && msg.to !== me) return;
    if (this.role === 'guest' && msg.type === 'offer') {
      this.onOfferCb?.(JSON.stringify(msg.payload));
      return;
    }
    if (this.role === 'host' && msg.type === 'answer') {
      this.onAnswerCb?.(JSON.stringify(msg.payload));
      return;
    }
    const wire = { type: msg.type, payload: msg.payload };
    if (msg.type === 'action') this.onActionCb?.(msg.payload as GameAction);
    this.onMsgCb?.(msg.from, wire);
  }
}
