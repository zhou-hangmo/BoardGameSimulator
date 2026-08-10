// ============================================================
// BoardGameSimulator — 应用层加密（浏览器 WebCrypto 版）
// AES-256-GCM，输出格式 base64(iv(12) + ciphertext + tag(16))
// 与 host-server 的 Node crypto 实现互操作
// ============================================================

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 生成 256 位随机密钥（hex） */
export function generateKey(): string {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return bytesToHex(a);
}

async function getKey(keyHex: string): Promise<CryptoKey> {
  const raw = hexToBytes(keyHex);
  const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  return crypto.subtle.importKey('raw', buf, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** 加密文本 → base64(iv + ciphertext + tag) */
export async function encryptText(keyHex: string, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getKey(keyHex);
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  const out = new Uint8Array(iv.length + enc.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(enc), iv.length);
  return bytesToBase64(out);
}

/** 解密 base64(iv + ciphertext + tag) → 原文 */
export async function decryptText(keyHex: string, b64: string): Promise<string> {
  const data = base64ToBytes(b64);
  const iv = data.slice(0, 12);
  const ct = data.slice(12);
  const key = await getKey(keyHex);
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(dec);
}
