// ============================================================
// BoardGameSimulator — 观战视图（回合状态 + 开火日志）
// 观战者不接收任何私有数据（舰船位置不外泄）
// ============================================================
import { BaseView } from './BaseView';
import { el, clear } from '../utils/dom';

export interface SpectateData {
  phase: string;
  currentTurn: number;
  winner: number | null;
  log: { by: number; cell: string; result: 'hit' | 'miss' | 'sunk'; sunk: string | null }[];
}

export class SpectatorView extends BaseView {
  private built = false;
  private connEl: HTMLElement | null = null;
  private connState: Record<number, string> = {};

  constructor(parent: HTMLElement) {
    super(parent);
  }

  /** 对局连接状态更新 */
  setConnState(map: Record<number, string>): void {
    this.connState = map;
    this.renderConnState();
  }

  private renderConnState(): void {
    if (!this.connEl) return;
    const cells: string[] = [];
    for (let i = 0; i < 2; i++) {
      const s = this.connState[i] ?? 'online';
      const label = i === 0 ? '玩家1' : '玩家2';
      cells.push(s === 'reconnecting'
        ? `<span style="color:#e0a33c;">${label} ● 重连中</span>`
        : `<span style="color:var(--green,#34c759);">${label} ● 在线</span>`);
    }
    this.connEl.innerHTML = cells.join('　·　');
  }

  protected createEl(): HTMLElement {
    return el('div', { style: 'display:flex;flex-direction:column;height:100%;' });
  }

  render(data: SpectateData): void {
    if (!this.built) {
      this.built = true;
      this.el.innerHTML = `
        <div class="nav-bar"><span class="nav-title">👁 观战</span></div>
        <div class="scroll" style="flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch">
          <div class="sec-body">
            <div id="spectate-conn" style="text-align:center;padding:6px 0;font-size:12px;"></div>
            <div id="spectate-status" style="text-align:center;padding:12px 0;font-size:15px;"></div>
            <div class="section-hdr">开火记录</div>
            <div id="spectate-log"></div>
            <button id="btn-spectate-back" class="btn btn-secondary btn-block" style="margin-top:16px;">返回</button>
          </div>
        </div>`;
      this.connEl = this.el.querySelector('#spectate-conn')!;
      this.renderConnState();
      (this.el.querySelector('#btn-spectate-back') as HTMLButtonElement).addEventListener('pointerdown', () => {
        // 观战者回大厅：刷新重连（重连后收 lobby_state → 显示大厅）
        location.reload();
      });
    }

    const status = this.el.querySelector('#spectate-status')!;
    if (data.winner !== null) {
      status.textContent = `🏆 游戏结束 · 胜者: 玩家 ${data.winner + 1}`;
    } else if (data.phase === 'ended') {
      status.textContent = '游戏结束';
    } else {
      const stageText = data.phase === 'placement' ? '布阵中' : data.phase === 'playing' ? '对战中' : data.phase;
      status.textContent = `${stageText} · 当前回合: 玩家 ${data.currentTurn + 1}`;
    }

    const logEl = this.el.querySelector('#spectate-log') as HTMLElement;
    clear(logEl);
    const entries = data.log.slice(-30);
    if (entries.length === 0) {
      const empty = el('div', { class: 'wait-text' });
      empty.textContent = '暂无开火记录';
      logEl.appendChild(empty);
      return;
    }
    for (const e of entries) {
      const row = el('div', { class: 'play-info' });
      const r = e.result === 'hit' ? '命中'
        : e.result === 'sunk' ? `击沉${e.sunk ? '「' + e.sunk + '」' : ''}`
        : '落空';
      row.textContent = `玩家 ${e.by + 1} → ${e.cell}：${r}`;
      logEl.appendChild(row);
    }
  }

  destroy(): void {
    this.built = false;
    super.destroy();
  }
}
