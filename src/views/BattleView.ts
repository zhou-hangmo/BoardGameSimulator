// ============================================================
// BoardGameSimulator — 海战棋游戏视图
// 布阵：舰船列表拖拽到 10x10 网格（可拖走换位/拖回移除）
// 战斗：己方海域（舰船+受击标记）+ 敌方海域（开火记录）
// ============================================================
import { BaseView } from './BaseView';
import { el, clear } from '../utils/dom';
import type { PlayerView } from '../core/types';
import type { BattleshipExtra, BattleBoard } from '../games/battleship/rules';
import { BATTLE_SHIPS, cellAt, parseCell, placeShip } from '../games/battleship/rules';

const SHIP_COLORS: Record<string, string> = {
  ship_carrier: '#4a7bd9',
  ship_battleship: '#d94a5e',
  ship_cruiser: '#2fbf71',
  ship_submarine: '#e0a33c',
  ship_patrol: '#9b59b6',
};

const SHIP_NAMES: Record<string, string> = {
  ship_carrier: '航母',
  ship_battleship: '战列舰',
  ship_cruiser: '巡洋舰',
  ship_submarine: '潜艇',
  ship_patrol: '巡逻艇',
};

const COLS = 'ABCDEFGHIJ';

interface DragState {
  shipId: string;
  size: number;
  fromBoard: boolean;
  ghost: HTMLElement;
  grabIndex: number;
  cellSize: number;
}

export class BattleView extends BaseView {
  private view: PlayerView | null = null;
  private extra: BattleshipExtra | null = null;
  private orientation: 'h' | 'v' = 'h';
  private drag: DragState | null = null;
  private previewCells: HTMLElement[] = [];
  private scroll!: HTMLElement;
  private statusEl!: HTMLElement;
  /** 大厅主机：显示"中止回大厅" */
  amHost = false;

  constructor(parent: HTMLElement) {
    super(parent);
    window.addEventListener('keydown', this.onKeyDown);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'Space') return;
    if (this.extra?.stage !== 'placement') return;
    e.preventDefault();
    this.toggleOrient();
  };

  /** 切换横/纵方向；拖拽中实时旋转 ghost 条带 */
  private toggleOrient(): void {
    this.orientation = this.orientation === 'h' ? 'v' : 'h';
    if (this.drag) {
      this.drag.ghost.style.flexDirection = this.orientation === 'v' ? 'column' : 'row';
      this.alignGhost();
    }
  }

  /** ghost 定位：让"拿住的那格"居中在光标下 */
  private alignGhost(): void {
    if (!this.drag) return;
    const { ghost, grabIndex, cellSize } = this.drag;
    const off = -(grabIndex * (cellSize + 3) + cellSize / 2);
    ghost.style.transform = this.orientation === 'v'
      ? `translate(-50%, ${off}px)`
      : `translate(${off}px, -50%)`;
  }

  protected createEl(): HTMLElement {
    const root = el('div', { style: 'height:100%;display:flex;flex-direction:column;' });
    const topBar = el('div', { class: 'nav-bar' });
    this.statusEl = el('span', { style: 'color:var(--label2);font-size:13px;flex:1;text-align:right;' });
    topBar.append(el('span', { class: 'nav-title' }, ['海战棋']), this.statusEl);
    this.scroll = el('div', { class: 'scroll', style: 'flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 12px 24px;' });
    root.append(topBar, this.scroll);
    return root;
  }

  render(view: PlayerView): void {
    const extra = view.extra as BattleshipExtra | undefined;
    if (!extra || !Array.isArray(extra.boards) || extra.boards.length < 2) return;
    this.view = view;
    this.extra = extra;
    this.update();
  }

  destroy(): void {
    this.endDrag();
    window.removeEventListener('keydown', this.onKeyDown);
    super.destroy();
  }

  // ========== 渲染 ==========

  private update(): void {
    const view = this.view!;
    const extra = this.extra!;
    const my = extra.boards[view.playerIndex];
    const enemy = extra.boards[view.playerIndex ^ 1];
    clear(this.scroll);

    if (extra.stage === 'placement') {
      this.statusEl.textContent = my.confirmed
        ? '等待对方确认...'
        : my.placed
          ? '部署完毕，请确认'
          : '布阵中';
      this.scroll.appendChild(this.buildPlacement(my));
      return;
    }

    if (view.phase === 'ended') {
      this.statusEl.textContent = '已结束';
    } else {
      this.statusEl.textContent = view.currentTurn === view.playerIndex
        ? '你的回合'
        : `等待 ${view.players[view.currentTurn]?.name ?? '对方'} 开火...`;
    }

    const sec = el('div', {});
    if (this.amHost) {
      const btnRow = el('div', { style: 'display:flex;gap:8px;margin-bottom:10px;' });
      const btn = el('button', { class: 'btn btn-secondary', style: 'font-size:13px;padding:4px 12px;' }, ['中止回大厅']);
      btn.addEventListener('pointerdown', () => this.emit('ui:back_to_lobby'));
      btnRow.append(btn);
      sec.appendChild(btnRow);
    }
    sec.appendChild(this.buildSection('我的海域', this.buildMyBattleGrid(my, enemy)));
    sec.appendChild(this.buildSection('敌方海域（点击开火）', this.buildEnemyBattleGrid(my)));
    sec.appendChild(this.buildLegend());
    sec.appendChild(this.buildLog());
    this.scroll.appendChild(sec);

    if (view.phase === 'ended') {
      this.scroll.appendChild(this.buildOverlay(view));
    }
  }

  private buildSection(title: string, grid: HTMLElement): HTMLElement {
    const box = el('div', { style: 'margin-bottom:14px;' });
    box.append(
      el('div', { style: 'color:var(--label2);font-size:13px;margin-bottom:6px;' }, [title]),
      grid,
    );
    return box;
  }

  // ---------- 布阵 ----------

  private buildPlacement(my: BattleBoard): HTMLElement {
    const box = el('div', {});

    const hint = el('div', { style: 'color:var(--label2);font-size:13px;margin-bottom:8px;' }, [
      my.confirmed
        ? '已确认布阵，等待对方确认...'
        : my.placed
          ? '部署完毕，点击确认布阵；仍可拖船调整'
          : '把舰船拖到棋盘上；已放置的船可拖走换位或拖回列表移除（空格/转向键切换方向）',
    ]);

    const row = el('div', { style: 'display:flex;gap:8px;margin-bottom:10px;' });
    const btnOrient = el('button', { class: 'btn btn-secondary', style: 'font-size:13px;padding:4px 12px;' }, ['⟲ 转向']);
    btnOrient.addEventListener('pointerdown', () => {
      this.toggleOrient();
    });
    const btnRandom = el('button', { class: 'btn btn-secondary', style: 'font-size:13px;padding:4px 12px;' }, ['🎲 随机布阵']);
    btnRandom.addEventListener('pointerdown', () => {
      this.emit('ui:play_action', 'battleship_random', null);
    });
    row.append(btnOrient, btnRandom);

    if (my.placed && !my.confirmed) {
      box.appendChild(el('div', { style: 'margin-bottom:10px;' }, [
        (() => {
          const btnConfirm = el('button', { class: 'btn btn-primary', style: 'width:100%;font-size:14px;padding:10px 0;' }, ['✓ 确认布阵']);
          btnConfirm.addEventListener('pointerdown', () => this.emit('ui:play_action', 'battleship_confirm', null));
          return btnConfirm;
        })(),
      ]));
    }

    const palette = el('div', { style: 'display:flex;flex-direction:column;gap:6px;margin-bottom:12px;' });
    for (const ship of BATTLE_SHIPS) {
      const placed = my.ships.find(s => s.id === ship.id)?.cells.length ?? 0;
      const item = el('div', {
        style: 'display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:8px;background:var(--bg2,#f7f7f7);' + (placed ? 'opacity:.5;' : ''),
      });
      const chip = el('div', { style: `display:flex;gap:2px;` });
      for (let i = 0; i < ship.size; i++) {
        chip.appendChild(el('div', { style: `width:14px;height:14px;border-radius:3px;background:${SHIP_COLORS[ship.id]};` }));
      }
      item.append(chip, el('span', { style: 'font-size:12px;' }, [`${SHIP_NAMES[ship.id]}(${ship.size})`]));
      if (placed) {
        item.appendChild(el('span', { style: 'margin-left:auto;font-size:12px;color:var(--green,#2fbf71);' }, ['✓ 已放置']));
      } else {
        item.style.cursor = 'grab';
        item.style.touchAction = 'none';
        item.addEventListener('pointerdown', (e: PointerEvent) => this.startDrag(e, ship.id, false));
      }
      palette.appendChild(item);
    }

    box.append(hint, row, palette, this.buildGrid(my, { showShips: true, draggableShips: true, marks: {} }));
    return box;
  }

  // ---------- 网格 ----------

  private buildGrid(
    board: BattleBoard,
    opts: { showShips: boolean; draggableShips?: boolean; marks: Record<string, string> },
  ): HTMLElement {
    const grid = el('div', { class: 'bs-grid' });
    grid.appendChild(el('div', { class: 'bs-hdr' }));
    for (const c of COLS) grid.appendChild(el('div', { class: 'bs-hdr' }, [c]));

    const shipAt = (cell: string) => board.ships.find(s => s.cells.includes(cell));

    for (let r = 0; r < 10; r++) {
      grid.appendChild(el('div', { class: 'bs-hdr' }, [String(r + 1)]));
      for (let c = 0; c < 10; c++) {
        const name = cellAt(r, c)!;
        const ship = opts.showShips ? shipAt(name) : undefined;
        const cell = el('div', { class: 'bs-cell', 'data-cell': name });
        if (ship) {
          cell.style.background = SHIP_COLORS[ship.id];
          if (opts.draggableShips) {
            cell.style.cursor = 'grab';
            cell.style.touchAction = 'none';
            cell.addEventListener('pointerdown', (e: PointerEvent) => this.startDrag(e, ship.id, true));
          }
        }
        const mark = opts.marks[name];
        if (mark) {
          const m = el('span', { class: 'bs-mark' });
          m.textContent = mark === 'miss' ? '·' : '✕';
          m.style.color = mark === 'miss' ? '#bbb' : '#fff';
          m.style.fontWeight = 'bold';
          cell.appendChild(m);
        }
        grid.appendChild(cell);
      }
    }
    return grid;
  }

  private buildMyBattleGrid(my: BattleBoard, enemy: BattleBoard): HTMLElement {
    return this.buildGrid(my, { showShips: true, marks: enemy.shots });
  }

  private buildEnemyBattleGrid(my: BattleBoard): HTMLElement {
    const grid = this.buildGrid({ placed: true, confirmed: true, ships: [], shots: {} }, { showShips: false, marks: my.shots });
    const myTurn = this.view!.currentTurn === this.view!.playerIndex;
    for (const cell of Array.from(grid.querySelectorAll<HTMLElement>('.bs-cell'))) {
      const name = cell.dataset.cell!;
      if (!my.shots[name] && myTurn) {
        cell.style.cursor = 'crosshair';
        cell.addEventListener('pointerdown', () => {
          this.emit('ui:play_action', 'battleship_fire', { cell: name });
        });
      }
    }
    return grid;
  }

  private buildLegend(): HTMLElement {
    const box = el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px 12px;margin-bottom:14px;' });
    for (const ship of BATTLE_SHIPS) {
      box.appendChild(el('span', { style: 'font-size:11px;color:var(--label2);display:inline-flex;align-items:center;gap:4px;' }, [
        el('i', { style: `display:inline-block;width:10px;height:10px;border-radius:2px;background:${SHIP_COLORS[ship.id]};` }),
        `${SHIP_NAMES[ship.id]}(${ship.size})`,
      ]));
    }
    return box;
  }

  private buildLog(): HTMLElement {
    const view = this.view!;
    const log = this.extra?.log ?? [];
    const box = el('div', { style: 'margin-bottom:10px;' });
    box.appendChild(el('div', { style: 'color:var(--label2);font-size:13px;margin-bottom:6px;' }, ['开火记录']));
    if (log.length === 0) {
      box.appendChild(el('div', { style: 'color:var(--label3);font-size:12px;padding:8px 0;' }, ['暂无记录']));
      return box;
    }
    const list = el('div', { style: 'display:flex;flex-direction:column;gap:4px;' });
    for (const e of [...log].reverse()) {
      const who = e.by === view.playerIndex ? '你' : view.players[e.by]?.name ?? `玩家${e.by}`;
      const text = e.result === 'hit' ? `命中 ${e.cell}`
        : e.result === 'sunk' ? `击沉 ${SHIP_NAMES[e.sunk ?? ''] ?? e.sunk}！(${e.cell})`
        : `未中 ${e.cell}`;
      list.appendChild(el('div', { style: 'font-size:12px;color:var(--label1);' }, [
        el('b', {}, [who]), ' ', text,
      ]));
    }
    box.appendChild(list);
    return box;
  }

  private buildOverlay(view: PlayerView): HTMLElement {
    const won = view.winner === view.playerIndex;
    const overlay = el('div', { class: 'game-over-overlay' });
    const text = el('div', { class: 'go-text' });
    text.style.color = won ? 'var(--green)' : 'var(--red)';
    text.textContent = won ? '你赢了！' : '你输了';
    const btn = el('button', { class: 'btn btn-primary' }, ['返回大厅']);
    btn.addEventListener('pointerdown', () => {
      this.emit('ui:back_to_lobby');
    });
    overlay.append(text, btn);
    return overlay;
  }

  // ========== 拖拽 ==========

  private startDrag(e: PointerEvent, shipId: string, fromBoard: boolean): void {
    if (this.drag) return;
    e.preventDefault();
    const ship = BATTLE_SHIPS.find(s => s.id === shipId);
    if (!ship || !this.extra || !this.view) return;
    let orient = this.orientation;
    let grabIndex: number;
    if (fromBoard) {
      const mine = this.extra.boards[this.view.playerIndex];
      const placed = mine.ships.find(s => s.id === shipId);
      const pts = (placed?.cells ?? []).map(parseCell).filter(Boolean) as { r: number; c: number }[];
      if (pts.length > 0) orient = pts.every(p => p.r === pts[0].r) ? 'h' : 'v';
      const cellName = (e.target as HTMLElement).closest?.('[data-cell]')?.getAttribute('data-cell') ?? '';
      grabIndex = placed ? Math.max(0, placed.cells.indexOf(cellName)) : 0;
    } else {
      grabIndex = Math.floor((ship.size - 1) / 2);
    }
    const cellEl0 = this.scroll.querySelector<HTMLElement>('.bs-cell');
    const cellSize = cellEl0 ? cellEl0.getBoundingClientRect().width : 22;
    const ghost = el('div', {
      class: 'bs-drag-ghost',
      style: `position:fixed;left:${e.clientX}px;top:${e.clientY}px;pointer-events:none;z-index:99999;display:flex;${orient === 'v' ? 'flex-direction:column;' : ''}gap:3px;`,
    });
    for (let i = 0; i < ship.size; i++) {
      ghost.appendChild(el('div', {
        style: `width:${cellSize}px;height:${cellSize}px;box-sizing:border-box;border-radius:4px;background:${SHIP_COLORS[shipId]};border:1px solid rgba(0,0,0,.18);box-shadow:0 2px 8px rgba(0,0,0,.35);`,
      }));
    }
    document.body.appendChild(ghost);
    this.drag = { shipId, size: ship.size, fromBoard, ghost, grabIndex, cellSize };
    this.alignGhost();

    const move = (ev: PointerEvent) => {
      ghost.style.left = `${ev.clientX}px`;
      ghost.style.top = `${ev.clientY}px`;
      this.updatePreview(ev);
    };
    const end = (ev: PointerEvent) => {
      this.drop(ev);
      this.endDrag();
    };
    const cancel = () => this.endDrag();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    // 让监听随 drag 生命周期存活
    (ghost as any).__cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
    };
  }

  private endDrag(): void {
    if (!this.drag) return;
    (this.drag.ghost as any).__cleanup?.();
    this.drag.ghost.remove();
    this.clearPreview();
    this.drag = null;
  }

  private candidateCells(start: string, size: number, orient: 'h' | 'v'): string[] | null {
    const p = parseCell(start);
    if (!p) return null;
    if (orient === 'h' && p.c + size > 10) return null;
    if (orient === 'v' && p.r + size > 10) return null;
    return Array.from({ length: size }, (_, i) =>
      orient === 'h' ? cellAt(p.r, p.c + i)! : cellAt(p.r + i, p.c)!,
    );
  }

  private checkPlaceOk(cells: string[], shipId: string): boolean {
    if (!this.extra || !this.view) return false;
    return placeShip(this.extra, this.view.playerIndex, shipId, cells).ok;
  }

  /** 悬停格为"拿住的那格"，反推船头 */
  private headFromHover(hover: string, grabIndex: number): string | null {
    const p = parseCell(hover);
    if (!p) return null;
    return this.orientation === 'h'
      ? cellAt(p.r, p.c - grabIndex)
      : cellAt(p.r - grabIndex, p.c);
  }

  private updatePreview(ev: PointerEvent): void {
    this.clearPreview();
    if (!this.drag) return;
    const target = document.elementFromPoint(ev.clientX, ev.clientY);
    const cellEl = target?.closest?.('[data-cell]') as HTMLElement | null;
    if (!cellEl) return;
    const head = this.headFromHover(cellEl.dataset.cell!, this.drag.grabIndex);
    if (!head) return;
    const cells = this.candidateCells(head, this.drag.size, this.orientation);
    if (!cells) return;
    const ok = this.checkPlaceOk(cells, this.drag.shipId);
    for (const name of cells) {
      const elCell = this.scroll.querySelector<HTMLElement>(`[data-cell="${name}"]`);
      if (elCell) {
        elCell.classList.add(ok ? 'bs-preview-ok' : 'bs-preview-bad');
        this.previewCells.push(elCell);
      }
    }
  }

  private clearPreview(): void {
    for (const c of this.previewCells) {
      c.classList.remove('bs-preview-ok', 'bs-preview-bad');
    }
    this.previewCells = [];
  }

  private drop(ev: PointerEvent): void {
    if (!this.drag || !this.extra || !this.view) return;
    const target = document.elementFromPoint(ev.clientX, ev.clientY);
    const cellEl = target?.closest?.('[data-cell]') as HTMLElement | null;
    if (cellEl) {
      const head = this.headFromHover(cellEl.dataset.cell!, this.drag.grabIndex);
      if (!head) {
        this.toast('超出棋盘范围');
        return;
      }
      const cells = this.candidateCells(head, this.drag.size, this.orientation);
      if (!cells) {
        this.toast('超出棋盘范围');
        return;
      }
      const r = placeShip(this.extra, this.view.playerIndex, this.drag.shipId, cells);
      if (r.ok) {
        this.emit('ui:play_action', 'battleship_place', { shipId: this.drag.shipId, cells });
        return;
      }
      this.toast(r.error);
      return;
    }
    if (this.drag.fromBoard) {
      this.emit('ui:play_action', 'battleship_remove', { shipId: this.drag.shipId });
    }
  }
}
