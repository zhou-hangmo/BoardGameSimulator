// ============================================================
// BoardGameSimulator — 首页 + 抽屉组件
// ============================================================
import { animate } from 'motion';
import { BaseView } from './BaseView';
import { el, qs, qso } from '../utils/dom';

declare const __COMMIT__: string;

const ARROW_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="#0088ff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4l6 6-6 6"/></svg>`;

export interface GameMeta {
  id: string; name: string; description: string;
  playerCount: string; cardCount?: number; tags: string[]; ready: boolean; config?: unknown;
}

export class HomeView extends BaseView {
  private open = false;
  private dragging = false;
  private dragStart = 0;
  private progress = 0;
  private moved = false;

  private stage!: HTMLElement;
  private drawer!: HTMLElement;
  private mask!: HTMLElement;
  private homeBtn!: HTMLElement;

  private readonly TR = 'transform 0.4s cubic-bezier(0.23, 1, 0.32, 1)';
  private readonly vh = () => window.innerHeight;

  constructor(parent: HTMLElement, private gamesFn: () => GameMeta[]) {
    super(parent);
  }

  private get games(): GameMeta[] {
    return this.gamesFn();
  }

  protected createEl(): HTMLElement {
    const container = el('div', { style: 'width:100%;height:100%;' });

    const fileInput = el('input', {
      type: 'file', accept: '.json,image/*',
      id: 'load-input', style: 'display:none',
    });
    container.appendChild(fileInput);

    this.stage = el('div', { class: 'main-stage', id: 'main-stage' });
    this.stage.innerHTML = this.buildStageHtml();
    container.appendChild(this.stage);

    this.mask = el('div', { class: 'drawer-mask', id: 'drawer-mask' });
    container.appendChild(this.mask);

    this.drawer = el('div', { class: 'drawer', id: 'drawer' });
    container.appendChild(this.drawer);

    this.homeBtn = el('div', { id: 'global-home' });
    this.homeBtn.textContent = '⌂';
    this.homeBtn.addEventListener('click', () => {
      this.emit('ui:go_home');
    });
    // Note: homeBtn is inside HomeView's element, so it's visible on home screen.
    // A separate global home button is created by main.ts for other views.
    container.appendChild(this.homeBtn);

    return container;
  }

  private buildStageHtml(): string {
    return `<section class="home-sec">
      <span id="commit-count" style="position:absolute;top:14px;left:14px;font-size:11px;color:var(--label3);z-index:10;"></span>
      <button id="btn-load" class="btn btn-secondary" style="position:absolute;top:12px;right:56px;font-size:13px;padding:6px 12px;z-index:10;">📂</button>
      <button id="btn-scan-home" class="btn btn-secondary" style="position:absolute;top:12px;right:12px;font-size:13px;padding:6px 12px;z-index:10;">📷</button>
      <div class="home-logo"><img src="${import.meta.env.BASE_URL}assets/icons/app-logo.svg" alt="logo" /></div>
      <div class="input-wrap" id="wrap">
        <input class="input-box" id="code-input" maxlength="6" autocomplete="off" inputmode="text" />
        <div class="input-arrow" id="arrow">${ARROW_SVG}</div>
      </div>
    </section>`;
  }

  private buildDrawerHtml(): string {
    const cells = this.games.map(g =>
      `<div class="cell" data-gid="${g.id}">
        <div class="cell-icon game">🃏</div>
        <div class="cell-body">
          <div class="cell-title">${g.name}</div>
          <div class="cell-subtitle">${g.description} · ${g.playerCount}人</div>
        </div>
      </div>`
    ).join('');

    return `<div class="drawer-scroll" id="drawer-scroll">
      <div class="drawer-import-pill" id="cell-import"><span class="pill-plus">+</span></div>
      ${cells}
      <div style="height:60px;"></div>
    </div>`;
  }

  protected afterMount(): void {
    // Refresh drawer content
    this.drawer.innerHTML = this.buildDrawerHtml();
    this.bindEvents();
    this.apply(0);

    const commitEl = qso<HTMLElement>('#commit-count', this.stage);
    if (commitEl) commitEl.textContent = '#' + __COMMIT__;
  }

  private bindEvents(): void {
    const loadInput = qs<HTMLInputElement>('#load-input', this.root);
    qs('#btn-load', this.stage).addEventListener('pointerdown', () => loadInput?.click());

    loadInput?.addEventListener('change', async () => {
      const f = loadInput.files?.[0]; if (!f) return;
      this.toast('加载中...');
      try {
        const text = await f.text();
        const data = JSON.parse(text);
        if (data.players) { this.emit('ui:load_game', text); return; }
        const { decodeQR } = await import('../core/qrcode');
        const sd = decodeQR(text);
        if (sd?.sdp) { this.emit('ui:load_game', sd.sdp); return; }
        this.toast('无法识别');
      } catch { this.toast('文件无效'); }
    });

    qs('#btn-scan-home', this.stage).addEventListener('click', () => {
      this.emit('ui:open_scanner', (data: unknown) => {
        this.emit('ui:join_room', JSON.stringify(data));
      });
    });

    const input = qs<HTMLInputElement>('#code-input', this.stage);
    const arrow = qs('#arrow', this.stage);

    input.addEventListener('input', () => {
      const v = input.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      input.value = v;
      v.length === 6 ? arrow.classList.add('on') : arrow.classList.remove('on');
    });

    arrow.addEventListener('pointerdown', async () => {
      if (input.value.length !== 6) return;
      input.blur();
      try { this.emit('ui:join_room', input.value); }
      catch { this.toast('加入失败'); }
    });

    this.drawer.querySelectorAll('.cell[data-gid]').forEach(c => {
      c.addEventListener('click', () => {
        const gid = (c as HTMLElement).dataset.gid!;
        this.emit('ui:show_game_detail', gid);
      });
    });

    qs('#cell-import', this.drawer).addEventListener('click', () => {
      this.emit('ui:import_game');
    });

    this.bindDrawerGestures();
  }

  private bindDrawerGestures(): void {
    const dScroll = qs('#drawer-scroll', this.drawer);
    const canClose = () => this.open && dScroll.scrollTop <= 10;
    const hasKeyboard = () =>
      document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLTextAreaElement;
    const isInteractive = (target: any): boolean => {
      while (target) {
        if (['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true;
        target = target.parentElement;
      }
      return false;
    };

    const onDown = (y: number) => {
      this.dragging = true; this.moved = false; this.dragStart = y;
      animate(this.homeBtn, { opacity: 0 }, { duration: 0.1 });
    };
    const onMove = (y: number) => {
      if (!this.dragging) return;
      const dy = this.dragStart - y;
      if (Math.abs(dy) > 5) this.moved = true;
      this.apply(this.open ? 1 + dy / this.vh() : dy / this.vh());
    };
    const onUp = () => {
      if (!this.dragging) return; this.dragging = false;
      if (!this.moved) { this.restoreHomeBtn(); return; }
      this.snap(this.open ? this.progress >= 0.80 : this.progress > 0.20);
    };
    const onTouchStart = (e: TouchEvent) => {
      if (hasKeyboard() || isInteractive(e.target)) return;
      if (this.open && !canClose()) return;
      onDown(e.touches[0].clientY);
    };

    this.drawer.addEventListener('touchstart', onTouchStart, { passive: false });
    this.stage.addEventListener('touchstart', (e: TouchEvent) => {
      if (this.open) return; onTouchStart(e);
    }, { passive: true });

    window.addEventListener('touchmove', (e: TouchEvent) => {
      if (!this.dragging) return;
      if (this.open && !canClose()) { this.dragging = false; return; }
      e.preventDefault();
      onMove(e.touches[0].clientY);
    }, { passive: false });
    window.addEventListener('touchend', () => { if (this.dragging) onUp(); });
    this.drawer.addEventListener('mousedown', (e: MouseEvent) => {
      if (hasKeyboard() || isInteractive(e.target)) return;
      e.preventDefault(); onDown(e.clientY);
    });
    this.stage.addEventListener('mousedown', (e: MouseEvent) => {
      if (hasKeyboard() || isInteractive(e.target)) return;
      e.preventDefault(); onDown(e.clientY);
    });
    window.addEventListener('mousemove', (e: MouseEvent) => onMove(e.clientY));
    window.addEventListener('mouseup', () => onUp());
    document.addEventListener('wheel', (e: WheelEvent) => {
      if (hasKeyboard() || (e.target as Element)?.closest('.scroll')) return;
      e.preventDefault();
      if (e.deltaY > 0 && !this.open) this.snap(true);
      else if (e.deltaY < 0 && this.open) this.snap(false);
    }, { passive: false });
  }

  private apply(p: number, anim = false): void {
    this.progress = Math.max(0, Math.min(1, p));
    this.drawer.style.transition = anim ? this.TR : 'none';
    this.stage.style.transition = anim ? this.TR : 'none';
    const bp = Math.round(this.progress * 32);
    const sat = (1 + this.progress * 0.8).toFixed(2);
    this.drawer.style.backdropFilter = anim ? 'blur(32px) saturate(1.8)' : `blur(${bp}px) saturate(${sat})`;
    (this.drawer.style as any).webkitBackdropFilter = this.drawer.style.backdropFilter;
    this.drawer.style.transform = `translateY(${(1 - this.progress) * 100}%)`;
    this.mask.style.transition = anim ? this.TR : 'none';
    this.mask.style.opacity = (this.progress * 0.25).toFixed(3);
    this.stage.style.transform = `scale(${1 - this.progress * 0.2})`;
    this.stage.style.filter = `blur(${(this.progress * 8).toFixed(1)}px) saturate(${(1 + this.progress * 0.3).toFixed(2)})`;
    this.stage.style.borderRadius = `${this.progress * 12}px`;
    (this.stage.style as any).willChange = 'transform';
  }

  private snap(toOpen: boolean): void {
    this.open = toOpen;
    this.apply(toOpen ? 1 : 0, true);
    animate(this.homeBtn, { opacity: 0 }, { duration: 0.1 });
    setTimeout(() => this.restoreHomeBtn(), 200);
  }

  private restoreHomeBtn(): void {
    animate(this.homeBtn, { opacity: 1 }, { type: 'spring', bounce: 0.3, duration: 0.3 });
  }

  setOpen(v: boolean): void {
    this.snap(v);
  }
}
