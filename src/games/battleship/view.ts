// ============================================================
// BoardGameSimulator — 海战棋视图数据裁剪
// 下发 PlayerView 前剥离敌方舰船位置，防作弊
// ============================================================

import type { BattleshipExtra, BattleBoard } from './rules';

/** 拷贝棋盘但移除所有舰船的 cells（只保留 id/size/hits/sunk 供沉没提示） */
function stripShips(board: BattleBoard): BattleBoard {
  return {
    placed: board.placed,
    confirmed: board.confirmed,
    shots: board.shots,
    ships: board.ships.map(s => ({ id: s.id, size: s.size, hits: s.hits, sunk: s.sunk, cells: [] })),
  };
}

/** 为 viewerIndex 裁剪：自己的棋盘完整，敌方棋盘剥离舰船位置 */
export function filterExtra(extra: BattleshipExtra, viewerIndex: number): BattleshipExtra {
  return {
    stage: extra.stage,
    log: extra.log ?? [],
    boards: extra.boards.map((b, i) => (i === viewerIndex ? b : stripShips(b))),
  };
}
