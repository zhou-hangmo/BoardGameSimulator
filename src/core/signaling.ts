// Unified signaling: Nostr → QR fallback
import { createNostrRoom } from './nostr';
import { encodeQR, shareSignaling, decodeQR, type SignalingData } from './qrcode';
import type { NostrAPI } from './nostr';

type ConnectionHandler = (peerId: string) => void;
type MessageHandler = (fromPeerId: string, data: unknown) => void;

export interface SignalingRoom {
  createRoom(): Promise<{ roomCode: string }>;
  joinRoom(code: string, signalData?: string): Promise<void>;
  onPeerJoin(cb: ConnectionHandler): void;
  onPeerLeave(cb: ConnectionHandler): void;
  onMessage(cb: MessageHandler): void;
  sendTo(peerId: string, data: unknown): void;
  broadcast(data: unknown): void;
  leave(): void;
  shareRoom(): Promise<string>;
  isNostrConnected(): boolean;
  getNostrStatus(): { connected: number; total: number };
}

export function createSignalingRoom(appName: string): SignalingRoom {
  const peerJoins: ConnectionHandler[] = [];
  const peerLeaves: ConnectionHandler[] = [];
  const msgHandlers: MessageHandler[] = [];
  let nostr: NostrAPI | null = null;
  let myPeerId = '';
  let roomCode = '';

  const setupNostr = () => {
    nostr = createNostrRoom(appName);
    nostr.onPeerJoin(id => peerJoins.forEach(cb => cb(id)));
    nostr.onPeerLeave(id => peerLeaves.forEach(cb => cb(id)));
    nostr.onMessage((from, data) => msgHandlers.forEach(cb => cb(from, data)));
  };

  return {
    async createRoom() {
      try {
        setupNostr();
        const result = await nostr!.createRoom();
        roomCode = result.roomCode;
        myPeerId = `host-${roomCode}`;
        // 3s timeout: if no peer through Nostr, allow QR
        return result;
      } catch {
        roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
        myPeerId = `host-${roomCode}`;
        return { roomCode };
      }
    },

    async joinRoom(code: string, signalData?: string) {
      roomCode = code;
      // If signalData provided (from QR), use it directly
      if (signalData) {
        const sd = decodeQR(signalData);
        if (sd) myPeerId = `peer-${Date.now().toString(36)}`;
      }
      // Try Nostr first
      try {
        setupNostr();
        await nostr!.joinRoom(code);
        myPeerId = `peer-${Date.now().toString(36)}`;
      } catch {
        // Nostr unavailable — waiting for QR signal data
      }
    },

    onPeerJoin(cb: ConnectionHandler) { peerJoins.push(cb); },
    onPeerLeave(cb: ConnectionHandler) { peerLeaves.push(cb); },
    onMessage(cb: MessageHandler) { msgHandlers.push(cb); },

    sendTo(peerId: string, data: unknown) {
      nostr?.sendTo?.(peerId, data);
    },
    broadcast(data: unknown) {
      nostr?.broadcast?.(data);
    },
    leave() {
      nostr?.leave?.();
      nostr = null;
    },

    async shareRoom(): Promise<string> {
      const data: SignalingData = { roomCode, peerId: myPeerId };
      try { await shareSignaling(data); } catch { /* 系统分享不可用 */ }
      return encodeQR(data);
    },

    isNostrConnected(): boolean {
      return nostr?.isConnected?.() ?? false;
    },
    getNostrStatus(): { connected: number; total: number } {
      return {
        connected: nostr?.getConnectedCount?.() ?? 0,
        total: nostr?.getRelayCount?.() ?? 0,
      };
    },
  };
}
