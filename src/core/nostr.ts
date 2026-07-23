// Nostr signaling — zero-dependency relay adapter

type ConnectionHandler = (peerId: string) => void;
type MessageHandler = (fromPeerId: string, data: unknown) => void;

interface RoomAPI {
  createRoom(): Promise<{ roomCode: string }>;
  joinRoom(code: string): Promise<void>;
  onPeerJoin(cb: ConnectionHandler): void;
  onPeerLeave(cb: ConnectionHandler): void;
  onMessage(cb: MessageHandler): void;
  sendTo(peerId: string, data: unknown): void;
  broadcast(data: unknown): void;
  leave(): void;
  isConnected(): boolean;
  getConnectedCount(): number;
  getRelayCount(): number;
}

export type NostrAPI = RoomAPI;

// --- Minimal Nostr client (no dependency) ---
const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.house',
  'wss://nostr.bitcoiner.social',
  'wss://relay.snort.social',
  'wss://nostr.v0l.io',
];

function tagCode(roomCode: string): string {
  // Simple hash to avoid collisions: use room code directly as tag
  return `bgs-${roomCode.toLowerCase()}`;
}

function simpleEncrypt(plain: string, key: string): string {
  // XOR with key, base64 encoded — fast, zero dependency
  const kb = new TextEncoder().encode(key);
  const pb = new TextEncoder().encode(plain);
  const out = new Uint8Array(pb.length);
  for (let i = 0; i < pb.length; i++) out[i] = pb[i] ^ kb[i % kb.length];
  return btoa(String.fromCharCode(...out));
}

function simpleDecrypt(enc: string, key: string): string {
  const kb = new TextEncoder().encode(key);
  const pb = Uint8Array.from(atob(enc), c => c.charCodeAt(0));
  const out = new Uint8Array(pb.length);
  for (let i = 0; i < pb.length; i++) out[i] = pb[i] ^ kb[i % kb.length];
  return new TextDecoder().decode(out);
}

// --- Nostr Room Adapter ---
export function createNostrRoom(_appName: string): RoomAPI {
  const peerJoins: ConnectionHandler[] = [];
  const peerLeaves: ConnectionHandler[] = [];
  const msgHandlers: MessageHandler[] = [];
  let myPeerId = '';
  let roomCode = '';
  let sockets: WebSocket[] = [];
  let relayConnected = false;
  const seen = new Set<string>();
  let reconnectTimer: ReturnType<typeof setInterval> | null = null;

  function connect() {
    disconnect();
    const tag = tagCode(roomCode);
    for (const url of RELAYS) {
      try {
        const ws = new WebSocket(url);
        sockets.push(ws);
        const shortUrl = url.replace('wss://', '').split('.')[0];
        ws.onopen = () => {
          relayConnected = true;
          console.log(`[Nostr] ✅ ${shortUrl} 已连接`);
          ws.send(JSON.stringify(['REQ', tag, { kinds: [1], '#t': [tag] }]));
        };
        ws.onclose = () => console.log(`[Nostr] ${shortUrl} 已断开`);
        ws.onerror = () => console.warn(`[Nostr] ❌ ${shortUrl} 连接失败`);
        ws.onmessage = (ev: MessageEvent) => {
          const data = JSON.parse(ev.data);
          if (data[0] === 'EVENT' && data[2]?.content) {
            const content = data[2].content;
            const id = data[2].id;
            if (seen.has(id)) return;
            seen.add(id);
            try {
              const msg = JSON.parse(simpleDecrypt(content, roomCode)) as {
                type: string; from: string; to?: string; payload?: unknown;
              };
              if (msg.type === 'join' && msg.from !== myPeerId) {
                peerJoins.forEach(cb => cb(msg.from));
              } else if (msg.type === 'msg') {
                if (!msg.to || msg.to === myPeerId) {
                  msgHandlers.forEach(cb => cb(msg.from, msg.payload));
                }
              } else if (msg.type === 'leave' && msg.from !== myPeerId) {
                peerLeaves.forEach(cb => cb(msg.from));
              }
            } catch { /* invalid message */ }
          }
        };
        ws.onerror = () => {};
      } catch { /* relay unavailable */ }
    }
    // Reconnect every 30s to catch new events
    reconnectTimer = setInterval(() => connect(), 30_000);
  }

  function disconnect() {
    for (const ws of sockets) { try { ws.close(); } catch {} }
    sockets = [];
    if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null; }
  }

  function publish(type: string, toPeerId: string | undefined, payload: unknown) {
    const msg = JSON.stringify({ type, from: myPeerId, to: toPeerId, payload });
    const enc = simpleEncrypt(msg, roomCode);
    const tag = tagCode(roomCode);
    const event = JSON.stringify(['EVENT', {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['t', tag]],
      content: enc,
    }]);
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) ws.send(event);
    }
  }

  return {
    async createRoom() {
      roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
      myPeerId = `host-${roomCode}`;
      connect();
      console.log(`[Nostr] 房间创建: ${roomCode}`);
      return { roomCode };
    },
    async joinRoom(code: string) {
      roomCode = code;
      myPeerId = `peer-${Date.now().toString(36)}`;
      connect();
      setTimeout(() => publish('join', undefined, null), 500);
      console.log(`[Nostr] 加入房间: ${code}`);
    },
    onPeerJoin(cb: ConnectionHandler) { peerJoins.push(cb); },
    onPeerLeave(cb: ConnectionHandler) { peerLeaves.push(cb); },
    onMessage(cb: MessageHandler) { msgHandlers.push(cb); },
    sendTo(peerId: string, data: unknown) { publish('msg', peerId, data); },
    broadcast(data: unknown) { publish('msg', undefined, data); },
    leave() { publish('leave', undefined, null); disconnect(); },
    isConnected() { return relayConnected; },
    getRelayCount() { return RELAYS.length; },
    getConnectedCount() { return sockets.filter(s => s.readyState === WebSocket.OPEN).length; },
  };
}
