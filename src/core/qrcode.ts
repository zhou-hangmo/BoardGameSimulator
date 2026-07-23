// QR code signaling — offline fallback
import QRCode from 'qrcode';
import jsQR from 'jsqr';

export interface SignalingData {
  type?: 'offer' | 'answer';
  roomCode: string;
  sdp: string;
  peerId: string;
  ipv6?: string;
  lanIp?: string;
}

/** Encode signaling data to QR code data URL */
export async function encodeQR(data: SignalingData): Promise<string> {
  const json = JSON.stringify(data);
  return QRCode.toDataURL(json, { width: 512, margin: 2, errorCorrectionLevel: 'M' });
}

/** Decode QR from image file — BarcodeDetector first, jsQR fallback */
export async function scanImage(file: File): Promise<SignalingData | null> {
  // Try BarcodeDetector (native, fast)
  try {
    const bitmap = await createImageBitmap(file);
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const barcodes = await detector.detect(bitmap);
    bitmap.close();
    if (barcodes.length > 0) {
      return JSON.parse(barcodes[0].rawValue) as SignalingData;
    }
  } catch { /* fall through to jsQR */ }

  // Fallback: jsQR (pure JS, works everywhere)
  try {
    const data = await fileToImageData(file);
    const code = jsQR(data.pixels, data.width, data.height);
    if (code) return JSON.parse(code.data) as SignalingData;
  } catch { /* fail */ }

  return null;
}

async function fileToImageData(file: File): Promise<{ pixels: Uint8ClampedArray; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { pixels: imageData.data, width: canvas.width, height: canvas.height };
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
