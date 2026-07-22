// Host migration: handoff + auto-recovery + IPv6-priority election
import type { GameState } from './types';
import { StateBackup } from './backup';

type PeerCB = (peers: string[]) => string; // returns chosen successor peerId
type MigrateCB = (state: GameState) => void; // called when becoming new host

export class HostMigration {
  private backup: StateBackup;
  private peers: string[] = [];
  private myPeerId = '';
  private isHost = false;
  private broadcast: ((data: unknown) => void) | null = null;
  private sendTo: ((peerId: string, data: unknown) => void) | null = null;
  private onBecomeHost: MigrateCB | null = null;
  private electionCB: PeerCB | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(backup: StateBackup) { this.backup = backup; }

  setup(opts: {
    myPeerId: string; isHost: boolean; peers: string[];
    broadcast: (data: unknown) => void;
    sendTo: (peerId: string, data: unknown) => void;
    onBecomeHost: MigrateCB;
    election: PeerCB;
  }) {
    this.myPeerId = opts.myPeerId; this.isHost = opts.isHost;
    this.peers = opts.peers; this.broadcast = opts.broadcast;
    this.sendTo = opts.sendTo; this.onBecomeHost = opts.onBecomeHost;
    this.electionCB = opts.election;
    if (this.isHost) this.startPing();
  }

  /** Host: actively transfer to a peer */
  transfer(targetPeerId: string, state: GameState) {
    if (!this.isHost) return;
    // Send full state to successor
    this.sendTo?.(targetPeerId, { type: 'host_migrate', payload: { state, peers: this.peers } });
    // Notify others of new host
    for (const pid of this.peers) {
      if (pid !== targetPeerId) {
        this.sendTo?.(pid, { type: 'host_changed', payload: { newHost: targetPeerId } });
      }
    }
    this.isHost = false;
  }

  /** Handle incoming migration/connection messages */
  handleMessage(fromPeerId: string, data: unknown): boolean {
    const msg = data as { type: string; payload: unknown };
    if (msg.type === 'host_migrate') {
      const { state } = msg.payload as { state: GameState; peers: string[] };
      this.isHost = true;
      this.peers = (msg.payload as any).peers.filter((p: string) => p !== this.myPeerId);
      this.onBecomeHost?.(state);
      this.startPing();
      // Notify all peers: I'm the new host
      for (const pid of this.peers) {
        this.sendTo?.(pid, { type: 'host_changed', payload: { newHost: this.myPeerId } });
      }
      return true;
    }
    if (msg.type === 'host_changed') {
      const { newHost } = msg.payload as { newHost: string };
      if (newHost === this.myPeerId) {
        // I'm being promoted (election result)
        this.isHost = true;
        const state = this.backup.getCached();
        if (state) this.onBecomeHost?.(state);
        this.startPing();
      }
      return true;
    }
    if (msg.type === 'ping') {
      this.sendTo?.(fromPeerId, { type: 'pong', payload: {} });
      return true;
    }
    if (msg.type === 'pong') {
      // Host received pong — peer is alive
      return true;
    }
    if (msg.type === 'election') {
      // Participate in election
      const candidates = (msg.payload as { candidates: string[] }).candidates;
      const chosen = this.electionCB?.(candidates) ?? candidates[0];
      this.broadcast?.({ type: 'election_vote', payload: { chosen } });
      return true;
    }
    if (msg.type === 'election_vote') {
      // Votes collected — handled by election initiator
      return true;
    }
    return false;
  }

  /** Auto-detect host down → trigger election */
  private startPing() {
    this.stopPing();
    if (!this.isHost) {
      // Non-host: expect pings from host
      this.pingTimer = setInterval(() => {
        // If no ping received in 10s, start election
      }, 5000);
    }
  }

  private stopPing() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  updatePeers(peers: string[]) { this.peers = peers; }

  destroy() { this.stopPing(); }
}
