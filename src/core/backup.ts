// State backup: broadcast + ACK + localstorage cache
import type { GameState } from './types';

const STORAGE_KEY = 'bgs_backup';
type AckCallback = (peerId: string, version: number) => void;

export class StateBackup {
  private cache: GameState | null = null;
  private ackPending = new Map<string, number>(); // peerId → version
  private onAckCallback: AckCallback | null = null;
  private sendFn: ((peerId: string, data: unknown) => void) | null = null;

  /** Set the P2P send function */
  setTransport(send: (peerId: string, data: unknown) => void) {
    this.sendFn = send;
  }

  /** Host: broadcast full state to all peers, expecting ACK */
  broadcast(peers: string[], state: GameState) {
    this.cache = state;
    for (const pid of peers) {
      this.ackPending.set(pid, state.version);
      this.sendFn?.(pid, { type: 'backup', payload: state });
    }
    this.saveLocal(state);
  }

  /** Receive backup from host */
  receive(data: unknown, fromPeerId: string): boolean {
    const msg = data as { type: string; payload: unknown };
    if (msg.type === 'backup') {
      const state = msg.payload as GameState;
      this.cache = state;
      this.saveLocal(state);
      // Send ACK
      this.sendFn?.(fromPeerId, { type: 'backup_ack', payload: { version: state.version } });
      return true;
    }
    if (msg.type === 'backup_ack') {
      const { version } = msg.payload as { version: number };
      this.ackPending.delete(fromPeerId);
      this.onAckCallback?.(fromPeerId, version);
      return true;
    }
    return false;
  }

  /** Set callback for ACK received */
  onAck(cb: AckCallback) { this.onAckCallback = cb; }

  /** Check if any peers haven't ACKed */
  getUnacked(): string[] { return [...this.ackPending.keys()]; }

  /** Restore from localStorage */
  restoreLocal(): GameState | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) as GameState : null;
    } catch { return null; }
  }

  /** Get in-memory cache (latest state) */
  getCached(): GameState | null { return this.cache; }

  private saveLocal(state: GameState) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  clear() { this.cache = null; this.ackPending.clear(); localStorage.removeItem(STORAGE_KEY); }
}
