// WebRTC — manual SDP exchange via QR (no signaling server)

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export interface Connection {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  peerId: string;
}

type MsgCb = (conn: Connection, data: unknown) => void;

function setupDC(dc: RTCDataChannel, conn: Connection, onMsg: MsgCb) {
  dc.onopen = () => console.log(`[WebRTC] DC open: ${conn.peerId}`);
  dc.onmessage = (e) => {
    try { const m = JSON.parse(e.data); onMsg(conn, m); } catch { /* */ }
  };
  dc.onclose = () => console.log(`[WebRTC] DC closed: ${conn.peerId}`);
}

/** Host: create peer connection + data channel + offer */
export async function hostCreateOffer(roomCode: string, onMsg: MsgCb): Promise<Connection> {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  const dc = pc.createDataChannel('game');
  const conn: Connection = { pc, dc, peerId: roomCode };
  setupDC(dc, conn, onMsg);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIceComplete(pc);
  _conns.set(roomCode, conn);
  return conn;
}

/** Host: accept guest's answer */
export async function hostAcceptAnswer(roomCode: string, answerJson: string): Promise<Connection> {
  const conn = _conns.get(roomCode);
  if (!conn) throw new Error('no matching connection');
  const answer = JSON.parse(answerJson) as RTCSessionDescriptionInit;
  await conn.pc.setRemoteDescription(new RTCSessionDescription(answer));
  return conn;
}

/** Guest: accept host's offer, create answer */
export async function guestCreateAnswer(hostOfferJson: string, onMsg: MsgCb): Promise<Connection> {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  const conn: Connection = { pc, dc: null!, peerId: 'host' };

  pc.ondatachannel = (e) => {
    conn.dc = e.channel;
    setupDC(e.channel, conn, onMsg);
  };

  const offer = JSON.parse(hostOfferJson) as RTCSessionDescriptionInit;
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitIceComplete(pc);
  return conn;
}

export function sendJson(conn: Connection, data: unknown) {
  if (conn.dc?.readyState === 'open') conn.dc.send(JSON.stringify(data));
}

async function waitIceComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return;
  return new Promise(resolve => {
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') resolve();
    };
    setTimeout(resolve, 3000);
  });
}

const _conns = new Map<string, Connection>();
