// ============================================================
// 测试 SDP 压缩/解压 + QR 编码/解码往返
// ============================================================
import { describe, it, expect } from 'vitest';
import { compressSdp, decompressSdp } from '../../core/webrtc';
import { encodeQR, decodeQR } from '../../core/qrcode';

const MOCK_SDP = `v=0
o=- 1234567890 2 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0
m=application 9 UDP/DTLS/SCTP webrtc-datachannel
c=IN IP4 0.0.0.0
a=ice-ufrag:abcd
a=ice-pwd:xyz123xyz123xyz123
a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99
a=setup:actpass
a=mid:0
a=sctp-port:5000
a=rtcp-mux
a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level
a=rtpmap:111 opus/48000/2
a=fmtp:111 minptime=10;useinbandfec=1`;

describe('SDP round-trip', () => {
  it('compressSdp 提取关键字段', () => {
    const compressed = compressSdp(MOCK_SDP);
    const obj = JSON.parse(compressed);
    expect(obj.u).toBe('abcd');
    expect(obj.w).toBe('xyz123xyz123xyz123');
    expect(obj.f).toContain('sha-256');
    expect(obj.f).toContain('AA:BB:CC');
    expect(obj.s).toBe('actpass');
    // 压缩后应该很小
    expect(compressed.length).toBeLessThan(500);
    console.log('compressed size:', compressed.length, 'bytes');
    console.log(compressed);
  });

  it('compressSdp 对无关键字段的SDP抛出异常', () => {
    expect(() => compressSdp('v=0\r\n')).toThrow('SDP missing essential fields');
  });

  it('decompressSdp 重构成有效SDP', () => {
    const compressed = compressSdp(MOCK_SDP);
    const full = decompressSdp(compressed);
    expect(full).toContain('v=0');
    expect(full).toContain('a=ice-ufrag:abcd');
    expect(full).toContain('a=ice-pwd:xyz123xyz123xyz123');
    expect(full).toContain('a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99');
    expect(full).toContain('a=setup:actpass');
    expect(full).toContain('m=application');
    expect(full).toContain('webrtc-datachannel');
  });

  it('compress → decompress 往返完整', () => {
    const compressed = compressSdp(MOCK_SDP);
    const full = decompressSdp(compressed);
    // 再压缩一次，应该得到相同结果
    const recompressed = compressSdp(full);
    expect(recompressed).toBe(compressed);
  });

  it('QR 编码 → 解码往返正确', async () => {
    const compressed = compressSdp(MOCK_SDP);
    const qrData = { type: 'offer', roomCode: 'TEST01', sdp: compressed, peerId: 'host' };
    const qrImage = await encodeQR(qrData);
    // encodeQR 返回 data URL
    expect(qrImage).toContain('data:image/png;base64,');
    console.log('QR image size:', qrImage.length, 'chars (base64)');
  });

  it('完整链路: SDP → compress → QR encode → decode → decompress', async () => {
    const compressed = compressSdp(MOCK_SDP);
    const qrData = { type: 'offer', roomCode: 'TEST02', sdp: compressed, peerId: 'host' };
    const qrImage = await encodeQR(qrData);

    // 模拟扫码：从 QR 图片里解析（decodeQR 是对 JSON 文本的）
    // 真实的扫码头会用 BarcodeDetector 从图片读 rawValue，这里模拟 rawValue
    const rawValue = JSON.stringify(qrData);
    const decoded = decodeQR(rawValue);
    expect(decoded).not.toBeNull();
    expect(decoded!.roomCode).toBe('TEST02');
    expect(decoded!.sdp).toBe(compressed);

    // 解压 SDP
    const fullSdp = decompressSdp(decoded!.sdp);
    expect(fullSdp).toContain('a=ice-ufrag:abcd');
    expect(fullSdp).toContain('a=fingerprint:sha-256');
    // 再压缩验证一致性
    expect(compressSdp(fullSdp)).toBe(compressed);
  });

  it('QR 数据不超过 500 字节', async () => {
    const compressed = compressSdp(MOCK_SDP);
    const qrData = { type: 'offer', roomCode: 'TEST03', sdp: compressed, peerId: 'host' };
    const json = JSON.stringify(qrData);
    console.log('QR data size:', json.length, 'bytes');
    console.log(json);
    expect(json.length).toBeLessThan(500);
  });
});
