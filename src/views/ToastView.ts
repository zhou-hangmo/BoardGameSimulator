// ============================================================
// BoardGameSimulator — Toast 通知组件
// ============================================================
import { animate } from 'motion';

export class ToastManager {
  static show(msg: string): void {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);

    // 只动 opacity——避免 transform 覆盖 CSS 的 translateX(-50%) 居中
    animate(t, { opacity: [0, 1] }, {
      duration: 0.2,
    });

    setTimeout(() => {
      animate(t, { opacity: 0 }, {
        duration: 0.15,
      }).finished.then(() => t.remove());
    }, 2000);
  }
}
