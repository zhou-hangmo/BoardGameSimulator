// ============================================================
// BoardGameSimulator — P2P 通信封装
// ============================================================

import type { GameAction, PlayerView, ErrorResponse } from './types';

type MessageHandler = (fromPeerId: string, data: unknown) => void;
type ConnectionHandler = (peerId: string) => void;

interface RoomAPI {
  createRoom(): Promise<{ roomCode: string }>;
  joinRoom(code: string): Promise<void>;
  onPeerJoin(callback: ConnectionHandler): void;
  onPeerLeave(callback: ConnectionHandler): void;
  onMessage(callback: MessageHandler): void;
  sendTo(peerId: string, data: unknown): void;
  broadcast(data: unknown): void;
  leave(): void;
}

/**
 * P2P 通信管理器。
 * 封装 @moku-labs/room，提供房间创建/加入/消息发送。
 * 如果 @moku-labs/room 不可用，回退到模拟模式（单机调试）。
 */
export class P2PManager {
  private forceBC = false;
  private room: RoomAPI | null = null;
  private sigRoom: import('./signaling').SignalingRoom | null = null;
  private initialized = false;
  private peerIds: string[] = [];
  private onActionCallback: ((action: GameAction) => void) | null = null;
  private onMsgCallback: MessageHandler | null = null;
  private onPlayerJoinCallback: ConnectionHandler | null = null;
  private onPlayerLeaveCallback: ConnectionHandler | null = null;

  useBroadcastChannel(): void { this.forceBC = true; }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    if (this.forceBC) {
      console.log("[P2P] 测试模式: BroadcastChannel");
      this.room = this.createBCRoom();
    } else {
      try {
        const { createSignalingRoom } = await import('./signaling');
        const sig = createSignalingRoom('boardgame-simulator');
        this.sigRoom = sig;
        const { createWebRTCRoom } = await import('./webrtc');
        const wrc = createWebRTCRoom(sig as any);
        this.room = wrc as unknown as RoomAPI;
        this.room.leave = () => { wrc.leave(); sig.leave(); };
        console.log('[P2P] WebRTC + Nostr/QR');
      } catch {
        console.warn('[P2P] 回退 BroadcastChannel');
        this.room = this.createBCRoom();
      }
    }

    this.room.onPeerJoin((peerId: string) => {
      this.peerIds.push(peerId);
      this.onPlayerJoinCallback?.(peerId);
    });

    this.room.onPeerLeave((peerId: string) => {
      this.peerIds = this.peerIds.filter(id => id !== peerId);
      this.onPlayerLeaveCallback?.(peerId);
    });

    this.room.onMessage((fromPeerId: string, data: unknown) => {
      const msg = data as { type: string; payload: unknown };
      // Filtered: only action messages
      if (msg.type === 'action') {
        this.onActionCallback?.(msg.payload as GameAction);
      }
      // Raw: all messages
      this.onMsgCallback?.(fromPeerId, data);
    });
  }

  // ========== 房间管理 ==========

  async createRoom(): Promise<string> {
    if (!this.room) await this.init();
    const { roomCode } = await this.room!.createRoom();
    return roomCode;
  }

  async joinRoom(code: string): Promise<void> {
    if (!this.room) await this.init();
    await this.room!.joinRoom(code);
  }

  async shareRoom(): Promise<string> {
    if (!this.room) await this.init();
    return (this.room as any).shareRoom?.() ?? '';
  }

  // ========== 消息发送 ==========

  sendAction(action: GameAction): void {
    this.room?.broadcast({ type: 'action', payload: action });
  }

  sendRaw(peerId: string, type: string, payload: unknown): void {
    this.room?.sendTo(peerId, { type, payload });
  }

  broadcastRaw(type: string, payload: unknown): void {
    this.room?.broadcast({ type, payload });
  }

  sendPlayerView(peerId: string, view: PlayerView): void {
    this.room?.sendTo(peerId, { type: 'state', payload: view });
  }

  sendError(peerId: string, error: ErrorResponse): void {
    this.room?.sendTo(peerId, { type: 'error', payload: error });
  }

  broadcastToAll(view: PlayerView): void {
    this.room?.broadcast({ type: 'state', payload: view });
  }

  // ========== 事件回调 ==========

  onAction(callback: (action: GameAction) => void): void {
    this.onActionCallback = callback;
  }

  onMessage(callback: MessageHandler): void {
    this.onMsgCallback = callback;
  }

  onPlayerJoin(callback: ConnectionHandler): void {
    this.onPlayerJoinCallback = callback;
  }

  onPlayerLeave(callback: ConnectionHandler): void {
    this.onPlayerLeaveCallback = callback;
  }

  getPeerCount(): number {
    return this.peerIds.length;
  }

  getPeerIds(): string[] {
    return [...this.peerIds];
  }

  isNostrConnected(): boolean {
    return this.sigRoom?.isNostrConnected?.() ?? false;
  }

  getNostrStatus(): { connected: number; total: number } {
    return this.sigRoom?.getNostrStatus?.() ?? { connected: 0, total: 0 };
  }

  leave(): void {
    this.room?.leave();
    this.initialized = false;
  }

  // ========== BroadcastChannel 模式（多标签本地联机） ==========

  private createBCRoom(): RoomAPI {
    const peerJoins: ConnectionHandler[] = [];
    const peerLeaves: ConnectionHandler[] = [];
    const msgHandlers: MessageHandler[] = [];
    let bc: BroadcastChannel | null = null;
    let myId = '';
    let roomCode = '';

    const sendBC = (data: unknown) => {
      if (bc) bc.postMessage(data);
    };

    return {
      async createRoom() {
        roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
        myId = `host-${roomCode}`;
        bc = new BroadcastChannel(`bgs-${roomCode}`);
        bc.onmessage = (ev: MessageEvent) => {
          const m = ev.data as { type: string; from: string; to?: string; payload?: unknown };
          if (m.type === 'join') {
            peerJoins.forEach(cb => cb(m.from));
            // Reply with welcome so joiner knows host's ID
            sendBC({ type: 'welcome', from: myId, to: m.from });
          } else if (m.type === 'leave') {
            peerLeaves.forEach(cb => cb(m.from));
          } else if (m.type === 'msg') {
            if (!m.to || m.to === myId) msgHandlers.forEach(cb => cb(m.from, m.payload));
          }
        };
        console.log(`[BC] 房间创建: ${roomCode}`);
        return { roomCode };
      },

      async joinRoom(code: string) {
        roomCode = code;
        myId = `peer-${Date.now().toString(36)}`;
        bc = new BroadcastChannel(`bgs-${code}`);
        bc.onmessage = (ev: MessageEvent) => {
          const m = ev.data as { type: string; from: string; to?: string; payload?: unknown };
          if (m.type === 'welcome' && m.to === myId) {
            peerJoins.forEach(cb => cb(m.from));
          } else if (m.type === 'msg') {
            if (!m.to || m.to === myId) msgHandlers.forEach(cb => cb(m.from, m.payload));
          } else if (m.type === 'leave') {
            peerLeaves.forEach(cb => cb(m.from));
          }
        };
        sendBC({ type: 'join', from: myId });
        console.log(`[BC] 加入房间: ${code}`);
      },

      onPeerJoin(cb: ConnectionHandler) { peerJoins.push(cb); },
      onPeerLeave(cb: ConnectionHandler) { peerLeaves.push(cb); },
      onMessage(cb: MessageHandler) { msgHandlers.push(cb); },

      sendTo(peerId: string, data: unknown) {
        sendBC({ type: 'msg', from: myId, to: peerId, payload: data });
      },
      broadcast(data: unknown) {
        sendBC({ type: 'msg', from: myId, payload: data });
      },
      leave() {
        sendBC({ type: 'leave', from: myId });
        bc?.close();
        bc = null;
      },
    };
  }
}
