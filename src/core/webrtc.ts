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

/** Extract essential ICE/fingerprint fields from full SDP */
export function compressSdp(sdp: string): string {
  const m = sdp.match(/a=ice-ufrag:[^\r\n]+/);
  const p = sdp.match(/a=ice-pwd:[^\r\n]+/);
  const f = sdp.match(/a=fingerprint:\S+ \S+/);
  const s = sdp.match(/a=setup:\S+/);
  if (!m || !p || !f || !s) throw new Error('SDP missing essential fields');
  return JSON.stringify({u: m[0].split(':')[1], w: p[0].split(':')[1], f: f[0].split(':')[1] + ' ' + f[0].split(' ')[1], s: s[0].split(':')[1]});
}

/** Reconstruct full SDP from compressed fields */
export function decompressSdp(compressed: string): string {
  const c = JSON.parse(compressed) as { u: string; w: string; f: string; s: string };
  const sid = `${Date.now()} ${Math.random().toString(36).slice(2, 6)}`;
  return [
    'v=0',
    `o=- ${sid} 2 IN IP4 127.0.0.1`,
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    'a=mid:0',
    `a=ice-ufrag:${c.u}`,
    `a=ice-pwd:${c.w}`,
    `a=fingerprint:sha-256 ${c.f.split(' ')[1] || c.f}`,
    `a=setup:${c.s}`,
    'a=sctp-port:5000',
    'a=candidate:1 1 UDP 2130706431 ::1 0 typ host',
    'a=candidate:1 1 UDP 2130706431 127.0.0.1 0 typ host',
  ].join('\r\n');
}

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

/** Host: accept guest's answer (reconstructed from compressed) */
export async function hostAcceptAnswer(roomCode: string, compressedAnswer: string): Promise<Connection> {
  const conn = _conns.get(roomCode);
  if (!conn) throw new Error('no matching connection');
  const fullSdp = decompressSdp(compressedAnswer);
  await conn.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: fullSdp }));
  return conn;
}

/** Guest: accept host's offer (reconstructed from compressed), create answer */
export async function guestCreateAnswer(compressedOffer: string, onMsg: MsgCb): Promise<Connection> {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  const conn: Connection = { pc, dc: null!, peerId: 'host' };

  pc.ondatachannel = (e) => {
    conn.dc = e.channel;
    setupDC(e.channel, conn, onMsg);
  };

  const fullSdp = decompressSdp(compressedOffer);
  await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: fullSdp }));
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
