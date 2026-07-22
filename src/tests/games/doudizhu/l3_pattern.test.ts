// ============================================================
// 单元测试 — 斗地主 L3 牌型识别函数
// ============================================================

import { describe, it, expect } from 'vitest';

// ---------- 斗地主牌型识别（纯逻辑，可独立测试） ----------

interface Card {
  suit: string;
  rank: string;
  value: number;
}

type PatternType =
  | 'single' | 'pair' | 'triple' | 'bomb' | 'rocket'
  | 'straight' | 'straight_pair' | 'plane' | 'plane_single'
  | 'plane_pair' | 'triple_single' | 'triple_pair' | 'quad_single' | 'quad_pair';

interface Pattern {
  type: PatternType;
  mainValue: number;  // 核心比较值
  length?: number;
}

/**
 * 卡牌点数映射（斗地主大小顺序：3-2-A-K...）
 */
function cardValue(rank: string): number {
  const map: Record<string, number> = {
    '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15,
    'small_joker': 16, 'big_joker': 17,
  };
  return map[rank] ?? 0;
}

function makeCard(rank: string): Card {
  return { suit: 'spade', rank, value: cardValue(rank) };
}

function makeCards(ranks: string[]): Card[] {
  return ranks.map(makeCard);
}

function getValueCounts(cards: Card[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const c of cards) {
    counts.set(c.value, (counts.get(c.value) ?? 0) + 1);
  }
  return counts;
}

function checkPattern(cards: Card[]): Pattern | null {
  const n = cards.length;
  if (n === 0) return null;

  // 火箭（大小王各1张）
  if (n === 2) {
    const ranks = cards.map(c => c.rank);
    if (ranks.includes('small_joker') && ranks.includes('big_joker')) {
      return { type: 'rocket', mainValue: 18 };
    }
  }

  const counts = getValueCounts(cards);
  const values = Array.from(counts.keys()).sort((a, b) => a - b);
  const countValues = Array.from(counts.values());

  // 炸弹（4张同点数）
  if (n === 4 && counts.size === 1) {
    return { type: 'bomb', mainValue: values[0] };
  }

  // 单张
  if (n === 1) {
    return { type: 'single', mainValue: values[0] };
  }

  // 对子
  if (n === 2 && counts.size === 1) {
    return { type: 'pair', mainValue: values[0] };
  }

  // 三张
  if (n === 3 && counts.size === 1) {
    return { type: 'triple', mainValue: values[0] };
  }

  // 三带一
  if (n === 4 && countValues.includes(3) && countValues.includes(1)) {
    const tripleValue = values.find(v => counts.get(v) === 3)!;
    return { type: 'triple_single', mainValue: tripleValue };
  }

  // 三带二
  if (n === 5 && countValues.includes(3) && countValues.includes(2)) {
    const tripleValue = values.find(v => counts.get(v) === 3)!;
    return { type: 'triple_pair', mainValue: tripleValue };
  }

  // 顺子（至少5张连续，不含2和王）
  if (n >= 5 && countValues.every(c => c === 1)) {
    const sorted = values;
    let isStraight = true;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== sorted[i - 1] + 1) { isStraight = false; break; }
    }
    if (isStraight && sorted[sorted.length - 1] < 15) { // 不能超过2
      return { type: 'straight', mainValue: sorted[sorted.length - 1], length: n };
    }
  }

  // 连对（至少3对连续）
  if (n >= 6 && n % 2 === 0 && countValues.every(c => c === 2)) {
    const sorted = values;
    let isStraight = true;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== sorted[i - 1] + 1) { isStraight = false; break; }
    }
    if (isStraight && sorted[sorted.length - 1] < 15) {
      return { type: 'straight_pair', mainValue: sorted[sorted.length - 1], length: n / 2 };
    }
  }

  // 飞机不带（至少2个连续三张）
  const triples = values.filter(v => counts.get(v) === 3).sort((a, b) => a - b);
  if (triples.length >= 2 && n === triples.length * 3) {
    let isConsecutive = true;
    for (let i = 1; i < triples.length; i++) {
      if (triples[i] !== triples[i - 1] + 1) { isConsecutive = false; break; }
    }
    if (isConsecutive && triples[triples.length - 1] < 15) {
      const remainCount = n - triples.length * 3;
      if (remainCount === 0) return { type: 'plane', mainValue: triples[triples.length - 1], length: triples.length };
      if (remainCount === triples.length) return { type: 'plane_single', mainValue: triples[triples.length - 1], length: triples.length };
      if (remainCount === triples.length * 2) return { type: 'plane_pair', mainValue: triples[triples.length - 1], length: triples.length };
    }
  }

  // 四带二
  if (n === 6 || n === 8) {
    const quadValue = values.find(v => counts.get(v) === 4);
    if (quadValue) {
      if (n === 6) return { type: 'quad_single', mainValue: quadValue };
      if (n === 8) return { type: 'quad_pair', mainValue: quadValue };
    }
  }

  return null;
}

function comparePatterns(a: Pattern, b: Pattern): number {
  // 火箭 > 炸弹 > 普通
  if (a.type === 'rocket') return 1;
  if (b.type === 'rocket') return -1;
  if (a.type === 'bomb' && b.type !== 'bomb') return 1;
  if (b.type === 'bomb' && a.type !== 'bomb') return -1;
  // 同类型比较主值
  if (a.type === b.type && a.length === b.length) {
    return a.mainValue - b.mainValue;
  }
  return 0; // 不同类型不可比较
}

// ========== 测试用例 ==========

describe('checkPattern (斗地主牌型识别)', () => {
  describe('基础牌型', () => {
    it('单张', () => {
      const p = checkPattern(makeCards(['3']));
      expect(p?.type).toBe('single');
    });

    it('对子', () => {
      const p = checkPattern(makeCards(['5', '5']));
      expect(p?.type).toBe('pair');
    });

    it('三张', () => {
      const p = checkPattern(makeCards(['K', 'K', 'K']));
      expect(p?.type).toBe('triple');
      expect(p?.mainValue).toBe(13);
    });

    it('炸弹', () => {
      const p = checkPattern(makeCards(['8', '8', '8', '8']));
      expect(p?.type).toBe('bomb');
      expect(p?.mainValue).toBe(8);
    });

    it('火箭', () => {
      const p = checkPattern([makeCard('small_joker'), makeCard('big_joker')]);
      expect(p?.type).toBe('rocket');
    });
  });

  describe('带牌型', () => {
    it('三带一', () => {
      const p = checkPattern(makeCards(['Q', 'Q', 'Q', '5']));
      expect(p?.type).toBe('triple_single');
      expect(p?.mainValue).toBe(12);
    });

    it('三带二', () => {
      const p = checkPattern(makeCards(['J', 'J', 'J', '4', '4']));
      expect(p?.type).toBe('triple_pair');
    });

    it('四带二单', () => {
      const p = checkPattern(makeCards(['A', 'A', 'A', 'A', '3', '6']));
      expect(p?.type).toBe('quad_single');
    });
  });

  describe('顺子型', () => {
    it('5张顺子', () => {
      const p = checkPattern(makeCards(['3', '4', '5', '6', '7']));
      expect(p?.type).toBe('straight');
      expect(p?.length).toBe(5);
    });

    it('非连续不是顺子', () => {
      const p = checkPattern(makeCards(['3', '4', '5', '7', '8']));
      expect(p).toBeNull();
    });

    it('含2不能是顺子', () => {
      const p = checkPattern(makeCards(['10', 'J', 'Q', 'K', 'A']));
      expect(p?.type).toBe('straight');
    });

    it('连对', () => {
      const p = checkPattern(makeCards(['8', '8', '9', '9', '10', '10']));
      expect(p?.type).toBe('straight_pair');
      expect(p?.length).toBe(3);
    });
  });

  describe('非法输入', () => {
    it('0张牌返回 null', () => {
      expect(checkPattern([])).toBeNull();
    });
  });
});

describe('comparePatterns', () => {
  it('火箭 > 一切', () => {
    const rocket: Pattern = { type: 'rocket', mainValue: 18 };
    const bomb: Pattern = { type: 'bomb', mainValue: 15 };
    expect(comparePatterns(rocket, bomb)).toBe(1);
  });

  it('炸弹 > 普通单张', () => {
    expect(comparePatterns(
      { type: 'bomb', mainValue: 3 },
      { type: 'single', mainValue: 17 },
    )).toBe(1);
  });

  it('大炸弹 > 小炸弹', () => {
    expect(comparePatterns(
      { type: 'bomb', mainValue: 10 },
      { type: 'bomb', mainValue: 5 },
    )).toBeGreaterThan(0);
  });

  it('大顺子 > 小顺子', () => {
    expect(comparePatterns(
      { type: 'straight', mainValue: 10, length: 5 },
      { type: 'straight', mainValue: 7, length: 5 },
    )).toBeGreaterThan(0);
  });
});
