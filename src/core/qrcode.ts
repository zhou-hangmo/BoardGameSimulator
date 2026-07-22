// QR code signaling — offline fallback for Nostr
import QRCode from 'qrcode';

export interface SignalingData {
  roomCode: string;
  sdp?: string;
  ipv6?: string;
  lanIp?: string;
  peerId: string;
}

/** Encode signaling data to QR code data URL */
export async function encodeQR(data: SignalingData): Promise<string> {
  const json = JSON.stringify(data);
  return QRCode.toDataURL(json, { width: 400, margin: 2, errorCorrectionLevel: 'L' });
}

/** Decode signaling data from QR string (from scanner or URL param) */
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
