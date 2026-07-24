// WebRTC — manual SDP exchange via QR

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

export interface SdpFields { u: string; w: string; f: string; s: string; p: string; c: string[] }

export function extractFields(sdp: string): SdpFields {
  const m = sdp.match(/a=ice-ufrag:(\S+)/);
  const pw = sdp.match(/a=ice-pwd:(\S+)/);
  const f = sdp.match(/a=fingerprint:(\S+ \S+)/);
  const s = sdp.match(/a=setup:(\S+)/);
  const sp = sdp.match(/a=sctp-port:(\d+)/);
  const candidates = [...sdp.matchAll(/a=(candidate:\S+ \d+ UDP \d+ \S+ \S+ typ host)/g)].map(m => m[1]);
  if (!m || !pw || !f || !s) throw new Error('SDP missing essential fields');
  return { u: m[1], w: pw[1], f: f[1], s: s[1], p: sp?.[1] ?? '5000', c: candidates };
}

export function buildSdp(f: SdpFields): string {
  const sid = `${Date.now()}${Math.floor(Math.random()*1e9)}`;
  const lines = ['v=0', `o=- ${sid} 2 IN IP4 127.0.0.1`, 's=-', 't=0 0', 'a=group:BUNDLE 0',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0', 'a=mid:0',
    `a=ice-ufrag:${f.u}`, `a=ice-pwd:${f.w}`, `a=fingerprint:${f.f}`, `a=setup:${f.s}`, `a=sctp-port:${f.p}`];
  for (const cand of f.c) lines.push(`a=${cand}`);
  return lines.join('\r\n');
}

function setupDC(dc: RTCDataChannel, conn: Connection, onMsg: MsgCb) {
  dc.onopen = () => console.log(`[WebRTC] DC open: ${conn.peerId}`);
  dc.onmessage = (e) => { try { const m = JSON.parse(e.data); onMsg(conn, m); } catch { /* */ } };
  dc.onclose = () => console.log(`[WebRTC] DC closed: ${conn.peerId}`);
}

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

export async function hostAcceptAnswer(roomCode: string, fields: SdpFields): Promise<Connection> {
  const conn = _conns.get(roomCode);
  if (!conn) throw new Error('no matching connection');
  await conn.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: buildSdp(fields) }));
  return conn;
}

export async function guestCreateAnswer(fields: SdpFields, onMsg: MsgCb): Promise<Connection> {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  const conn: Connection = { pc, dc: null!, peerId: 'host' };
  pc.ondatachannel = (e) => { conn.dc = e.channel; setupDC(e.channel, conn, onMsg); };
  await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: buildSdp(fields) }));
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
    pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') resolve(); };
    setTimeout(resolve, 3000);
  });
}

const _conns = new Map<string, Connection>();
