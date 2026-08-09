// ============================================================
// BoardGameSimulator — 分段胶囊控件（游戏/观战）
// 紧凑型：灰色轨道 + 白色滑动胶囊，贴文字，小巧
// ============================================================
import { el } from '../utils/dom';

export interface SegmentOption {
  key: string;
  label: string;
}

interface Props {
  options: SegmentOption[];
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}

export function SegmentedControl({ options, value, onChange, disabled }: Props): HTMLElement {
  let idx = Math.max(0, options.findIndex(o => o.key === value));

  // 轨道
  const track = el('div', {
    style: `position:relative;display:flex;background:var(--color-fill3, rgba(118,118,128,.12));border-radius:999px;padding:2px;${disabled ? 'opacity:.55;' : ''}`,
  });

  // 白色滑动指示胶囊（宽度 = 选中项宽度，translateX 按位置移动）
  const indicator = el('div', {
    style: `position:absolute;top:2px;left:2px;width:calc(${100 / options.length}% - 2px);height:calc(100% - 4px);background:#fff;border-radius:999px;box-shadow:0 1px 3px rgba(0,0,0,.12);transition:transform .18s cubic-bezier(0.23,1,0.32,1);transform:translateX(${idx * 100}%);`,
  });
  track.append(indicator);

  // 外部切换时更新指示器（带动画）
  (track as HTMLElement & { setValue?: (k: string) => void }).setValue = (k: string): void => {
    const i = Math.max(0, options.findIndex(o => o.key === k));
    if (i === idx) return;
    idx = i;
    indicator.style.transform = `translateX(${idx * 100}%)`;
  };

  for (const opt of options) {
    const btn = el('button', {
      style: `position:relative;z-index:1;border:none;background:transparent;font-size:12px;line-height:1;padding:4px 10px;cursor:${disabled ? 'default' : 'pointer'};color:var(--color-label, #000);white-space:nowrap;`,
    }, [opt.label]);
    btn.setAttribute('data-seat', opt.key);
    if (!disabled) {
      btn.addEventListener('pointerdown', () => onChange(opt.key));
    }
    track.append(btn);
  }

  return track;
}
