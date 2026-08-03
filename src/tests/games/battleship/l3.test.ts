// ============================================================
// 单元测试 — 海战棋规则核（rules.ts）+ reducer 集成
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  initBoards, placeShip, randomPlace, fire, parseCell, cellAt,
  BATTLE_SHIPS, type BattleshipExtra,
} from '../../../games/battleship/rules';
import { reducer } from '../../../core/reducer';
import type { GameState } from '../../core/types';

function baseState(): GameState {
  return {
    version: 0, players: [], deck: [], discard: [], bottomCards: [],
    landlordIndex: -1, currentTurn: 0, phase: 'idle',
    lastPlay: null, passCount: 0, winner: null,
  };
}

function place(extra: BattleshipExtra, idx: number, shipId: string, cells: string[]): BattleshipExtra {
  const r = placeShip(extra, idx, shipId, cells);
  if (!r.ok) throw new Error(`布阵失败: ${r.error}`);
  return r.extra;
}

/** 双方都布好阵，返回 battle 阶段 extra。p1 全部舰船坐标固定，便于开火测试 */
function makeBattleExtra(): BattleshipExtra {
  let extra = initBoards(2);
  // p0: 竖排占 A/C/E/G/I 列
  extra = place(extra, 0, 'ship_carrier', ['A1', 'A2', 'A3', 'A4', 'A5']);
  extra = place(extra, 0, 'ship_battleship', ['C1', 'C2', 'C3', 'C4']);
  extra = place(extra, 0, 'ship_cruiser', ['E1', 'E2', 'E3']);
  extra = place(extra, 0, 'ship_submarine', ['G1', 'G2', 'G3']);
  extra = place(extra, 0, 'ship_patrol', ['I1', 'I2']);
  // p1: 分散部署
  extra = place(extra, 1, 'ship_carrier', ['J1', 'J2', 'J3', 'J4', 'J5']);
  extra = place(extra, 1, 'ship_battleship', ['A10', 'B10', 'C10', 'D10']);
  extra = place(extra, 1, 'ship_cruiser', ['B1', 'B2', 'B3']);
  extra = place(extra, 1, 'ship_submarine', ['D1', 'D2', 'D3']);
  extra = place(extra, 1, 'ship_patrol', ['F1', 'F2']);
  return extra;
}

const P1_ALL_CELLS = [
  'J1', 'J2', 'J3', 'J4', 'J5',              // carrier
  'A10', 'B10', 'C10', 'D10',                // battleship
  'B1', 'B2', 'B3',                          // cruiser
  'D1', 'D2', 'D3',                          // submarine
  'F1', 'F2',                                // patrol
];

describe('parseCell / cellAt', () => {
  it('A1 -> 原点', () => {
    expect(parseCell('A1')).toEqual({ r: 0, c: 0 });
  });
  it('J10 -> 末角', () => {
    expect(parseCell('J10')).toEqual({ r: 9, c: 9 });
  });
  it('非法坐标返回 null', () => {
    expect(parseCell('K5')).toBeNull();
    expect(parseCell('A0')).toBeNull();
    expect(parseCell('A11')).toBeNull();
    expect(parseCell('A')).toBeNull();
  });
  it('cellAt 往返一致', () => {
    expect(cellAt(0, 0)).toBe('A1');
    expect(cellAt(9, 9)).toBe('J10');
    expect(cellAt(-1, 0)).toBeNull();
  });
});

describe('initBoards', () => {
  it('2 名玩家、各 5 艘舰、placement 阶段', () => {
    const extra = initBoards(2);
    expect(extra.stage).toBe('placement');
    expect(extra.boards).toHaveLength(2);
    for (const b of extra.boards) {
      expect(b.placed).toBe(false);
      expect(b.ships).toHaveLength(5);
      expect(b.ships.every(s => s.cells.length === 0)).toBe(true);
      expect(Object.keys(b.shots)).toHaveLength(0);
    }
  });
  it('舰船规格总 17 格', () => {
    const total = BATTLE_SHIPS.reduce((sum, s) => sum + s.size, 0);
    expect(total).toBe(17);
  });
});

describe('placeShip 布阵校验', () => {
  it('合法横排部署', () => {
    const r = placeShip(initBoards(2), 0, 'ship_patrol', ['B3', 'B4']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.extra.boards[0].ships.find(s => s.id === 'ship_patrol')?.cells).toEqual(['B3', 'B4']);
  });

  it('越界坐标被拒绝', () => {
    const r = placeShip(initBoards(2), 0, 'ship_patrol', ['K1', 'K2']);
    expect(r.ok).toBe(false);
  });

  it('斜线被拒绝', () => {
    const r = placeShip(initBoards(2), 0, 'ship_patrol', ['B3', 'C4']);
    expect(r.ok).toBe(false);
  });

  it('不连续被拒绝', () => {
    const r = placeShip(initBoards(2), 0, 'ship_patrol', ['B3', 'B5']);
    expect(r.ok).toBe(false);
  });

  it('长度不符被拒绝', () => {
    const r = placeShip(initBoards(2), 0, 'ship_carrier', ['A1', 'A2']);
    expect(r.ok).toBe(false);
  });

  it('重叠被拒绝', () => {
    const extra = place(initBoards(2), 0, 'ship_patrol', ['B3', 'B4']);
    const r = placeShip(extra, 0, 'ship_cruiser', ['B4', 'B5', 'B6']);
    expect(r.ok).toBe(false);
  });

  it('同一舰船重复部署被拒绝', () => {
    const extra = place(initBoards(2), 0, 'ship_patrol', ['B3', 'B4']);
    const r = placeShip(extra, 0, 'ship_patrol', ['C1', 'C2']);
    expect(r.ok).toBe(false);
  });

  it('双方全部部署后进入 battle 阶段', () => {
    const extra = makeBattleExtra();
    expect(extra.stage).toBe('battle');
    expect(extra.boards.every(b => b.placed)).toBe(true);
  });
});

describe('randomPlace 随机布阵', () => {
  it('随机部署 5 艘且无重叠', () => {
    const r = randomPlace(initBoards(2), 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ships = r.extra.boards[0].ships;
    expect(ships.every(s => s.cells.length === s.size)).toBe(true);
    const all = ships.flatMap(s => s.cells);
    expect(new Set(all).size).toBe(17);
    expect(r.extra.boards[0].placed).toBe(true);
  });

  it('已布阵完毕后再次随机被拒绝', () => {
    const extra = (randomPlace(initBoards(2), 0) as { ok: true; extra: BattleshipExtra }).extra;
    expect(randomPlace(extra, 0).ok).toBe(false);
  });
});

describe('fire 开火判定', () => {
  it('未命中 -> miss', () => {
    const r = fire(makeBattleExtra(), 0, 'I10');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.result).toBe('miss');
    expect(r.result.sunk).toBeNull();
    expect(r.result.winner).toBeNull();
    expect(r.extra.boards[0].shots['I10']).toBe('miss');
  });

  it('命中 -> hit 且不沉没', () => {
    const r = fire(makeBattleExtra(), 0, 'B1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.result).toBe('hit');
    expect(r.result.sunk).toBeNull();
    expect(r.extra.boards[1].ships.find(s => s.id === 'ship_cruiser')?.hits).toBe(1);
  });

  it('命中最后一格 -> sunk', () => {
    let extra = makeBattleExtra();
    extra = (fire(extra, 0, 'F1') as { ok: true; extra: BattleshipExtra }).extra;
    const r = fire(extra, 0, 'F2');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.result).toBe('sunk');
    expect(r.result.sunk).toBe('ship_patrol');
    expect(r.extra.boards[1].ships.find(s => s.id === 'ship_patrol')?.sunk).toBe(true);
  });

  it('重复开火被拒绝', () => {
    const extra = (fire(makeBattleExtra(), 0, 'I10') as { ok: true; extra: BattleshipExtra }).extra;
    const r = fire(extra, 0, 'I10');
    expect(r.ok).toBe(false);
  });

  it('战斗阶段外开火被拒绝', () => {
    const r = fire(initBoards(2), 0, 'A1');
    expect(r.ok).toBe(false);
  });

  it('全部击沉 -> 判定胜者', () => {
    let extra = makeBattleExtra();
    let winner: number | null = null;
    for (const c of P1_ALL_CELLS) {
      const r = fire(extra, 0, c);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      extra = r.extra;
      winner = r.result.winner;
    }
    expect(winner).toBe(0);
  });
});

describe('reducer 集成', () => {
  function gameState(): GameState {
    return {
      ...baseState(),
      players: [
        { index: 0, name: '你', hand: [], handCount: 0, isHost: true, isDisconnected: false },
        { index: 1, name: '玩家 2', hand: [], handCount: 0, isHost: false, isDisconnected: false },
      ],
    };
  }

  it('battleship_place 递增 version 并进入 battle', () => {
    let s = gameState();
    const act = (playerIndex: number, shipId: string, cells: string[]) => ({
      type: 'battleship_place', playerIndex, payload: { shipId, cells }, timestamp: 0,
    });
    s = reducer(s, act(0, 'ship_carrier', ['A1', 'A2', 'A3', 'A4', 'A5']));
    expect(s.phase).toBe('idle');
    s = reducer(s, act(0, 'ship_battleship', ['C1', 'C2', 'C3', 'C4']));
    s = reducer(s, act(0, 'ship_cruiser', ['E1', 'E2', 'E3']));
    s = reducer(s, act(0, 'ship_submarine', ['G1', 'G2', 'G3']));
    s = reducer(s, act(0, 'ship_patrol', ['I1', 'I2']));
    expect((s.extra as BattleshipExtra).stage).toBe('placement');
    s = reducer(s, act(1, 'ship_carrier', ['J1', 'J2', 'J3', 'J4', 'J5']));
    s = reducer(s, act(1, 'ship_battleship', ['A10', 'B10', 'C10', 'D10']));
    s = reducer(s, act(1, 'ship_cruiser', ['B1', 'B2', 'B3']));
    s = reducer(s, act(1, 'ship_submarine', ['D1', 'D2', 'D3']));
    s = reducer(s, act(1, 'ship_patrol', ['F1', 'F2']));
    expect(s.phase).toBe('playing');
    expect(s.version).toBe(10);
    expect((s.extra as BattleshipExtra).stage).toBe('battle');
  });

  it('非法布阵不改状态（原引用拒绝）', () => {
    const s = gameState();
    const s2 = reducer(s, {
      type: 'battleship_place', playerIndex: 0,
      payload: { shipId: 'ship_patrol', cells: ['K1', 'K2'] }, timestamp: 0,
    });
    expect(s2).toBe(s);
  });

  it('battleship_fire 轮换回合', () => {
    const s = { ...gameState(), phase: 'playing', currentTurn: 0, extra: makeBattleExtra() };
    const r = reducer(s, { type: 'battleship_fire', playerIndex: 0, payload: { cell: 'A10' }, timestamp: 0 });
    expect(r).not.toBe(s);
    expect(r.currentTurn).toBe(1);
    const log = (r.extra as BattleshipExtra).log;
    expect(log).toHaveLength(1);
    expect(log![0]).toEqual({ by: 0, cell: 'A10', result: 'hit', sunk: null });
  });

  it('非当前回合开火被拒绝', () => {
    const s = { ...gameState(), phase: 'playing', currentTurn: 0, extra: makeBattleExtra() };
    const r = reducer(s, { type: 'battleship_fire', playerIndex: 1, payload: { cell: 'A10' }, timestamp: 0 });
    expect(r).toBe(s);
  });

  it('全沉后 phase=ended 且 winner 生效', () => {
    let s = { ...gameState(), phase: 'playing', currentTurn: 0, extra: makeBattleExtra() };
    // p0 每开火一发，p1 打一发新空位（轮换回合）
    const emptyP0 = ['A10', 'B10', 'D10', 'E10', 'F10', 'G10', 'H10', 'I10',
                     'J10', 'A6', 'B6', 'C6', 'D6', 'E6', 'F6', 'G6'];
    let k = 0;
    for (const c of P1_ALL_CELLS) {
      const r0 = reducer(s, { type: 'battleship_fire', playerIndex: 0, payload: { cell: c }, timestamp: 0 });
      expect(r0).not.toBe(s);
      s = r0;
      if (s.phase === 'ended') break;
      const r1 = reducer(s, { type: 'battleship_fire', playerIndex: 1, payload: { cell: emptyP0[k++] }, timestamp: 0 });
      expect(r1).not.toBe(s);
      s = r1;
    }
    expect(s.phase).toBe('ended');
    expect(s.winner).toBe(0);
  });

  it('battleship_random 可一键布阵', () => {
    let s = gameState();
    s = reducer(s, { type: 'battleship_random', playerIndex: 0, payload: null, timestamp: 0 });
    expect((s.extra as BattleshipExtra).boards[0].placed).toBe(true);
    s = reducer(s, { type: 'battleship_random', playerIndex: 1, payload: null, timestamp: 0 });
    expect(s.phase).toBe('playing');
  });
});
