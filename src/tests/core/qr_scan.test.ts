// ============================================================
// 实战验证：生成真实 QR PNG，验证完整链路
// ============================================================
import { describe, it, expect } from 'vitest';
import { compressSdp, decompressSdp } from '../../core/webrtc';
import { encodeQR, decodeQR, type SignalingData } from '../../core/qrcode';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const MOCK_SDP = `v=0
o=- 1234567890 2 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0
m=application 9 UDP/DTLS/SCTP webrtc-datachannel
c=IN IP4 0.0.0.0
a=ice-ufrag:abcXYZ
a=ice-pwd:mySecretPwd123456
a=fingerprint:sha-256 01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF
a=setup:actpass
a=mid:0
a=sctp-port:5000`;

describe('QR 实战验证', () => {
  const compressed = compressSdp(MOCK_SDP);
  const qrData: SignalingData = { type: 'offer', roomCode: 'REAL01', sdp: compressed, peerId: 'host' };

  it('Step 1: 压缩数据体量', () => {
    expect(compressed).toBeTypeOf('string');
    const obj = JSON.parse(compressed);
    expect(obj.u).toBe('abcXYZ');
    expect(obj.s).toBe('actpass');
    expect(compressed.length).toBeLessThan(200);
  });

  it('Step 2: encodeQR 生成有效 PNG', async () => {
    const dataUrl = await encodeQR(qrData);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    // 写入文件供肉眼检查
    const base64 = dataUrl.split(',')[1];
    const buf = Buffer.from(base64, 'base64');
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4E);
    expect(buf[3]).toBe(0x47);
    const p = resolve(process.cwd(), 'src/tests/_qr_test.png');
    writeFileSync(p, buf);
    console.log(`✅ QR PNG 已生成: ${p} (${buf.length} bytes)`);
  });

  it('Step 3: QR 数据 → decodeQR 可解析', () => {
    const raw = JSON.stringify(qrData);
    const decoded = decodeQR(raw);
    expect(decoded).not.toBeNull();
    expect(decoded!.roomCode).toBe('REAL01');
    expect(decoded!.sdp).toBe(compressed);
  });

  it('Step 4: decompressSdp 重建完整 SDP', () => {
    const full = decompressSdp(compressed);
    expect(full).toContain('a=ice-ufrag:abcXYZ');
    expect(full).toContain('a=fingerprint:sha-256 01:23:45:67');
    expect(full).toContain('m=application');
  });

  it('Step 5: 再压缩验证一致性', () => {
    const full = decompressSdp(compressed);
    const recompressed = compressSdp(full);
    expect(recompressed).toBe(compressed);
  });

  it('Step 6: QR JSON 总大小 ≤ 300 bytes', () => {
    const json = JSON.stringify(qrData);
    console.log(`📦 QR JSON: ${json.length} bytes`);
    console.log(json);
    expect(json.length).toBeLessThan(300);
  });
});
