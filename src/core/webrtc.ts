// WebRTC DataChannel P2P — replaces @moku-labs/room
type ConnectionHandler = (peerId: string) => void;
type MessageHandler = (fromPeerId: string, data: unknown) => void;

interface RoomAPI {
  createRoom(): Promise<{ roomCode: string }>;
  joinRoom(code: string, signalData?: string): Promise<void>;
  onPeerJoin(cb: ConnectionHandler): void;
  onPeerLeave(cb: ConnectionHandler): void;
  onMessage(cb: MessageHandler): void;
  sendTo(peerId: string, data: unknown): void;
  broadcast(data: unknown): void;
  leave(): void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export function createWebRTCRoom(
  signaling: { sendTo: (peerId: string, data: unknown) => void; broadcast: (data: unknown) => void; onMessage: (cb: (from: string, data: unknown) => void) => void },
  ): RoomAPI {
  const peerJoins: ConnectionHandler[] = [];
  const peerLeaves: ConnectionHandler[] = [];
  const msgHandlers: MessageHandler[] = [];
  const peers = new Map<string, { pc: RTCPeerConnection; dc: RTCDataChannel | null }>();
  let myPeerId = '';
  let roomCode = '';

  function createPC(): RTCPeerConnection {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        signaling.broadcast({ type: 'ice', from: myPeerId, payload: e.candidate });
      }
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        // Find and remove the peer
        for (const [pid, p] of peers) {
          if (p.pc === pc) {
            peers.delete(pid);
            peerLeaves.forEach(cb => cb(pid));
            break;
          }
        }
      }
    };
    return pc;
  }

  // Host: handle incoming connection
  function handleIncoming(peerId: string) {
    const pc = createPC();
    const dc = pc.createDataChannel('game');
    setupDC(dc, peerId);
    peers.set(peerId, { pc, dc });

    pc.createOffer().then(offer => pc.setLocalDescription(offer)).then(() => {
      signaling.sendTo(peerId, { type: 'sdp', from: myPeerId, payload: pc.localDescription });
    });
  }

  function setupDC(dc: RTCDataChannel, peerId: string) {
    dc.onopen = () => peerJoins.forEach(cb => cb(peerId));
    dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        msgHandlers.forEach(cb => cb(peerId, msg));
      } catch { /* invalid */ }
    };
    dc.onclose = () => {
      peers.delete(peerId);
      peerLeaves.forEach(cb => cb(peerId));
    };
  }

  // Handle signaling messages from the transport layer
  // Register to receive SDP/ICE from signaling layer
  signaling.onMessage((_from: string, data: unknown) => {
    const msg = data as { type: string; from: string; to?: string; payload?: unknown };
    if (msg.from === myPeerId) return;

    if (msg.type === 'join_req') {
      // Host receives join request
      handleIncoming(msg.from);
    } else if (msg.type === 'sdp') {
      const sdp = msg.payload as RTCSessionDescriptionInit;
      let peer = peers.get(msg.from);
      if (!peer) {
        // New incoming connection
        const pc = createPC();
        pc.ondatachannel = (e) => setupDC(e.channel, msg.from);
        peer = { pc, dc: null };
        peers.set(msg.from, peer);
      }
      peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      if (sdp.type === 'offer') {
        peer.pc.createAnswer().then(answer => peer.pc.setLocalDescription(answer)).then(() => {
          signaling.sendTo(msg.from, { type: 'sdp', from: myPeerId, payload: peer.pc.localDescription });
        });
      }
    } else if (msg.type === 'ice') {
      const peer = peers.get(msg.from);
      if (peer) peer.pc.addIceCandidate(new RTCIceCandidate(msg.payload as RTCIceCandidateInit));
    }
  });

  return {
    async createRoom() {
      roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
      myPeerId = `host-${roomCode}`;
      // Signal ready to accept connections
      signaling.broadcast({ type: 'host_ready', from: myPeerId, payload: { roomCode } });
      console.log(`[WebRTC] 房间创建: ${roomCode}`);
      return { roomCode };
    },

    async joinRoom(code: string) {
      roomCode = code;
      myPeerId = `peer-${Date.now().toString(36)}`;
      // Send join request to host
      signaling.broadcast({ type: 'join_req', from: myPeerId, payload: { roomCode } });
      console.log(`[WebRTC] 加入房间: ${code}`);
    },

    onPeerJoin(cb: ConnectionHandler) { peerJoins.push(cb); },
    onPeerLeave(cb: ConnectionHandler) { peerLeaves.push(cb); },
    onMessage(cb: MessageHandler) { msgHandlers.push(cb); },

    sendTo(peerId: string, data: unknown) {
      const peer = peers.get(peerId);
      if (peer?.dc?.readyState === 'open') {
        peer.dc.send(JSON.stringify(data));
      }
    },

    broadcast(data: unknown) {
      const json = JSON.stringify(data);
      for (const [, peer] of peers) {
        if (peer.dc?.readyState === 'open') peer.dc.send(json);
      }
    },

    leave() {
      for (const [, peer] of peers) {
        peer.dc?.close();
        peer.pc.close();
      }
      peers.clear();
    },
  };
}
