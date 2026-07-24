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
  const candidates = [...sdp.matchAll(/a=(candidate:\S+ \d+ [uU][dD][pP] \d+ \S+ \S+ typ host)/g)].map(m => m[1]);
  if (!m || !pw || !f || !s) throw new Error('SDP missing essential fields');
  return { u: m[1], w: pw[1], f: f[1], s: s[1], p: sp?.[1] ?? '5000', c: candidates };
}

export async function createTemplateSdp(): Promise<string> {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  try {
    pc.createDataChannel('_t');
    const offer = await pc.createOffer();
    return offer.sdp!;
  } finally { pc.close(); }
}

export function applyFields(template: string, f: SdpFields): string {
  return template
    .replace(/a=ice-ufrag:\S+/g, `a=ice-ufrag:${f.u}`)
    .replace(/a=ice-pwd:\S+/g,    `a=ice-pwd:${f.w}`)
    .replace(/a=fingerprint:\S+ \S+/g, `a=fingerprint:${f.f}`)
    .replace(/a=setup:\S+/g,      `a=setup:${f.s}`)
    .replace(/a=sctp-port:\d+/g,  `a=sctp-port:${f.p}`)
    .replace(/a=candidate:.*\r?\n?/g, '')
    + '\r\n' + f.c.map(c => `a=${c}`).join('\r\n');
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
  const sdp = applyFields(await createTemplateSdp(), fields);
  await conn.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
  return conn;
}

export async function guestCreateAnswer(fields: SdpFields, onMsg: MsgCb): Promise<Connection> {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  const conn: Connection = { pc, dc: null!, peerId: 'host' };
  pc.ondatachannel = (e) => { conn.dc = e.channel; setupDC(e.channel, conn, onMsg); };
  const sdp = applyFields(await createTemplateSdp(), fields);
  await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
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
