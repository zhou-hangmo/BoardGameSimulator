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

    animate(t, { opacity: [0, 1], y: [8, 0] }, {
      type: 'spring', bounce: 0.3, duration: 0.3,
    });

    setTimeout(() => {
      animate(t, { opacity: 0, y: -4 }, {
        type: 'spring', bounce: 0, duration: 0.2,
      }).finished.then(() => t.remove());
    }, 2000);
  }
}
