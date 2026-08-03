// ============================================================
// BoardGameSimulator — 海战棋规则核（纯函数，可单测）
// ============================================================

export interface BattleShip {
  id: string;
  size: number;
  cells: string[];   // 已部署格子，如 ["A1","A2"]
  hits: number;
  sunk: boolean;
}

export interface BattleBoard {
  placed: boolean;                                       // 5 艘是否全部部署完毕
  ships: BattleShip[];
  shots: Record<string, 'hit' | 'miss' | 'sunk'>;        // 对敌射击记录
}

export interface BattleLogEntry {
  by: number;
  cell: string;
  result: 'hit' | 'miss' | 'sunk';
  sunk: string | null;
}

export interface BattleshipExtra {
  stage: 'placement' | 'battle';
  boards: BattleBoard[];
  log?: BattleLogEntry[];  // 公开开火日志（观战用）
}

export interface FireResult {
  cell: string;
  result: 'hit' | 'miss' | 'sunk';
  sunk: string | null;    // 本发击沉的舰船 id（若有）
  winner: number | null;  // 胜者 index（全沉时）
}

export interface ShipSpec { id: string; size: number }

export const BATTLE_SHIPS: ShipSpec[] = [
  { id: 'ship_carrier', size: 5 },
  { id: 'ship_battleship', size: 4 },
  { id: 'ship_cruiser', size: 3 },
  { id: 'ship_submarine', size: 3 },
  { id: 'ship_patrol', size: 2 },
];

const COLS = 'ABCDEFGHIJ';
const SIZE = 10;

// ---------- 坐标 ----------

export function parseCell(cell: string): { r: number; c: number } | null {
  const m = /^([A-J])(10|[1-9])$/.exec(cell);
  if (!m) return null;
  return { r: m[2] === '10' ? 9 : Number(m[2]) - 1, c: COLS.indexOf(m[1]) };
}

export function cellAt(r: number, c: number): string | null {
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;
  return COLS[c] + (r + 1);
}

// ---------- 棋盘初始化 ----------

export function initBoards(count: number): BattleshipExtra {
  return {
    stage: 'placement',
    boards: Array.from({ length: count }, () => ({
      placed: false,
      ships: BATTLE_SHIPS.map(s => ({ id: s.id, size: s.size, cells: [], hits: 0, sunk: false })),
      shots: {},
    })),
  };
}

// ---------- 形状与重叠校验 ----------

function isValidShape(cells: string[]): boolean {
  if (cells.length === 0) return false;
  const pts = cells.map(parseCell);
  if (pts.some(p => !p)) return false;
  const list = pts as { r: number; c: number }[];
  if (new Set(cells).size !== cells.length) return false;
  const rows = list.map(p => p.r);
  const cols = list.map(p => p.c);
  const vertical = rows.every(r => r === rows[0]);
  const horizontal = cols.every(c => c === cols[0]);
  if (!vertical && !horizontal) return false;
  const line = (vertical ? cols : rows).slice().sort((a, b) => a - b);
  for (let i = 1; i < line.length; i++) {
    if (line[i] !== line[i - 1] + 1) return false;
  }
  return true;
}

function hasOverlap(board: BattleBoard, cells: string[]): boolean {
  return board.ships.some(s => s.cells.some(c => cells.includes(c)));
}

// ---------- 布阵 ----------

export type PlaceResult =
  | { ok: true; extra: BattleshipExtra }
  | { ok: false; error: string };

export function placeShip(
  extra: BattleshipExtra,
  playerIndex: number,
  shipId: string,
  cells: string[],
): PlaceResult {
  if (extra.stage !== 'placement') return { ok: false, error: '当前不在布阵阶段' };
  const board = extra.boards[playerIndex];
  if (!board) return { ok: false, error: '棋盘未初始化' };
  const ship = board.ships.find(s => s.id === shipId);
  if (!ship) return { ok: false, error: `未知舰船: ${shipId}` };
  if (ship.cells.length > 0) return { ok: false, error: '该舰已部署' };
  if (cells.length !== ship.size) return { ok: false, error: `长度不符: 需要 ${ship.size} 格` };
  if (!isValidShape(cells)) return { ok: false, error: '必须横/竖一条直线且连续' };
  if (hasOverlap(board, cells)) return { ok: false, error: '与已有舰船重叠' };

  const newBoard: BattleBoard = {
    ...board,
    ships: board.ships.map(s => (s.id === shipId ? { ...s, cells } : s)),
  };
  newBoard.placed = newBoard.ships.every(s => s.cells.length > 0);
  const boards = extra.boards.map((b, i) => (i === playerIndex ? newBoard : b));
  const allPlaced = boards.every(b => b.placed);
  return { ok: true, extra: { ...extra, stage: allPlaced ? 'battle' : 'placement', boards } };
}

function randomCells(size: number): string[] {
  const horizontal = Math.random() < 0.5;
  const r = Math.floor(Math.random() * SIZE);
  const c = Math.floor(Math.random() * SIZE);
  if (horizontal) {
    const c0 = Math.min(c, SIZE - size);
    return Array.from({ length: size }, (_, i) => cellAt(r, c0 + i) as string);
  }
  const r0 = Math.min(r, SIZE - size);
  return Array.from({ length: size }, (_, i) => cellAt(r0 + i, c) as string);
}

export function randomPlace(extra: BattleshipExtra, playerIndex: number): PlaceResult {
  if (extra.stage !== 'placement') return { ok: false, error: '当前不在布阵阶段' };
  const board = extra.boards[playerIndex];
  if (!board) return { ok: false, error: '棋盘未初始化' };
  if (board.placed) return { ok: false, error: '该玩家已布阵完毕' };

  for (let attempt = 0; attempt < 2000; attempt++) {
    const ships: BattleShip[] = board.ships.map(s => ({ ...s, cells: [] }));
    const used = new Set<string>();
    let success = true;
    for (const ship of ships) {
      const cells = randomCells(ship.size);
      if (cells.some(c => used.has(c)) || !isValidShape(cells)) { success = false; break; }
      ship.cells = cells;
      cells.forEach(c => used.add(c));
    }
    if (!success) continue;
    const newBoard: BattleBoard = { ...board, placed: true, ships };
    const boards = extra.boards.map((b, i) => (i === playerIndex ? newBoard : b));
    const allPlaced = boards.every(b => b.placed);
    return { ok: true, extra: { ...extra, stage: allPlaced ? 'battle' : 'placement', boards } };
  }
  return { ok: false, error: '随机布阵失败，请重试' };
}

// ---------- 开火 ----------

export type FireResultOut =
  | { ok: true; extra: BattleshipExtra; result: FireResult }
  | { ok: false; error: string };

export function fire(extra: BattleshipExtra, playerIndex: number, cell: string): FireResultOut {
  if (extra.stage !== 'battle') return { ok: false, error: '当前不在战斗阶段' };
  const board = extra.boards[playerIndex];
  const target = extra.boards[playerIndex ^ 1];
  if (!board || !target) return { ok: false, error: '棋盘未初始化' };
  if (!parseCell(cell)) return { ok: false, error: '非法坐标' };
  if (board.shots[cell]) return { ok: false, error: '该格已开火' };

  const shots = { ...board.shots };
  const hitShip = target.ships.find(s => s.cells.includes(cell));
  if (!hitShip) {
    shots[cell] = 'miss';
    const boards = extra.boards.map((b, i) => (i === playerIndex ? { ...b, shots } : b));
    return {
      ok: true,
      extra: { ...extra, boards },
      result: { cell, result: 'miss', sunk: null, winner: null },
    };
  }

  const hits = hitShip.hits + 1;
  const sunk = hits === hitShip.size;
  shots[cell] = sunk ? 'sunk' : 'hit';
  const targetShips = target.ships.map(s =>
    s.id === hitShip.id ? { ...s, hits, sunk } : s,
  );
  const boards = extra.boards.map((b, i) =>
    i === playerIndex ? { ...b, shots } : i === (playerIndex ^ 1) ? { ...b, ships: targetShips } : b,
  );
  const allSunk = targetShips.every(s => s.sunk);
  return {
    ok: true,
    extra: { ...extra, boards },
    result: {
      cell,
      result: sunk ? 'sunk' : 'hit',
      sunk: sunk ? hitShip.id : null,
      winner: allSunk ? playerIndex : null,
    },
  };
}
