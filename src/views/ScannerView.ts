// ============================================================
// BoardGameSimulator — 二维码扫描器视图
// ============================================================
import { el } from '../utils/dom';

type ScanCallback = (data: unknown, done: () => void, retry: () => void) => void;

export class ScannerView {
  private stream: MediaStream | null = null;

  async start(onResult: ScanCallback): Promise<void> {
    const overlay = el('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;display:flex;flex-direction:column;';

    const video = el('video');
    video.style.cssText = 'flex:1;width:100%;object-fit:cover;';
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    overlay.appendChild(video);

    const btnClose = el('button');
    btnClose.textContent = '关闭';
    btnClose.style.cssText = 'position:absolute;top:16px;right:16px;padding:8px 16px;border-radius:20px;border:none;background:rgba(0,0,0,.5);color:#fff;font-size:16px;z-index:1;cursor:pointer;';
    overlay.appendChild(btnClose);

    const hint = el('div');
    hint.style.cssText = 'position:absolute;bottom:40px;left:0;right:0;text-align:center;color:#fff;font-size:14px;opacity:.7;';
    overlay.appendChild(hint);

    const debug = el('div');
    debug.style.cssText = 'position:absolute;top:60px;left:0;right:0;padding:8px;text-align:center;color:#0f0;font-size:12px;font-family:monospace;z-index:2;pointer-events:none;';
    overlay.appendChild(debug);

    document.body.appendChild(overlay);

    const cleanup = () => {
      this.stream?.getTracks().forEach(t => t.stop());
      this.stream = null;
      overlay.remove();
    };

    btnClose.onclick = cleanup;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      video.srcObject = this.stream;
      await video.play();

      const canvas = el('canvas');
      const ctx = canvas.getContext('2d')!;
      let detector: BarcodeDetector | null = null;
      try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch { /* */ }
      const { default: jsQR } = await import('jsqr');

      let frameCount = 0;
      let lastLogTime = Date.now();

      const decodeFrame = (): string | null => {
        frameCount++;
        if (detector) {
          try { detector.detect(canvas); } catch { detector = null; }
        }
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height);
        return code?.data ?? null;
      };

      let lastDetected = '';
      let done = false;
      let processing = false;
      const finish = () => { done = true; processing = false; cleanup(); };
      const retry = () => { processing = false; lastDetected = ''; };

      const tick = () => {
        if (done || !this.stream) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const raw = decodeFrame();
        const now = Date.now();
        if (now - lastLogTime > 500 && !processing) {
          const fps = Math.round(frameCount / ((now - lastLogTime) / 1000));
          if (raw) {
            hint.textContent = '检测到二维码';
            debug.textContent = `fps:${fps} | 数据:${raw.substring(0, 60)}...`;
          } else {
            hint.textContent = '将二维码对准取景框';
            debug.textContent = `fps:${fps} | video:${canvas.width}x${canvas.height} | jsQR:未检测到`;
          }
          frameCount = 0;
          lastLogTime = now;
        }
        if (raw && raw !== lastDetected) {
          lastDetected = raw;
          try {
            const data = JSON.parse(raw);
            processing = true;
            onResult(data, finish, retry);
          } catch { /* not our QR */ }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (e) {
      cleanup();
      throw e;
    }
  }
}
