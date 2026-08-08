// ============================================================
// BoardGameSimulator — 独立 IPv6/链路诊断工具（diag6）
// 模块① 设备/网络指纹（NAT64 探测）② IPv6 候选收集分类
// 模块③ 双端建连（复用 webrtc.ts 生产同构流程）+ getStats 路径面板
// ============================================================
import { ICE_SERVERS, extractFields, hostCreateOffer, hostAcceptAnswer, guestCreateAnswer, type Connection, type SdpFields } from './core/webrtc';
import { encodeQR, decodeQR, scanImage } from './core/qrcode';

const $ = (id: string) => document.getElementById(id)!;
const out = (id: string, cls: string, text: string) => {
  const el = $(id);
  el.innerHTML += `<span class="${cls}">${text}</span><br/>`;
};
const clear = (id: string) => { $(id).innerHTML = ''; };

interface CandInfo { addr: string; port: string; type: string; proto: string; fam: string; cat: string }

function classifyCand(cand: string): CandInfo | null {
  const m = /^candidate:(\S+) \d+ (\w+) (\d+) (\S+) (\d+) typ (\w+)/.exec(cand);
  if (!m) return null;
  const addr = m[4], port = m[5], type = m[6], proto = m[2];
  const fam = addr.includes(':') ? 'IPv6' : 'IPv4';
  let cat = `${fam}-${type}`;
  if (type === 'host' && fam === 'IPv6') {
    if (addr.toLowerCase().startsWith('fe80')) cat = 'IPv6-linklocal';
    else if (/^f[cd][0-9a-f]{2}:|^fc|^fd/.test(addr.toLowerCase())) cat = 'IPv6-ULA';
    else cat = 'IPv6-global';
  }
  return { addr, port, type, proto, fam, cat };
}

function parseCands(sdp: string): CandInfo[] {
  return (sdp.match(/a=candidate:[^\r\n]*/g) || [])
    .map(c => classifyCand(c.replace(/^a=/, '')))
    .filter((c): c is CandInfo => !!c);
}

function waitIce(pc: RTCPeerConnection, timeoutMs = 6000): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(() => { pc.onicegatheringstatechange = null; resolve(); }, timeoutMs);
    pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { clearTimeout(timer); resolve(); } };
  });
}

// ---------- 模块① 设备指纹 ----------
async function mod1(): Promise<void> {
  clear('m1');
  out('m1', 's', `protocol=${location.protocol} secure=${isSecureContext} online=${navigator.onLine}`);
  const conn = (navigator as any).connection;
  if (conn) out('m1', 's', `connection: type=${conn.effectiveType || '?'} downlink=${conn.downlink || '?'} saveData=${conn.saveData || '?'}`);
  const fetchTxt = async (url: string): Promise<string | null> => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
      return (await r.text()).trim() || null;
    } catch { return null; }
  };
  const v6 = await fetchTxt('https://api6.ipify.org');
  const v4 = await fetchTxt('https://api.ipify.org');
  out('m1', v6 ? 'ok' : 'err', `IPv6 出站: ${v6 ? `✅ ${v6}` : '❌ 失败/超时'}`);
  out('m1', v4 ? 'ok' : 'err', `IPv4 出站: ${v4 ? `✅ ${v4}` : '❌ 失败/超时'}`);
  if (v6 && v4) out('m1', 'hl', '判定: 双栈（IPv6+IPv4 均可出站）');
  else if (v6 && !v4) out('m1', 'hl', '判定: 可能 IPv6-only（IPv4 走 NAT64，本机无直接 IPv4）');
  else if (!v6 && v4) out('m1', 'hl', '判定: 仅 IPv4（无 IPv6 出站）');
  else out('m1', 'err', '判定: 双栈出站均失败（网络中断？）');
}

// ---------- 模块② 候选收集 ----------
async function mod2(): Promise<void> {
  const btn = $('btn-cand') as HTMLButtonElement;
  btn.disabled = true;
  clear('m2');
  out('m2', 'step', '收集 RTCPeerConnection 候选（含 STUN）...');
  const pc = new RTCPeerConnection(ICE_SERVERS);
  pc.createDataChannel('diag');
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIce(pc);
    const sdp = pc.localDescription!.sdp!;
    const cands = parseCands(sdp);
    const counts: Record<string, number> = {};
    cands.forEach(c => { counts[c.cat] = (counts[c.cat] || 0) + 1; });
    out('m2', 'ok', `候选总数: ${cands.length}`);
    for (const [k, v] of Object.entries(counts)) {
      out('m2', k.startsWith('IPv6-global') ? 'hl' : 's', `  ${k}: ${v}`);
    }
    cands.forEach(c => out('m2', 's', `  ${c.proto} ${c.addr}:${c.port} ${c.type} → ${c.cat}`));
    const hasGlobal6 = cands.some(c => c.cat === 'IPv6-global');
    out('m2', hasGlobal6 ? 'ok' : 'err', hasGlobal6 ? '✅ 发现全局 IPv6 host 候选' : '❌ 无全局 IPv6 候选（设备/网络不支持 v6 或策略禁用）');
  } catch (e) {
    out('m2', 'err', '收集失败: ' + (e as Error).message);
  } finally {
    pc.close();
    btn.disabled = false;
  }
}

// ---------- 模块③ 双端建连 + getStats ----------
interface DiagState {
  conn: Connection | null;
  role: string;
  sent: number;
  recv: number;
  timer: ReturnType<typeof setInterval> | null;
}

const diag: DiagState = { conn: null, role: '', sent: 0, recv: 0, timer: null };

function log3(cls: string, text: string) { out('m3', cls, text); }

function renderCandStats(c: any): string {
  if (!c) return '?';
  const fam = (c.address || '').includes(':') ? 'IPv6' : 'IPv4';
  return `${c.address || '?'}:${c.port ?? '?'} ${c.candidateType || '?'}/${c.protocol || '?'}(${fam})`;
}

function startStats(): void {
  stopStats();
  diag.timer = setInterval(async () => {
    const el = $('m3');
    const old = document.getElementById('stats-table');
    old?.remove();
    if (!diag.conn) return;
    try {
      const stats = await diag.conn.pc.getStats();
      const map = new Map<string, any>();
      stats.forEach((r: any) => map.set(r.id, r));
      const rows: string[] = [];
      stats.forEach((r: any) => {
        if (r.type !== 'candidate-pair') return;
        const lc = map.get(r.localCandidateId);
        const rc = map.get(r.remoteCandidateId);
        const sel = r.selected || r.nominated ? 'sel' : '';
        rows.push(`<tr class="${sel}"><td>${r.state}</td><td>${r.selected ? '✓' : ''}${r.nominated ? 'N' : ''}</td><td>${renderCandStats(lc)}</td><td>${renderCandStats(rc)}</td></tr>`);
      });
      const iceState = diag.conn?.pc?.iceConnectionState ?? '?';
      const header = `<div class="step" id="stats-table">candidate-pair（每 2s 刷新，iceState=${iceState}，绿行=选中）</div>`;
      if (rows.length === 0) {
        el.insertAdjacentHTML('beforeend', `${header}<div class="s">⏳ 暂无 candidate-pair（ICE 协商中）...</div>`);
        return;
      }
      el.insertAdjacentHTML('beforeend',
        `${header}
         <table><tr><th>state</th><th>选</th><th>local</th><th>remote</th></tr>${rows.join('')}</table>`);
    } catch (e) {
      log3('err', 'getStats 失败: ' + (e as Error).message);
    }
  }, 2000);
}

/** 跟踪并输出 ICE 连接状态变化 */
function trackIceState(): void {
  const pc = diag.conn?.pc;
  if (!pc) return;
  pc.oniceconnectionstatechange = () => log3('s', `ICE state → ${pc.iceConnectionState}`);
  pc.onicegatheringstatechange = () => log3('s', `ICE gathering → ${pc.iceGatheringState}`);
}

function stopStats(): void {
  if (diag.timer) { clearInterval(diag.timer); diag.timer = null; }
}

function startHeartbeat(): void {
  setInterval(() => {
    if (diag.conn?.dc?.readyState === 'open') {
      try { diag.conn.dc.send(JSON.stringify({ type: 'diag_ping', ts: Date.now() })); diag.sent++; } catch { /* */ }
    }
  }, 1000);
}

function onMsg(_from: string, data: unknown): void {
  const m = data as { type: string };
  if (m.type === 'diag_ping') {
    diag.recv++;
    if (diag.conn?.dc?.readyState === 'open') {
      try { diag.conn.dc.send(JSON.stringify({ type: 'diag_pong', ts: Date.now() })); diag.sent++; } catch { /* */ }
    }
  } else if (m.type === 'diag_pong') {
    diag.recv++;
  }
}

function showQrBlock(label: string, json: string, container: HTMLElement): void {
  const row = document.createElement('div');
  row.innerHTML = `<div class="step">${label}</div>`;
  const img = document.createElement('img');
  img.className = 'qr';
  img.alt = 'QR';
  row.appendChild(img);
  const ta = document.createElement('textarea');
  ta.readOnly = true;
  ta.value = json;
  row.appendChild(ta);
  const copy = document.createElement('button');
  copy.className = 'btn';
  copy.textContent = '📋 复制 JSON';
  copy.onclick = () => { navigator.clipboard.writeText(json).then(() => log3('ok', '已复制')).catch(() => log3('err', '复制失败')); };
  row.appendChild(copy);
  container.appendChild(row);
  encodeQR(JSON.parse(json) as any).then(url => { img.src = url; }).catch(e => log3('err', 'QR 生成失败: ' + e.message));
}

function inputBlock(label: string, onJson: (json: string) => void, container: HTMLElement): void {
  const row = document.createElement('div');
  row.innerHTML = `<div class="step">${label}</div>`;
  const ta = document.createElement('textarea');
  ta.placeholder = '粘贴对方 JSON（或点下方按钮选二维码图片）';
  row.appendChild(ta);
  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = '✓ 提交';
  btn.onclick = () => {
    const data = decodeQR(ta.value);
    if (!data) { log3('err', 'JSON 解析失败'); return; }
    onJson(ta.value);
  };
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/*';
  file.style.display = 'none';
  const scan = document.createElement('button');
  scan.className = 'btn';
  scan.textContent = '📷 扫码图片';
  scan.onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files?.[0];
    if (!f) return;
    const data = await scanImage(f);
    if (data) { ta.value = JSON.stringify(data); onJson(ta.value); }
    else log3('err', '图片中未识别到二维码');
  };
  row.append(btn, scan, file);
  container.appendChild(row);
}

function waitDcOpen(conn: Connection, timeoutMs = 15000): Promise<boolean> {
  if (conn.dc?.readyState === 'open') return Promise.resolve(true);
  return new Promise(resolve => {
    const timer = setTimeout(() => { conn.onDcOpen = undefined; resolve(false); }, timeoutMs);
    conn.onDcOpen = () => { clearTimeout(timer); resolve(true); };
  });
}

async function setupConnected(conn: Connection, role: string): Promise<void> {
  diag.conn = conn;
  diag.role = role;
  trackIceState();
  startStats();
  const ok = await waitDcOpen(conn);
  log3(ok ? 'ok' : 'err', ok ? `✅ 数据通道已打开（role=${role}）` : '❌ 数据通道超时未打开');
  if (ok) {
    startStats();
    startHeartbeat();
    log3('s', `心跳: 已发送 ${diag.sent} 条（对端收到后回 pong）`);
    setInterval(() => {
      const st = document.getElementById('heartbeat');
      if (st) st.textContent = `心跳: 发送 ${diag.sent} / 接收 ${diag.recv}  (dc=${diag.conn?.dc?.readyState})`;
    }, 1000);
    const hb = document.createElement('div');
    hb.id = 'heartbeat';
    hb.className = 's';
    $('m3').appendChild(hb);
  }
}

async function mod3Host(): Promise<void> {
  clear('m3');
  log3('step', '创建端：生成 offer（复用生产 webrtc 流程）...');
  try {
    const conn = await hostCreateOffer('DIAG6', (c, d) => onMsg(c.peerId, d));
    const fields = extractFields(conn.pc.localDescription!.sdp!);
    const json = JSON.stringify({ t: 'offer', rc: 'DIAG6', ...fields });
    log3('ok', `offer 已生成（候选 ${fields.c.length} 条）`);
    showQrBlock('Offer（发给加入端）', json, $('m3'));
    inputBlock('等待 Answer（粘贴加入端返回的 JSON）', async (answerJson) => {
      const flat = JSON.parse(answerJson) as SdpFields & { rc?: string };
      log3('s', '提交 answer...');
      try {
        await hostAcceptAnswer('DIAG6', flat);
        await setupConnected(conn, 'host');
      } catch (e) {
        log3('err', 'acceptAnswer 失败: ' + (e as Error).message);
      }
    }, $('m3'));
  } catch (e) {
    log3('err', '创建失败: ' + (e as Error).message);
  }
}

async function mod3Guest(): Promise<void> {
  clear('m3');
  log3('step', '加入端：等待 offer');
  inputBlock('Offer（粘贴创建端 JSON 或扫码）', async (offerJson) => {
    const flat = JSON.parse(offerJson) as SdpFields & { rc?: string };
    log3('s', '生成 answer...');
    try {
      const conn = await guestCreateAnswer(flat, (_c, d) => onMsg('host', d));
      const fields = extractFields(conn.pc.localDescription!.sdp!);
      const json = JSON.stringify({ t: 'answer', rc: flat.rc ?? 'DIAG6', ...fields });
      log3('ok', `answer 已生成（候选 ${fields.c.length} 条）`);
      showQrBlock('Answer（发回创建端）', json, $('m3'));
      await setupConnected(conn, 'guest');
    } catch (e) {
      log3('err', 'join 失败: ' + (e as Error).message);
    }
  }, $('m3'));
}

$('btn-cand').addEventListener('click', () => void mod2());
$('btn-host').addEventListener('click', () => void mod3Host());
$('btn-guest').addEventListener('click', () => void mod3Guest());

(async () => {
  $('status').textContent = '模块①...';
  await mod1();
  $('status').textContent = '模块②...';
  await mod2();
  $('status').textContent = '完成';
})().catch(e => { out('m1', 'err', 'FATAL: ' + (e as Error).message); $('status').textContent = '失败'; });
