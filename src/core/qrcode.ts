// QR code signaling — offline fallback for Nostr
import QRCode from 'qrcode';

export interface SignalingData {
  roomCode: string;
  sdp: string;    // JSON-serialized RTCSessionDescription
  peerId: string;
  ipv6?: string;
  lanIp?: string;
}

/** Encode signaling data to QR code data URL */
export async function encodeQR(data: SignalingData): Promise<string> {
  const json = JSON.stringify(data);
  return QRCode.toDataURL(json, { width: 400, margin: 2, errorCorrectionLevel: 'L' });
}

/** Decode QR from image file using BarcodeDetector API */
export async function scanImage(file: File): Promise<SignalingData | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const barcodes = await detector.detect(bitmap);
    bitmap.close();
    if (barcodes.length > 0) {
      return JSON.parse(barcodes[0].rawValue) as SignalingData;
    }
    return null;
  } catch {
    // BarcodeDetector not supported, try text fallback
    try {
      const text = await file.text();
      return decodeQR(text);
    } catch { return null; }
  }
}
export function decodeQR(text: string): SignalingData | null {
  try {
    return JSON.parse(text) as SignalingData;
  } catch {
    return null;
  }
}

/** Share signaling data via system share sheet (mobile) */
export async function shareSignaling(data: SignalingData): Promise<boolean> {
  const json = JSON.stringify(data);
  if (navigator.share) {
    try {
      await navigator.share({ title: '加入游戏', text: json });
      return true;
    } catch { /* user cancelled */ }
  }
  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(json);
    return true;
  } catch { return false; }
}
