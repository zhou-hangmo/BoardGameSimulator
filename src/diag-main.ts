// SDP round-trip diagnostic using project native source
import { extractFields, createTemplateSdp, applyFields } from './core/webrtc';

const out = document.getElementById('out')!;
const st = document.getElementById('status')!;

const log = (cls: string, text: string) => {
  out.innerHTML += `<span class="${cls}">${text}</span>\n`;
};

function waitIce(pc: RTCPeerConnection): Promise<void> {
  return new Promise(resolve => {
    if (pc.iceGatheringState === 'complete') resolve();
    else {
      pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') resolve(); };
      setTimeout(resolve, 3000);
    }
  });
}

async function run() {
  // ── Step 1 ──
  st.textContent = 'Step 1/5';
  log('step', '=== Step 1: 生成原生 offer + 等待 ICE ===');
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  pc.createDataChannel('game');
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIce(pc);
  const origSdp = pc.localDescription!.sdp!;
  log('ok', '✅ 原生 offer (长度 ' + origSdp.length + ')');
  log('s', '--- 原始 SDP ---');
  log('', origSdp);
  log('s', '--- SDP 中 candidate 行 ---');
  origSdp.split('\n').filter(l => l.startsWith('a=candidate')).forEach(l => log('', l));
  log('s', `候选行总计: ${origSdp.split('\n').filter(l => l.startsWith('a=candidate')).length}`);

  // ── Step 2 ──
  st.textContent = 'Step 2/5';
  log('step', '\n=== Step 2: extractFields ===');
  let fields;
  try {
    fields = extractFields(origSdp);
    log('ok', `✅ u=${fields.u} w=${fields.w.substring(0,8)}... s=${fields.s} p=${fields.p} candidates=${fields.c.length}`);
    fields.c.forEach((c, i) => log('', `  [${i}] ${c}`));
    if (fields.c.length === 0) log('err', '⚠ candidates 为空！');
  } catch (e) {
    log('err', '❌ extractFields 抛异常: ' + (e as Error).message);
    return;
  }

  // ── Step 3 ──
  st.textContent = 'Step 3/5';
  log('step', '\n=== Step 3: createTemplateSdp ===');
  const template = await createTemplateSdp();
  log('ok', '✅ 模板 (长度 ' + template.length + ')');
  log('s', '--- 模板 SDP ---');
  log('', template);
  log('s', `模板候选行总计: ${template.split('\n').filter(l => l.startsWith('a=candidate')).length}`);

  // ── Step 4 ──
  st.textContent = 'Step 4/5';
  log('step', '\n=== Step 4: applyFields ===');
  let rebuilt: string;
  try {
    rebuilt = applyFields(template, fields);
    log('ok', '✅ 重建 SDP (长度 ' + rebuilt.length + ')');
    log('s', '--- 重建 SDP ---');
    log('', rebuilt);
    log('s', `重建候选行总计: ${rebuilt.split('\n').filter(l => l.startsWith('a=candidate')).length}`);
  } catch (e) {
    log('err', '❌ applyFields 抛异常: ' + (e as Error).message);
    return;
  }

  // ── Step 5 ──
  st.textContent = 'Step 5/5';
  log('step', '\n=== Step 5: setRemoteDescription ===');
  const pc2 = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  pc2.ondatachannel = () => {};
  try {
    await pc2.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: rebuilt }));
    log('ok', '✅ setRemoteDescription 成功！全链路通过！');
  } catch (e) {
    const msg = (e as Error).message;
    log('err', `❌ setRemoteDescription 失败:`);
    log('err', '   ' + msg);
    log('err', `   <button id="diag-copy" style="margin-left:6px;cursor:pointer;background:#333;color:#ff0;border:1px solid #ff0;border-radius:4px;padding:4px 10px;font-size:13px;">📋 复制完整错误</button>`);
    setTimeout(() => {
      document.getElementById('diag-copy')?.addEventListener('click', () => {
        navigator.clipboard.writeText(msg + '\n\n--- original SDP ---\n' + origSdp + '\n\n--- template SDP ---\n' + template + '\n\n--- rebuilt SDP ---\n' + rebuilt);
      });
    }, 0);
  }
  pc2.close();
  pc.close();

  st.textContent = '完成';
}

run().catch(e => {
  log('err', 'FATAL: ' + (e as Error).message);
  st.textContent = '失败';
});
