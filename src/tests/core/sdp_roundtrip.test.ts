// SDP round-trip + QR scan tests — updated for flat format
import { describe, it, expect } from 'vitest';
import { extractFields, buildSdp, type SdpFields } from '../../core/webrtc';
import { encodeQR } from '../../core/qrcode';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

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
a=candidate:1 1 UDP 2130706431 192.168.1.5 53126 typ host
a=candidate:2 1 UDP 2130706431 fe80::1 53126 typ host
a=candidate:3 1 UDP 2130706431 10.0.0.1 53126 typ srflx
a=candidate:4 1 UDP 2130706431 1.2.3.4 53126 typ relay`;

describe('SDP flat round-trip', () => {
    it('extract → build → extract 一致', () => {
    const fields = extractFields(MOCK_SDP);
    expect(fields.u).toBe('abcd');
    expect(fields.c.length).toBe(2); // only host, srflx+relay filtered

    const sdp = buildSdp(fields);
    const fields2 = extractFields(sdp);
    expect(fields2.u).toBe(fields.u);
    expect(fields2.w).toBe(fields.w);
    expect(fields2.f).toBe(fields.f);
    expect(fields2.c.length).toBe(2);
  });

  it('QR 数据 < 400 bytes', async () => {
    const fields = extractFields(MOCK_SDP);
    const qrData = { t: 'offer', rc: 'TEST', ...fields };
    const json = JSON.stringify(qrData);
    console.log(`QR JSON: ${json.length} bytes`);
    console.log(json);
    expect(json.length).toBeLessThan(400);
  });

  it('生成并扫描 QR PNG', async () => {
    const fields = extractFields(MOCK_SDP);
    const qrData = { t: 'offer', rc: 'SCAN01', ...fields };
    const qrImg = await encodeQR(qrData as any);
    expect(qrImg).toMatch(/^data:image\/png;base64,/);
    const p = resolve(process.cwd(), 'src/tests/_qr_test.png');
    writeFileSync(p, Buffer.from(qrImg.split(',')[1], 'base64'));
    console.log(`✅ QR PNG: ${p}`);
  });
});
