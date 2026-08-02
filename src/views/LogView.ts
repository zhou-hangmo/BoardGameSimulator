// Modal log viewer
import { Logger } from '../utils/Logger';

export class LogView {
  private overlay: HTMLElement | null = null;

  show(): void {
    if (this.overlay) { this.close(); }

    this.overlay = document.createElement('div');
    this.overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.9);display:flex;flex-direction:column;padding:16px;color:#0f0;font:13px monospace;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
    header.innerHTML = `<span style="font-size:16px;">📋 日志</span><span id="log-count" style="color:#888;font-size:12px;"></span>`;

    const btnCopy = document.createElement('button');
    btnCopy.textContent = '📋 复制';
    btnCopy.style.cssText = 'cursor:pointer;background:#333;color:#ff0;border:1px solid #ff0;border-radius:4px;padding:4px 10px;font-size:13px;margin-right:8px;';
    btnCopy.onclick = () => {
      this.copyText(Logger.getFormatted());
    };

    const btnClose = document.createElement('button');
    btnClose.textContent = '✕ 关闭';
    btnClose.style.cssText = 'cursor:pointer;background:#333;color:#fff;border:1px solid #fff;border-radius:4px;padding:4px 10px;font-size:13px;';
    btnClose.onclick = () => this.close();

    const btnWrap = document.createElement('div');
    btnWrap.appendChild(btnCopy);
    btnWrap.appendChild(btnClose);
    header.appendChild(btnWrap);
    this.overlay.appendChild(header);

    const content = document.createElement('div');
    content.id = 'log-content';
    content.style.cssText = 'flex:1;overflow-y:auto;white-space:pre-wrap;word-break:break-all;border:1px solid #333;border-radius:4px;padding:8px;';
    content.textContent = Logger.getFormatted() || '暂无日志';
    this.overlay.appendChild(content);

    document.body.appendChild(this.overlay);

    // Auto-refresh every 2s
    (this.overlay as any).__logTimer = setInterval(() => {
      content.textContent = Logger.getFormatted() || '暂无日志';
      const countEl = this.overlay?.querySelector('#log-count');
      if (countEl) countEl.textContent = `(${Logger.getAll().length})`;
    }, 2000);
  }

  close(): void {
    if (this.overlay) {
      clearInterval((this.overlay as any).__logTimer);
      this.overlay.remove();
      this.overlay = null;
    }
  }

  private copyText(text: string): void {
    try {
      navigator.clipboard.writeText(text).then(() => {}).catch(() => {});
    } catch { /* ignore */ }
    const ta = document.createElement('textarea');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    ta.value = text; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); ta.remove();
  }
}

export const logView = new LogView();
