// WebRTC — manual SDP exchange via QR
import { Logger } from '../utils/Logger';

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
  onDcOpen?: () => void;
}

type MsgCb = (conn: Connection, data: unknown) => void;

export interface SdpFields { u: string; w: string; f: string; s: string; p: string; c: string[]; mport: string; mproto: string; conn: string; addr: string }

export function extractFields(sdp: string): SdpFields {
  const rawCands = (sdp.match(/a=candidate:[^\r\n]*/g) || []);
  Logger.log('SDP', `原始候选: ${rawCands.length}条`);
  rawCands.forEach(c => Logger.log('SDP', `  ${c.substring(0, 100)}`));

  const m = sdp.match(/a=ice-ufrag:(\S+)/);
  const pw = sdp.match(/a=ice-pwd:(\S+)/);
  const f = sdp.match(/a=fingerprint:(\S+ \S+)/);
  const s = sdp.match(/a=setup:(\S+)/);
  const sp = sdp.match(/a=sctp-port:(\d+)/);
  const conn = sdp.match(/c=IN\s+(\S+)\s+(\S+)/);
  const media = sdp.match(/m=application\s+(\d+)\s+(\S+)/);
  const candidates = [...sdp.matchAll(/a=(candidate:\S+ \d+ [uU][dD][pP] \d+ \S+ \S+ typ (host|srflx).*)/g)]
    .map(x => x[1])
    .filter(c => {
      const isMdns = c.includes('.local');
      if (isMdns) Logger.log('SDP', `  [丢弃.mDNS] ${c.substring(0, 80)}`);
      return !isMdns;
    })
    .map(c => c.replace(/\s+generation\s+\d+/g, '').replace(/\s+network-(cost|id)\s+\d+/g, ''));
  candidates.forEach(c => Logger.log('SDP', `  [保留] ${c.substring(0, 80)}`));
  Logger.log('SDP', `过滤结果: ${candidates.length}条候选 (host:${candidates.filter(c=>c.includes('typ host')).length} srflx:${candidates.filter(c=>c.includes('srflx')).length})`);

  if (!m || !pw || !f || !s) throw new Error('SDP missing essential fields');
  return { u: m[1], w: pw[1], f: f[1], s: s[1], p: sp?.[1] ?? '5000', c: candidates,
    mport: media?.[1] ?? '9', mproto: media?.[2] ?? 'UDP/DTLS/SCTP webrtc-datachannel',
    conn: conn?.[1] ?? 'IP4', addr: conn?.[2] ?? '0.0.0.0' };
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
  const candBlock = f.c.map(c => 'a=' + c).join('\r\n');
  return template
    .replace(/m=application\s+\d+\s+\S+/g, `m=application ${f.mport} ${f.mproto}`)
    .replace(/c=IN\s+\S+\s+\S+\r?\n/g, (m) => m + (candBlock ? candBlock + '\r\n' : ''))
    .replace(/a=ice-options:trickle\r?\n/g, '')
    .replace(/a=ice-ufrag:\S+/g, `a=ice-ufrag:${f.u}`)
    .replace(/a=ice-pwd:\S+/g,    `a=ice-pwd:${f.w}`)
    .replace(/a=fingerprint:\S+ \S+/g, `a=fingerprint:${f.f}`)
    .replace(/a=setup:\S+/g,      `a=setup:${f.s}`)
    .replace(/a=sctp-port:\d+/g,  `a=sctp-port:${f.p}`)
    .replace(/a=candidate:[^\r\n]*\r?\n?/g, '');
}

export function monitorIce(pc: RTCPeerConnection, tag: string): void {
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      const addr = e.candidate.address || e.candidate.candidate?.split(' ')[4] || '?';
      const parts = e.candidate.candidate?.split(' ') || [];
      const transport = parts[2] || 'udp';
      Logger.log('ICE', `${tag} candidate: ${e.candidate.type} ${addr}:${e.candidate.port} (${transport})`);
    } else {
      Logger.log('ICE', `${tag} ICE gathering complete`);
    }
  };
  pc.oniceconnectionstatechange = () => {
    Logger.log('ICE', `${tag} iceState → ${pc.iceConnectionState}`);
  };
  pc.onicegatheringstatechange = () => {
    Logger.log('ICE', `${tag} iceGathering → ${pc.iceGatheringState}`);
  };
  pc.onconnectionstatechange = () => {
    Logger.log('CONN', `${tag} connState → ${pc.connectionState}`);
  };
  (pc as any).onselectedcandidatepairchange = () => {
    Logger.log('ICE', `${tag} selected pair changed`);
    setTimeout(async () => {
      try {
        const stats = await pc.getStats();
        stats.forEach((r: any) => {
          if (r.type === 'candidate-pair' && r.state === 'succeeded') {
            Logger.log('ICE', `${tag} ✅ pair connected: id=${r.id}`);
          }
        });
      } catch { /* stats fail */ }
    }, 2000);
  };
  pc.ondatachannel = (e) => {
    Logger.log('DC', `${tag} dataChannel created, readyState=${e.channel?.readyState}`);
  };
}

export function monitorDc(dc: RTCDataChannel, tag: string): void {
  dc.onopen = () => Logger.log('DC', `${tag} open ✅`);
  dc.onclose = () => Logger.log('DC', `${tag} closed`);
  dc.onerror = (e) => Logger.log('DC', `${tag} error: ${(e as ErrorEvent).message || 'unknown'}`);
}

function setupDC(dc: RTCDataChannel, conn: Connection, onMsg: MsgCb) {
  monitorDc(dc, conn.peerId);
  dc.onopen = () => { Logger.log('DC', `${conn.peerId} DC open`); conn.onDcOpen?.(); };
  dc.onmessage = (e) => { try { const m = JSON.parse(e.data); onMsg(conn, m); } catch { /* */ } };
  dc.onclose = () => { Logger.log('DC', `${conn.peerId} DC close`); };
}

export async function hostCreateOffer(roomCode: string, onMsg: MsgCb): Promise<Connection> {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  monitorIce(pc, 'host');
  const dc = pc.createDataChannel('game');
  const conn: Connection = { pc, dc, peerId: roomCode };
  setupDC(dc, conn, onMsg);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  Logger.log('SDP', `host offer: setLocalDescription OK, gathering...`);
  await waitIceComplete(pc);
  Logger.log('SDP', `host offer: ICE complete, candidates gathered`);
  _conns.set(roomCode, conn);
  return conn;
}

export async function hostAcceptAnswer(roomCode: string, fields: SdpFields): Promise<Connection> {
  const conn = _conns.get(roomCode);
  if (!conn) throw new Error('no matching connection');
  const sdp = applyFields(await createTemplateSdp(), fields);
  const hasIPv6 = sdp.includes(':');
  Logger.log('SDP', `host acceptAnswer: setRemoteDescription, IPv6=${hasIPv6}, candidates=${fields.c.length}`);
  try {
    await conn.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
    Logger.log('SDP', `host acceptAnswer: setRemoteDescription ✅`);
  } catch (e) {
    Logger.log('SDP', `host acceptAnswer: setRemoteDescription ❌ ${(e as Error).message}`);
    throw e;
  }
  return conn;
}

export async function guestCreateAnswer(fields: SdpFields, onMsg: MsgCb): Promise<Connection> {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  monitorIce(pc, 'guest');
  const conn: Connection = { pc, dc: null!, peerId: 'host' };
  pc.ondatachannel = (e) => { conn.dc = e.channel; setupDC(e.channel, conn, onMsg); };
  const sdp = applyFields(await createTemplateSdp(), fields);
  const hasIPv6 = sdp.includes(':');
  Logger.log('SDP', `guest createAnswer: setRemoteDescription, IPv6=${hasIPv6}, candidates=${fields.c.length}`);
  try {
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
    Logger.log('SDP', `guest createAnswer: setRemoteDescription ✅`);
  } catch (e) {
    Logger.log('SDP', `guest createAnswer: setRemoteDescription ❌ ${(e as Error).message}`);
    throw e;
  }
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  Logger.log('SDP', `guest createAnswer: gathering...`);
  await waitIceComplete(pc);
  Logger.log('SDP', `guest createAnswer: ICE complete`);
  return conn;
}

export function sendJson(conn: Connection, data: unknown) {
  const msg = data as { type: string; payload: unknown };
  if (conn.dc?.readyState === 'open') {
    conn.dc.send(JSON.stringify(data));
  } else {
    Logger.log('DC', `${conn.peerId} sendJson skipped (dc not open, state=${conn.dc?.readyState}), type=${msg.type}`);
  }
}

async function waitIceComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return;
  return new Promise(resolve => {
    pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') resolve(); };
    setTimeout(resolve, 3000);
  });
}

const _conns = new Map<string, Connection>();
