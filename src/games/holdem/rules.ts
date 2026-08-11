// ============================================================
// BoardGameSimulator — 德州扑克筹码管理器 规则核（纯函数）
// ============================================================

export interface HoldemPlayerState {
  index: number;
  name: string;
  chips: number;
  roundBet: number;
  totalBet: number;
  folded: boolean;
  allIned: boolean;
  acted: boolean;
  borrowUsed: number;
}

export interface SidePot {
  amount: number;
  eligible: number[];
}

export interface UndoRequest {
  fromIndex: number;
  fromName: string;
  snapshotIndex: number;
  pending: boolean;
}

export interface HoldemExtra {
  phase: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
  dealerIndex: number;
  sbAmount: number;
  bbAmount: number;
  players: HoldemPlayerState[];
  pot: number;
  sidePots: SidePot[];
  currentBet: number;
  currentActor: number;
  turnOrder: number[];
  history: string[];
  historyIndex: number;
  roundStartIndex: number;   // history index at start of current betting round
  undoRequest: UndoRequest | null;
  roundUndoUsed: boolean;
  borrowEnabled: boolean;
  borrowAmount: number;
  borrowLimit: number;
  sidePotEnabled: boolean;
  blindsEnabled: boolean;
  started: boolean;
}

// ========== 初始化 ==========

export interface InitConfig {
  sb: number;
  bb: number;
  startingChips: number;
  borrowEnabled: boolean;
  borrowAmount: number;
  borrowLimit: number;
  sidePotEnabled: boolean;
  blindsEnabled: boolean;
}

export function initHoldemExtra(
  playerCount: number,
  cfg: InitConfig,
): HoldemExtra {
  const dealerIndex = Math.floor(Math.random() * playerCount);
  return initExtraWithDealer(playerCount, dealerIndex, cfg);
}

function initExtraWithDealer(
  playerCount: number,
  dealerIndex: number,
  cfg: InitConfig,
): HoldemExtra {
  const players: HoldemPlayerState[] = Array.from({ length: playerCount }, (_, i) => ({
    index: i,
    name: '',
    chips: cfg.startingChips,
    roundBet: 0,
    totalBet: 0,
    folded: false,
    allIned: false,
    acted: false,
    borrowUsed: 0,
  }));
  return {
    phase: 'preflop',
    dealerIndex,
    sbAmount: cfg.sb,
    bbAmount: cfg.bb,
    players,
    pot: 0,
    sidePots: [],
    currentBet: cfg.bb,
    currentActor: -1,
    turnOrder: [],
    history: [],
    historyIndex: 0,
    roundStartIndex: 0,
    undoRequest: null,
    roundUndoUsed: false,
    borrowEnabled: cfg.borrowEnabled,
    borrowAmount: cfg.borrowAmount,
    borrowLimit: cfg.borrowLimit,
    sidePotEnabled: cfg.sidePotEnabled,
    blindsEnabled: cfg.blindsEnabled,
    started: false,
  };
}

// ========== 盲注 ==========

export function postBlinds(extra: HoldemExtra): HoldemExtra {
  if (extra.started) return extra;
  const p = extra.players.length;
  if (p < 2) return extra;

  let players = extra.players;
  let pot = 0;
  let currentBet = 0;
  let currentActor: number;

  if (extra.blindsEnabled) {
    const sbIdx = (extra.dealerIndex + 1) % p;
    const bbIdx = (extra.dealerIndex + 2) % p;
    players = players.map((pl, i) => {
      if (i === sbIdx) {
        const amount = Math.min(extra.sbAmount, pl.chips);
        return { ...pl, chips: pl.chips - amount, roundBet: amount, totalBet: amount, acted: true };
      }
      if (i === bbIdx) {
        const amount = Math.min(extra.bbAmount, pl.chips);
        return { ...pl, chips: pl.chips - amount, roundBet: amount, totalBet: amount, acted: true };
      }
      return pl;
    });
    pot = players[sbIdx].roundBet + players[bbIdx].roundBet;
    currentBet = extra.bbAmount;
    currentActor = (bbIdx + 1) % p; // UTG
  } else {
    currentActor = (extra.dealerIndex + 1) % p; // 庄家下家
  }

  const turnOrder = buildTurnOrder(players, currentActor);

  const e: HoldemExtra = {
    ...extra,
    players,
    pot,
    currentBet,
    currentActor,
    turnOrder,
    started: true,
    history: [JSON.stringify(extra)],
    historyIndex: 0,
    roundStartIndex: 0,
    roundUndoUsed: false,
    undoRequest: null,
  };
  const started = pushSnapshot(e);
  return { ...started, roundStartIndex: started.historyIndex };
}

function buildTurnOrder(players: HoldemPlayerState[], startIdx: number): number[] {
  const n = players.length;
  const order: number[] = [];
  for (let i = 0; i < n; i++) {
    const idx = (startIdx + i) % n;
    if (!players[idx].folded && !players[idx].allIned) {
      order.push(idx);
    }
  }
  return order;
}

// ========== 快照系统（用于撤回） ==========

function pushSnapshot(extra: HoldemExtra): HoldemExtra {
  const { history: _h, ...strip } = extra;
  const snap = JSON.stringify(strip);
  const history = [...extra.history, snap];
  if (history.length > 50) history.shift();
  return { ...extra, history, historyIndex: history.length - 1 };
}

// ========== 确定下一个行动者 ==========

function allActedAndLevel(extra: HoldemExtra): boolean {
  const active = extra.players.filter(p => !p.folded && !p.allIned);
  if (active.length === 0) return true;
  return active.every(p => p.acted) && active.every(p => p.roundBet >= extra.currentBet);
}

function nextActor(extra: HoldemExtra, fromIdx: number): number {
  const n = extra.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (fromIdx + i) % n;
    const p = extra.players[idx];
    if (!p.folded && !p.allIned) return idx;
  }
  return -1;
}

// ========== 下注操作 ==========

export type HoldemResult =
  | { ok: true; extra: HoldemExtra }
  | { ok: false; error: string };

export function holdemBet(
  extra: HoldemExtra,
  playerIndex: number,
  amount: number,
): HoldemResult {
  if (!extra.started) return { ok: false, error: '游戏尚未开始' };
  if (extra.currentActor !== playerIndex) return { ok: false, error: '未轮到你' };
  if (extra.currentBet !== 0) return { ok: false, error: '已有下注，请使用加注' };
  if (amount <= 0) return { ok: false, error: '下注金额必须大于 0' };
  if (amount < extra.bbAmount) return { ok: false, error: `下注不能低于大盲 ${extra.bbAmount}` };

  const player = extra.players[playerIndex];
  if (amount > player.chips) return { ok: false, error: '筹码不足' };

  const players = extra.players.map((p, i) => {
    if (i !== playerIndex) return p;
    const newChips = p.chips - amount;
    const allIned = newChips === 0;
    return { ...p, chips: newChips, roundBet: p.roundBet + amount, totalBet: p.totalBet + amount, acted: true, allIned };
  });

  const next = nextActor(extra, playerIndex);
  const newExtra: HoldemExtra = {
    ...extra,
    players,
    pot: extra.pot + amount,
    currentBet: amount,
    currentActor: next,
  };

  if (next < 0 || allActedAndLevel(newExtra)) {
    return advancePhase(newExtra);
  }

  return { ok: true, extra: pushSnapshot(newExtra) };
}

export function holdemCall(extra: HoldemExtra, playerIndex: number): HoldemResult {
  if (!extra.started) return { ok: false, error: '游戏尚未开始' };
  if (extra.currentActor !== playerIndex) return { ok: false, error: '未轮到你' };

  const player = extra.players[playerIndex];
  const diff = extra.currentBet - player.roundBet;
  const amount = Math.min(diff, player.chips);

  const players = extra.players.map((p, i) => {
    if (i !== playerIndex) return p;
    const newChips = p.chips - amount;
    const allIned = amount < diff || newChips === 0;
    return { ...p, chips: newChips, roundBet: p.roundBet + amount, totalBet: p.totalBet + amount, acted: true, allIned };
  });

  const next = nextActor(extra, playerIndex);
  const newExtra: HoldemExtra = {
    ...extra,
    players,
    pot: extra.pot + amount,
    currentActor: next,
  };

  if (next < 0 || allActedAndLevel(newExtra)) {
    return advancePhase(newExtra);
  }

  return { ok: true, extra: pushSnapshot(newExtra) };
}

export function holdemRaise(
  extra: HoldemExtra,
  playerIndex: number,
  amount: number,
): HoldemResult {
  if (!extra.started) return { ok: false, error: '游戏尚未开始' };
  if (extra.currentActor !== playerIndex) return { ok: false, error: '未轮到你' };
  if (extra.currentBet === 0) return { ok: false, error: '当前无人下注，请使用下注' };

  const player = extra.players[playerIndex];
  const diff = amount - player.roundBet;
  if (diff <= 0) return { ok: false, error: '加注金额必须大于当前已投入' };
  if (amount <= extra.currentBet) return { ok: false, error: `加注必须高于当前注 $${extra.currentBet}` };
  if (diff > player.chips) return { ok: false, error: '筹码不足' };

  const players = extra.players.map((p, i) => {
    if (i !== playerIndex) return { ...p, acted: false };
    const newChips = p.chips - diff;
    const allIned = newChips === 0;
    return { ...p, chips: newChips, roundBet: amount, totalBet: p.totalBet + diff, acted: true, allIned };
  });

  const next = nextActor(extra, playerIndex);
  const newExtra: HoldemExtra = {
    ...extra,
    players,
    pot: extra.pot + diff,
    currentBet: amount,
    currentActor: next,
  };

  if (next < 0 || allActedAndLevel(newExtra)) {
    return advancePhase(newExtra);
  }

  return { ok: true, extra: pushSnapshot(newExtra) };
}

export function holdemCheck(extra: HoldemExtra, playerIndex: number): HoldemResult {
  if (!extra.started) return { ok: false, error: '游戏尚未开始' };
  if (extra.currentActor !== playerIndex) return { ok: false, error: '未轮到你' };

  const player = extra.players[playerIndex];
  if (player.roundBet < extra.currentBet) return { ok: false, error: '需要跟注或加注' };

  const players = extra.players.map((p, i) =>
    i === playerIndex ? { ...p, acted: true } : p,
  );

  const next = nextActor(extra, playerIndex);
  const newExtra: HoldemExtra = { ...extra, players, currentActor: next };

  if (next < 0 || allActedAndLevel(newExtra)) {
    return advancePhase(newExtra);
  }

  return { ok: true, extra: pushSnapshot(newExtra) };
}

export function holdemFold(extra: HoldemExtra, playerIndex: number): HoldemResult {
  if (!extra.started) return { ok: false, error: '游戏尚未开始' };
  if (extra.currentActor !== playerIndex) return { ok: false, error: '未轮到你' };

  const players = extra.players.map((p, i) =>
    i === playerIndex ? { ...p, folded: true, acted: true } : p,
  );

  const remaining = players.filter(p => !p.folded);
  if (remaining.length === 1) {
    return {
      ok: true,
      extra: pushSnapshot({
        ...extra,
        players,
        phase: 'showdown',
        currentActor: -1,
        turnOrder: [],
      }),
    };
  }

  const next = nextActor(extra, playerIndex);
  const newExtra: HoldemExtra = { ...extra, players, currentActor: next };

  if (next < 0 || allActedAndLevel(newExtra)) {
    return advancePhase(newExtra);
  }

  return { ok: true, extra: pushSnapshot(newExtra) };
}

export function holdemAllIn(extra: HoldemExtra, playerIndex: number): HoldemResult {
  if (!extra.started) return { ok: false, error: '游戏尚未开始' };
  if (extra.currentActor !== playerIndex) return { ok: false, error: '未轮到你' };

  const player = extra.players[playerIndex];
  const amount = player.chips;
  if (amount <= 0) return { ok: false, error: '没有筹码可推' };

  const players = extra.players.map((p, i) => {
    if (i !== playerIndex) return extra.currentBet > 0 && p.roundBet < extra.currentBet ? { ...p, acted: false } : p;
    return { ...p, chips: 0, roundBet: p.roundBet + amount, totalBet: p.totalBet + amount, acted: true, allIned: true };
  });

  const newCurrentBet = Math.max(extra.currentBet, players[playerIndex].roundBet);

  // 侧池计算
  let sidePots = extra.sidePots;
  if (extra.sidePotEnabled) {
    sidePots = computeSidePots(players, extra.pot + amount);
  }

  const next = nextActor(extra, playerIndex);
  const newExtra: HoldemExtra = {
    ...extra,
    players,
    pot: extra.pot + amount,
    currentBet: newCurrentBet,
    currentActor: next,
    sidePots,
  };

  if (next < 0 || allActedAndLevel(newExtra)) {
    return advancePhase(newExtra);
  }

  return { ok: true, extra: pushSnapshot(newExtra) };
}

// ========== 阶段推进 ==========

function advancePhase(extra: HoldemExtra): HoldemResult {
  // 若只剩 0 或 1 个活跃玩家（未弃牌+未all-in），直接 showdown
  const canAct = extra.players.filter(p => !p.folded && !p.allIned).length;
  if (canAct <= 1) {
    const pushed = pushSnapshot({ ...extra, phase: 'showdown', currentActor: -1, turnOrder: [], roundUndoUsed: false, undoRequest: null });
    return { ok: true, extra: { ...pushed, roundStartIndex: pushed.historyIndex } };
  }

  const nextPhase: Record<string, HoldemExtra['phase']> = {
    preflop: 'flop',
    flop: 'turn',
    turn: 'river',
    river: 'showdown',
    showdown: 'showdown',
  };
  const phase = nextPhase[extra.phase] ?? 'showdown';

  if (phase === 'showdown') {
    const pushed = pushSnapshot({ ...extra, phase, currentActor: -1, turnOrder: [], roundUndoUsed: false, undoRequest: null });
    return { ok: true, extra: { ...pushed, roundStartIndex: pushed.historyIndex } };
  }

  // 清除本轮 acted/roundBet，重置 turnOrder（从 sb 之后开始）
  const players = extra.players.map(p => ({ ...p, acted: false, roundBet: 0 }));
  const sbIdx = (extra.dealerIndex + 1) % players.length;
  const startIdx = nextActor({ ...extra, players }, sbIdx);
  const turnOrder = buildTurnOrder(players, startIdx >= 0 ? startIdx : sbIdx);

  const pushed = pushSnapshot({
    ...extra,
    phase,
    players,
    currentBet: 0,
    currentActor: startIdx >= 0 ? startIdx : sbIdx,
    turnOrder,
    roundUndoUsed: false,
    undoRequest: null,
  });
  return { ok: true, extra: { ...pushed, roundStartIndex: pushed.historyIndex } };
}

// ========== 侧池计算 ==========

function computeSidePots(players: HoldemPlayerState[], totalPot: number): SidePot[] {
  const activePlayers = players
    .map((p, i) => ({ i, totalBet: p.totalBet }))
    .filter(x => !players[x.i].folded)
    .sort((a, b) => a.totalBet - b.totalBet);

  if (activePlayers.length <= 1) return [];

  const pots: SidePot[] = [];
  let prevAmount = 0;
  let remaining = totalPot;

  for (let j = 0; j < activePlayers.length; j++) {
    const current = activePlayers[j];
    const diff = current.totalBet - prevAmount;
    if (diff <= 0) continue;
    const eligible = activePlayers.slice(j).map(x => x.i);
    const potShare = diff * eligible.length;
    if (potShare > 0 && potShare <= remaining) {
      pots.push({ amount: potShare, eligible });
      remaining -= potShare;
    }
    prevAmount = current.totalBet;
  }

  if (remaining > 0 && pots.length > 0) {
    pots[pots.length - 1].amount += remaining;
  }

  return pots;
}

// ========== 取钱 ==========

export function takeMoney(
  extra: HoldemExtra,
  playerIndex: number,
  amount: number,
): HoldemResult {
  if (extra.phase !== 'showdown') return { ok: false, error: '只能在 showdown 后取钱' };
  if (amount <= 0) return { ok: false, error: '金额必须大于 0' };
  if (amount > extra.pot) return { ok: false, error: '奖池余额不足' };

  const players = extra.players.map((p, i) =>
    i === playerIndex ? { ...p, chips: p.chips + amount } : p,
  );

  return {
    ok: true,
    extra: { ...extra, players, pot: extra.pot - amount },
  };
}

// ========== 转账 ==========

export function giveMoney(
  extra: HoldemExtra,
  fromIndex: number,
  toIndex: number,
  amount: number,
): HoldemResult {
  if (fromIndex === toIndex) return { ok: false, error: '不能转给自己' };
  if (amount <= 0) return { ok: false, error: '金额必须大于 0' };
  const from = extra.players[fromIndex];
  if (!from) return { ok: false, error: '转出玩家不存在' };
  if (amount > from.chips) return { ok: false, error: '筹码不足' };

  const players = extra.players.map((p, i) => {
    if (i === fromIndex) return { ...p, chips: p.chips - amount };
    if (i === toIndex) return { ...p, chips: p.chips + amount };
    return p;
  });

  return { ok: true, extra: { ...extra, players } };
}

// ========== 借贷 ==========

export function borrowMoney(
  extra: HoldemExtra,
  playerIndex: number,
  amount?: number,
): HoldemResult {
  if (!extra.borrowEnabled) return { ok: false, error: '未启用银行借贷' };
  const borrowAmount = amount ?? extra.borrowAmount;
  if (borrowAmount <= 0) return { ok: false, error: '借贷金额必须大于 0' };

  const player = extra.players[playerIndex];
  if (extra.borrowLimit > 0 && player.borrowUsed + borrowAmount > extra.borrowLimit) {
    return { ok: false, error: `已达到借贷上限 ${extra.borrowLimit}` };
  }

  const players = extra.players.map((p, i) =>
    i === playerIndex
      ? { ...p, chips: p.chips + borrowAmount, borrowUsed: p.borrowUsed + borrowAmount }
      : p,
  );

  return { ok: true, extra: { ...extra, players } };
}

// ========== 还款 ==========

export function repayMoney(
  extra: HoldemExtra,
  playerIndex: number,
  amount?: number,
): HoldemResult {
  const player = extra.players[playerIndex];
  const repayAmount = amount ?? player.borrowUsed;
  if (repayAmount <= 0) return { ok: false, error: '还款金额必须大于 0' };
  if (repayAmount > player.borrowUsed) return { ok: false, error: '还款金额不能超过已借额度' };
  if (repayAmount > player.chips) return { ok: false, error: '筹码不足' };

  const players = extra.players.map((p, i) =>
    i === playerIndex
      ? { ...p, chips: p.chips - repayAmount, borrowUsed: p.borrowUsed - repayAmount }
      : p,
  );

  return { ok: true, extra: { ...extra, players } };
}

// ========== 撤回 ==========

export function requestUndo(
  extra: HoldemExtra,
  playerIndex: number,
): HoldemResult {
  if (!extra.started) return { ok: false, error: '游戏尚未开始' };
  if (extra.roundUndoUsed) return { ok: false, error: '本轮已用过撤回' };
  if (extra.undoRequest) return { ok: false, error: '已有撤回申请待审批' };

  const player = extra.players[playerIndex];
  if (!player.acted) return { ok: false, error: '你本轮尚未行动' };

  // 回退到当前下注轮开始的快照（roundStartIndex）
  const snapshotIndex = extra.roundStartIndex;

  return {
    ok: true,
    extra: {
      ...extra,
      undoRequest: { fromIndex: playerIndex, fromName: player.name || `玩家${playerIndex + 1}`, snapshotIndex, pending: true },
    },
  };
}

export function approveUndo(extra: HoldemExtra): HoldemResult {
  if (!extra.undoRequest?.pending) return { ok: false, error: '没有待审批的撤回申请' };

  const snapshotIndex = extra.undoRequest.snapshotIndex;
  const snapStr = extra.history[snapshotIndex];
  if (!snapStr) return { ok: false, error: '快照不存在' };

  const restored: HoldemExtra = JSON.parse(snapStr);
  restored.roundUndoUsed = true;
  restored.undoRequest = null;
  // 截断 history 到 snapshotIndex，避免后续 pushSnapshot 索引混乱
  restored.history = extra.history.slice(0, snapshotIndex);
  restored.historyIndex = snapshotIndex - 1;
  restored.roundStartIndex = snapshotIndex;

  return { ok: true, extra: restored };
}

export function rejectUndo(extra: HoldemExtra): HoldemResult {
  if (!extra.undoRequest?.pending) return { ok: false, error: '没有待审批的撤回申请' };
  return { ok: true, extra: { ...extra, undoRequest: null } };
}

// ========== 新一局 ==========

export function newHand(extra: HoldemExtra): HoldemResult {
  if (extra.pot > 0) return { ok: false, error: '奖池未取完，不能开新局' };
  const n = extra.players.length;
  const cfg: InitConfig = {
    sb: extra.sbAmount,
    bb: extra.bbAmount,
    startingChips: 0, // not used
    borrowEnabled: extra.borrowEnabled,
    borrowAmount: extra.borrowAmount,
    borrowLimit: extra.borrowLimit,
    sidePotEnabled: extra.sidePotEnabled,
    blindsEnabled: extra.blindsEnabled,
  };

  const newDealer = (extra.dealerIndex + 1) % n;
  let e = initExtraWithDealer(n, newDealer, cfg);

  // 保留筹码和借贷状态
  e.players = e.players.map((p, i) => ({
    ...p,
    chips: extra.players[i].chips,
    borrowUsed: extra.players[i].borrowUsed,
  }));

  return { ok: true, extra: postBlinds(e) };
}

// ========== 结束游戏（自动结算借贷） ==========

export function endGame(extra: HoldemExtra): HoldemResult {
  const players = extra.players.map(p => {
    if (p.borrowUsed > 0 && p.chips >= p.borrowUsed) {
      return { ...p, chips: p.chips - p.borrowUsed, borrowUsed: 0 };
    }
    if (p.borrowUsed > 0) {
      const repay = Math.min(p.chips, p.borrowUsed);
      return { ...p, chips: p.chips - repay, borrowUsed: p.borrowUsed - repay };
    }
    return p;
  });

  return { ok: true, extra: { ...extra, players, started: false, phase: 'showdown', currentActor: -1 } };
}
