// ============================================================
// BoardGameSimulator — 保活设置引导页（App 主机专用）
// 图文引导用户完成系统保活设置（厂商分支）
// ============================================================
import { BaseView } from './BaseView';
import { el } from '../utils/dom';

interface Step {
  title: string;
  detail: string;
}

export class KeepAliveView extends BaseView {
  private opened = false;

  constructor(parent: HTMLElement) {
    super(parent);
  }

  protected createEl(): HTMLElement {
    return el('div', { style: 'position:fixed;inset:0;z-index:99990;background:var(--color-bg2,#f2f2f7);display:flex;flex-direction:column;' });
  }

  /** 展示引导页（全屏覆盖） */
  show(): void {
    if (this.opened) return;
    this.opened = true;
    this.el.innerHTML = '';
    const steps = this.buildSteps();

    const bar = el('div', { class: 'nav-bar' });
    bar.append(el('span', { class: 'nav-title' }, ['保活设置']));
    this.el.append(bar);

    const scroll = el('div', { style: 'flex:1;min-height:0;overflow-y:auto;padding:16px;' });
    scroll.append(el('div', { style: 'font-size:13px;color:var(--color-label2);line-height:1.6;margin-bottom:14px;' },
      ['为保证大厅持续在线（手机锁屏/切后台不被系统停止），请按以下步骤设置。']));

    for (let i = 0; i < steps.length; i++) {
      const card = el('div', { style: 'background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:10px;' });
      card.append(el('div', { style: 'font-weight:600;font-size:14px;margin-bottom:6px;' }, [`第 ${i + 1} 步 · ${steps[i].title}`]));
      card.append(el('div', { style: 'font-size:13px;color:var(--color-label2);line-height:1.7;white-space:pre-line;' }, [steps[i].detail]));
      scroll.append(card);
    }

    const done = el('button', { class: 'btn btn-primary', style: 'width:100%;' }, ['我已全部完成']);
    done.addEventListener('pointerdown', () => {
      try { localStorage.setItem('bgs-keepalive-shown', '1'); } catch { /* ignore */ }
      this.close();
    });
    const skip = el('button', { class: 'btn btn-secondary', style: 'width:100%;margin-top:8px;' }, ['跳过（下次提醒）']);
    skip.addEventListener('pointerdown', () => this.close());

    scroll.append(done, skip);
    this.el.append(scroll);
    this.mount();
  }

  close(): void {
    this.opened = false;
    this.destroy();
  }

  private buildSteps(): Step[] {
    const ua = navigator.userAgent || '';
    const isHuawei = /huawei|honor/i.test(ua);
    if (isHuawei) {
      return [
        {
          title: '允许后台运行（应用启动管理）',
          detail: '设置 → 应用 → 应用启动管理\n→ 找到「桌游大厅」→ 关闭「自动管理」\n→ 手动开启：自启动 / 关联启动 / 后台活动',
        },
        {
          title: '电池不限制',
          detail: '设置 → 应用 → 应用管理 → 桌游大厅 → 电池 → 选择「不限制」',
        },
        {
          title: '锁屏保护',
          detail: '进入最近任务界面（多任务键）\n→ 长按「桌游大厅」卡片 → 点「锁定」',
        },
      ];
    }
    // 通用（非华为）
    return [
      {
        title: '允许后台运行（自启动/后台权限）',
        detail: '设置 → 应用管理 → 桌游大厅 → 权限\n开启「自启动」和「后台运行」相关权限\n（小米/OPPO/vivo 路径略有差异，找「自启动」和「省电策略」）',
      },
      {
        title: '电池不限制',
        detail: '设置 → 应用 → 桌游大厅 → 电池/省电策略 → 选择「不限制 / 无限制」',
      },
      {
        title: '锁屏保护',
        detail: '进入最近任务界面 → 长按「桌游大厅」卡片 → 锁定（部分机型为下拉卡片上的锁图标）',
      },
    ];
  }
}
