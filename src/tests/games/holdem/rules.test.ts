// ============================================================
// 单元测试 — 德州扑克规则核（rules.ts）+ reducer 集成
// ============================================================

import { describe, it, expect } from "vitest";
import {
  initHoldemExtra, postBlinds,
  holdemBet, holdemCall, holdemRaise, holdemCheck, holdemFold, holdemAllIn,
  takeMoney, borrowMoney, repayMoney, giveMoney,
  requestUndo, approveUndo, rejectUndo,
  newHand, endGame,
  type HoldemExtra, type InitConfig,
} from "../../../games/holdem/rules";
import { reducer } from "../../../core/reducer";
import type { GameState } from "../../../core/types";

const DEFAULT_CFG: InitConfig = {
  sb: 1,
  bb: 2,
  startingChips: 300,
  borrowEnabled: true,
  borrowAmount: 300,
  borrowLimit: 0,
  sidePotEnabled: false,
  blindsEnabled: true,
};

function baseState(): GameState {
  return {
    version: 0, players: [], deck: [], discard: [], bottomCards: [],
    landlordIndex: -1, currentTurn: 0, phase: "idle",
    lastPlay: null, passCount: 0, winner: null,
  };
}

function init2Players(cfg: Partial<InitConfig> = {}): HoldemExtra {
  const extra = initHoldemExtra(2, { ...DEFAULT_CFG, ...cfg });
  extra.players[0].name = "Alice";
  extra.players[1].name = "Bob";
  return postBlinds(extra);
}

function init3Players(cfg: Partial<InitConfig> = {}): HoldemExtra {
  const extra = initHoldemExtra(3, { ...DEFAULT_CFG, ...cfg });
  extra.players[0].name = "Alice";
  extra.players[1].name = "Bob";
  extra.players[2].name = "Charlie";
  return postBlinds(extra);
}

// Safe result accessor: throws if not ok
function ok<T extends { ok: boolean }>(r: T): T & { ok: true } {
  if (!r.ok) throw new Error("expected ok but got: " + (r as { error?: string }).error);
  return r as T & { ok: true };
}

// Unsafe but safe: call when ok is guaranteed
function asOk(extra: HoldemExtra | undefined): HoldemExtra {
  if (!extra) throw new Error("extra is undefined");
  return extra;
}

// ========== Pure Function Tests ==========

describe("initHoldemExtra + postBlinds", () => {
  it("初始化 2 人局：自动扣盲注，pot=3，currentBet=bb", () => {
    const extra = init2Players();
    expect(extra.started).toBe(true);
    expect(extra.phase).toBe("preflop");
    expect(extra.pot).toBe(3); // 1 + 2
    expect(extra.currentBet).toBe(2);
    expect(extra.players.length).toBe(2);
  });

  it("初始筹码正确", () => {
    const extra = init2Players({ startingChips: 500 });
    const total = extra.players[0].chips + extra.players[1].chips;
    expect(total).toBe(500 + 500 - 3);
  });

  it("UTG 是 BB 的下一位", () => {
    const extra = initHoldemExtra(3, { ...DEFAULT_CFG, startingChips: 300 });
    extra.dealerIndex = 0;
    extra.players[0].name = "A";
    extra.players[1].name = "B";
    extra.players[2].name = "C";
    const e = postBlinds(extra);
    // dealer=0, SB=1, BB=2, UTG=0
    expect(e.currentActor).toBe(0);
  });
});

describe("preflop 行动（盲注后 currentBet=bb，UTG 只能 call/raise/fold）", () => {
  it("UTG bet 被拒绝（已有盲注 currentBet）", () => {
    const extra = init2Players();
    const me = extra.currentActor;
    const r = holdemBet(extra, me, 10);
    expect(r.ok).toBe(false);
  });

  it("UTG call 补齐到大盲", () => {
    let extra = init3Players();
    // dealer=random, figure out UTG
    const utG = extra.currentActor;
    const utGBefore = extra.players[utG].roundBet; // 0

    const r = ok(holdemCall(extra, utG));
    extra = r.extra;
    // Called to currentBet = 2
    expect(extra.players[utG].roundBet).toBe(2);
    expect(extra.pot).toBe(1 + 2 + (2 - utGBefore)); // sb + bb + (call)
    expect(extra.players[utG].acted).toBe(true);
  });

  it("UTG raise 加注到 10", () => {
    let extra = init2Players();
    const utG = extra.currentActor;
    const r = ok(holdemRaise(extra, utG, 10));
    expect(r.extra.currentBet).toBe(10);
    expect(r.extra.players[utG].roundBet).toBe(10);
    expect(r.extra.players[utG].acted).toBe(true);
    // 另一个玩家 acted 重置
    const other = utG ^ 1;
    expect(r.extra.players[other].acted).toBe(false);
  });

  it("raise 不小于 2 倍 currentBet 被拒绝", () => {
    const extra = init2Players();
    const utG = extra.currentActor;
    // currentBet=2, raise to 3 which < 2*2=4
    const r = holdemRaise(extra, utG, 3);
    expect(r.ok).toBe(false);
  });

  it("call 后 auto-advance（2人都行动且平齐）", () => {
    let extra = init2Players();
    const utG = extra.currentActor;
    extra = ok(holdemCall(extra, utG)).extra;
    // After UTG calls, BB had already acted (posted blind). Both roundBet = 2 = currentBet.
    // allActedAndLevel should trigger advancePhase
    expect(extra.phase).toBe("flop");
    expect(extra.currentBet).toBe(0);
  });
});

describe("holdemCheck / holdemFold", () => {
  it("flop 阶段 check 成功", () => {
    // Get to flop
    let extra = init2Players();
    extra = ok(holdemCall(extra, extra.currentActor)).extra;
    expect(extra.phase).toBe("flop");
    const actor = extra.currentActor;
    const r = ok(holdemCheck(extra, actor));
    expect(r.extra.players[actor].acted).toBe(true);
  });

  it("未平齐时 check 被拒绝", () => {
    let extra = init2Players();
    const utG = extra.currentActor;
    extra = ok(holdemRaise(extra, utG, 10)).extra;
    const other = extra.currentActor;
    const r = holdemCheck(extra, other);
    expect(r.ok).toBe(false);
  });

  it("fold 后仅剩 1 人 -> showdown", () => {
    let extra = init2Players();
    const utG = extra.currentActor;
    const r = ok(holdemFold(extra, utG));
    expect(r.extra.phase).toBe("showdown");
    expect(r.extra.currentActor).toBe(-1);
  });

  it("3 人局 fold 一人后继续", () => {
    let extra = init3Players();
    const p = extra.currentActor;
    const r = ok(holdemFold(extra, p));
    expect(r.extra.phase).not.toBe("showdown");
    expect(r.extra.currentActor).not.toBe(-1);
  });

  it("flop 阶段两次 check auto-advance", () => {
    let extra = init2Players();
    extra = ok(holdemCall(extra, extra.currentActor)).extra;
    expect(extra.phase).toBe("flop");
    const p0 = extra.currentActor;
    extra = ok(holdemCheck(extra, p0)).extra;
    const p1 = extra.currentActor;
    extra = ok(holdemCheck(extra, p1)).extra;
    expect(extra.phase).toBe("turn");
  });
});

describe("holdemAllIn", () => {
  it("All-in 所有筹码推入 -> allIned", () => {
    let extra = init2Players({ startingChips: 100 });
    // get to flop so we can test all-in directly
    extra = ok(holdemCall(extra, extra.currentActor)).extra;
    const actor = extra.currentActor;
    const chips = extra.players[actor].chips;
    const r = ok(holdemAllIn(extra, actor));
    expect(r.extra.players[actor].chips).toBe(0);
    expect(r.extra.players[actor].allIned).toBe(true);
    expect(r.extra.pot).toBe(extra.pot + chips);
  });

  it("双方 all-in -> showdown（推进到 showndown 不进入 flop）", () => {
    // Use 2 players, after blinds: go all-in
    let extra = init2Players({ startingChips: 100 });
    // Preflop: both all-in
    const utG = extra.currentActor;
    extra = ok(holdemAllIn(extra, utG)).extra;
    const bb = extra.currentActor; // BB player
    extra = ok(holdemAllIn(extra, bb)).extra;
    // Both all-in, canAct = 0, should be showdown, not flop
    expect(extra.phase).toBe("showdown");
  });
});

describe("阶段推进", () => {
  it("preflop call -> flop -> check * 2 -> turn -> check * 2 -> river -> check * 2 -> showdown", () => {
    let extra = init2Players();
    const phases: string[] = [];

    // preflop: call to advance
    extra = ok(holdemCall(extra, extra.currentActor)).extra;
    phases.push(extra.phase); // "flop"

    // flop -> turn
    extra = ok(holdemCheck(extra, extra.currentActor)).extra;
    extra = ok(holdemCheck(extra, extra.currentActor)).extra;
    phases.push(extra.phase); // "turn"

    // turn -> river
    extra = ok(holdemCheck(extra, extra.currentActor)).extra;
    extra = ok(holdemCheck(extra, extra.currentActor)).extra;
    phases.push(extra.phase); // "river"

    // river -> showdown
    extra = ok(holdemCheck(extra, extra.currentActor)).extra;
    extra = ok(holdemCheck(extra, extra.currentActor)).extra;
    phases.push(extra.phase); // "showdown"

    expect(phases).toEqual(["flop", "turn", "river", "showdown"]);
  });
});

describe("takeMoney", () => {
  it("showdown 后取钱", () => {
    let extra = init2Players();
    extra = ok(holdemFold(extra, extra.currentActor)).extra;
    expect(extra.phase).toBe("showdown");

    // Non-folder takes pot
    const winner = extra.players.findIndex(p => !p.folded);
    const beforeChips = extra.players[winner].chips;
    const pot = extra.pot;
    const r = ok(takeMoney(extra, winner, pot));
    expect(r.extra.pot).toBe(0);
    expect(r.extra.players[winner].chips).toBe(beforeChips + pot);
  });

  it("非 showdown 取钱被拒绝", () => {
    const extra = init2Players();
    const r = takeMoney(extra, 0, 10);
    expect(r.ok).toBe(false);
  });

  it("超额取钱被拒绝", () => {
    let extra = init2Players();
    extra = ok(holdemFold(extra, extra.currentActor)).extra;
    const r = takeMoney(extra, 0, extra.pot + 1);
    expect(r.ok).toBe(false);
  });
});

describe("borrowMoney", () => {
  it("借款 300", () => {
    let extra = init2Players();
    extra.players[0].chips = 0;
    const beforeBorrow = extra.players[0].borrowUsed;
    const r = ok(borrowMoney(extra, 0));
    expect(r.extra.players[0].chips).toBe(300);
    expect(r.extra.players[0].borrowUsed).toBe(beforeBorrow + 300);
  });

  it("自定义借款金额", () => {
    let extra = init2Players();
    extra.players[0].chips = 0;
    const r = ok(borrowMoney(extra, 0, 500));
    expect(r.extra.players[0].chips).toBe(500);
  });

  it("未启用借贷被拒绝", () => {
    let extra = init2Players();
    extra.borrowEnabled = false;
    const r = borrowMoney(extra, 0);
    expect(r.ok).toBe(false);
  });

  it("超借贷上限被拒绝", () => {
    let extra = init2Players();
    extra.borrowLimit = 200;
    extra.players[0].chips = 0;
    const r = borrowMoney(extra, 0, 300);
    expect(r.ok).toBe(false);
  });

  it("累计借贷不超上限", () => {
    let extra = init2Players();
    extra.borrowLimit = 400;
    extra.players[0].chips = 0;
    extra = ok(borrowMoney(extra, 0, 300)).extra;
    const r = borrowMoney(extra, 0, 200); // 500 > 400
    expect(r.ok).toBe(false);
  });
});

describe("giveMoney", () => {
  it("转账 100", () => {
    let extra = init2Players({ startingChips: 500 });
    const fromBefore = extra.players[0].chips;
    const toBefore = extra.players[1].chips;
    const r = ok(giveMoney(extra, 0, 1, 100));
    expect(r.extra.players[0].chips).toBe(fromBefore - 100);
    expect(r.extra.players[1].chips).toBe(toBefore + 100);
  });

  it("转给自己被拒绝", () => {
    const extra = init2Players();
    const r = giveMoney(extra, 0, 0, 10);
    expect(r.ok).toBe(false);
  });

  it("余额不足被拒绝", () => {
    const extra = init2Players({ startingChips: 10 });
    const r = giveMoney(extra, 0, 1, 1000);
    expect(r.ok).toBe(false);
  });
});

describe("requestUndo / approveUndo / rejectUndo", () => {
  it("撤回 -> 主机同意 -> 状态回退", () => {
    let extra = init2Players();
    // Get to flop first where everyone can check
    extra = ok(holdemCall(extra, extra.currentActor)).extra;
    const actor = extra.currentActor;
    const beforeChips = extra.players[actor].chips;
    const beforePot = extra.pot;

    // actor checks
    extra = ok(holdemCheck(extra, actor)).extra;

    // request undo
    const req = ok(requestUndo(extra, actor));
    expect(req.extra.undoRequest?.pending).toBe(true);

    // approve
    const approved = ok(approveUndo(req.extra));
    expect(approved.extra.undoRequest).toBeNull();
    expect(approved.extra.roundUndoUsed).toBe(true);
    expect(approved.extra.players[actor].chips).toBe(beforeChips);
    expect(approved.extra.pot).toBe(beforePot);
  });

  it("未行动者不能申请撤回", () => {
    let extra = init2Players();
    extra = ok(holdemCall(extra, extra.currentActor)).extra;
    const p0 = extra.currentActor;
    extra = ok(holdemCheck(extra, p0)).extra;
    const p1 = extra.currentActor; // hasnt acted yet
    const r = requestUndo(extra, p1);
    expect(r.ok).toBe(false);
  });

  it("本轮用过撤回后不能再申请", () => {
    let extra = init2Players();
    extra = ok(holdemCall(extra, extra.currentActor)).extra;
    const p0 = extra.currentActor;
    extra = ok(holdemCheck(extra, p0)).extra;
    extra = ok(requestUndo(extra, p0)).extra;
    extra = ok(approveUndo(extra)).extra;
    // act again
    extra = ok(holdemCheck(extra, p0)).extra;
    const r = requestUndo(extra, p0);
    expect(r.ok).toBe(false);
  });

  it("主机拒绝撤回后撤销审批", () => {
    let extra = init2Players();
    extra = ok(holdemCall(extra, extra.currentActor)).extra;
    const p0 = extra.currentActor;
    extra = ok(holdemCheck(extra, p0)).extra;
    extra = ok(requestUndo(extra, p0)).extra;
    const r = ok(rejectUndo(extra));
    expect(r.extra.undoRequest).toBeNull();
  });
});

describe("newHand", () => {
  it("新一局庄家轮转，状态重置，筹码保留", () => {
    let extra = init2Players();
    const oldDealer = extra.dealerIndex;
    extra = ok(holdemFold(extra, extra.currentActor)).extra;
    // Someone takes pot
    const winner = extra.players.findIndex(p => !p.folded);
    const winnerChips = extra.players[winner].chips + extra.pot;
    extra = ok(takeMoney(extra, winner, extra.pot)).extra;
    expect(extra.players[winner].chips).toBe(winnerChips);

    const r = ok(newHand(extra));
    expect(r.extra.dealerIndex).toBe((oldDealer + 1) % 2);
    expect(r.extra.started).toBe(true);
    expect(r.extra.phase).toBe("preflop");
    expect(r.extra.pot).toBe(3);
  });

  it("保留借贷状态", () => {
    let extra = init2Players();
    extra.players[0].borrowUsed = 100;
    extra = ok(holdemFold(extra, extra.currentActor)).extra;
    extra = ok(takeMoney(extra, 1, extra.pot)).extra; // empty pot first
    const r = ok(newHand(extra));
    expect(r.extra.players[0].borrowUsed).toBe(100);
  });
});

describe("endGame", () => {
  it("筹码足时自动全额偿还借贷", () => {
    let extra = init2Players({ startingChips: 500 });
    extra.players[0].borrowUsed = 100;
    const beforeChips = extra.players[0].chips;
    const r = ok(endGame(extra));
    expect(r.extra.players[0].borrowUsed).toBe(0);
    expect(r.extra.players[0].chips).toBe(beforeChips - 100);
  });

  it("筹码不足时部分偿还", () => {
    let extra = init2Players({ startingChips: 50 });
    extra.players[0].borrowUsed = 100;
    // After postBlinds: chips = 50 - 1 = 49 (if SB) or 50 - 2 = 48 (if BB)
    const r = ok(endGame(extra));
    expect(r.extra.players[0].chips).toBe(0);
    // Repaid min(chips_before_endgame, borrowUsed)
    expect(r.extra.players[0].borrowUsed).toBeGreaterThan(0);
    expect(r.extra.players[0].borrowUsed).toBeLessThan(100);
  });

  it("无借贷筹码不变", () => {
    let extra = init2Players({ startingChips: 500 });
    const beforeChips = extra.players[0].chips;
    const r = ok(endGame(extra));
    expect(r.extra.players[0].chips).toBe(beforeChips);
  });
});

describe("无盲注模式", () => {
  it("blindsEnabled=false 时不扣 SB/BB，pot=0，currentBet=0", () => {
    const extra = init2Players({ blindsEnabled: false });
    expect(extra.pot).toBe(0);
    expect(extra.currentBet).toBe(0);
    extra.players.forEach(p => { expect(p.roundBet).toBe(0); });
  });

  it("无盲注时 bet 任意正数即可", () => {
    const extra = init2Players({ blindsEnabled: false });
    const actor = extra.currentActor;
    // currentBet=0, so bet is allowed
    const r = ok(holdemBet(extra, actor, 5));
    expect(r.extra.pot).toBe(5);
  });

  it("无盲注时 currentActor = 庄家下家", () => {
    const extra = initHoldemExtra(3, { ...DEFAULT_CFG, blindsEnabled: false, startingChips: 300 });
    extra.dealerIndex = 0;
    extra.players.forEach((p, i) => p.name = "P" + i);
    const e = postBlinds(extra);
    expect(e.currentActor).toBe(1);
  });
});

describe("repayMoney", () => {
  it("还款成功：扣 chips 减 borrowUsed", () => {
    let extra = init2Players();
    extra.players[0].borrowUsed = 200;
    extra.players[0].chips = 400;
    const r = ok(repayMoney(extra, 0, 100));
    expect(r.extra.players[0].chips).toBe(300);
    expect(r.extra.players[0].borrowUsed).toBe(100);
  });

  it("还款金额不能超过已借额度", () => {
    let extra = init2Players();
    extra.players[0].borrowUsed = 100;
    extra.players[0].chips = 400;
    const r = repayMoney(extra, 0, 200);
    expect(r.ok).toBe(false);
  });

  it("还款金额不能超过筹码余额", () => {
    let extra = init2Players();
    extra.players[0].borrowUsed = 200;
    extra.players[0].chips = 50;
    const r = repayMoney(extra, 0, 100);
    expect(r.ok).toBe(false);
  });

  it("不传 amount 时全额还款", () => {
    let extra = init2Players();
    extra.players[0].borrowUsed = 200;
    extra.players[0].chips = 400;
    const r = ok(repayMoney(extra, 0));
    expect(r.extra.players[0].borrowUsed).toBe(0);
    expect(r.extra.players[0].chips).toBe(200);
  });
});

describe("newHand 奖池门槛", () => {
  it("pot > 0 时 newHand 被拒绝", () => {
    let extra = init2Players();
    extra = ok(holdemFold(extra, extra.currentActor)).extra;
    // pot = 3 (blinds), not yet taken
    expect(extra.pot).toBeGreaterThan(0);
    const r = newHand(extra);
    expect(r.ok).toBe(false);
  });

  it("pot = 0 时 newHand 成功", () => {
    let extra = init2Players();
    extra = ok(holdemFold(extra, extra.currentActor)).extra;
    const winner = extra.players.findIndex(p => !p.folded);
    extra = ok(takeMoney(extra, winner, extra.pot)).extra;
    expect(extra.pot).toBe(0);
    const r = ok(newHand(extra));
    expect(r.extra.started).toBe(true);
  });
});

// ========== Reducer Integration Tests ==========

describe("reducer 集成", () => {
  function gameState(): GameState {
    return {
      ...baseState(),
      players: [
        { index: 0, name: "Alice", hand: [], handCount: 0, isHost: true, isDisconnected: false, extra: {} },
        { index: 1, name: "Bob", hand: [], handCount: 0, isHost: false, isDisconnected: false, extra: {} },
        { index: 2, name: "Charlie", hand: [], handCount: 0, isHost: false, isDisconnected: false, extra: {} },
      ],
    };
  }

  function einit(s: GameState, players: { index: number; name: string }[] = [{ index: 0, name: "A" }, { index: 1, name: "B" }]): GameState {
    return reducer(s, {
      type: "holdem_init", playerIndex: 0,
      payload: { ...DEFAULT_CFG, players },
      timestamp: 0,
    });
  }

  function eextra(s: GameState): HoldemExtra {
    return s.extra as HoldemExtra;
  }

  it("holdem_init phase=playing extra.started=true", () => {
    const s = einit(gameState());
    expect(s.phase).toBe("playing");
    expect(eextra(s).started).toBe(true);
    expect(eextra(s).phase).toBe("preflop");
    expect(eextra(s).pot).toBe(3);
  });

  it("holdem_call -> auto-advance 后 phase=flop", () => {
    let s = einit(gameState());
    const utG = eextra(s).currentActor;
    s = reducer(s, { type: "holdem_call", playerIndex: utG, payload: null, timestamp: 0 });
    expect(eextra(s).phase).toBe("flop");
    expect(s.version).toBe(2);
  });

  it("holdem_fold -> showdown", () => {
    let s = einit(gameState());
    const utG = eextra(s).currentActor;
    s = reducer(s, { type: "holdem_fold", playerIndex: utG, payload: null, timestamp: 0 });
    expect(eextra(s).phase).toBe("showdown");
  });

  it("holdem_take_money showdown 取钱", () => {
    let s = einit(gameState());
    const utG = eextra(s).currentActor;
    s = reducer(s, { type: "holdem_fold", playerIndex: utG, payload: null, timestamp: 0 });
    const winner = eextra(s).players.findIndex(p => !p.folded);
    const pot = eextra(s).pot;
    const chips = eextra(s).players[winner].chips;
    s = reducer(s, { type: "holdem_take_money", playerIndex: winner, payload: { amount: pot }, timestamp: 0 });
    expect(eextra(s).pot).toBe(0);
    expect(eextra(s).players[winner].chips).toBe(chips + pot);
  });

  it("holdem_borrow 借款", () => {
    let s = einit(gameState());
    // Manually set chips to 0
    const extra = JSON.parse(JSON.stringify(eextra(s))) as HoldemExtra;
    extra.players[0].chips = 0;
    s = { ...s, extra };

    s = reducer(s, { type: "holdem_borrow", playerIndex: 0, payload: { amount: 300 }, timestamp: 0 });
    expect(eextra(s).players[0].chips).toBe(300);
    expect(eextra(s).players[0].borrowUsed).toBe(300);
  });

  it("holdem_give_money 转账", () => {
    let s = einit(gameState());
    const a = eextra(s).players[0].chips;
    const b = eextra(s).players[1].chips;
    s = reducer(s, { type: "holdem_give_money", playerIndex: 0, payload: { toIndex: 1, amount: 50 }, timestamp: 0 });
    expect(eextra(s).players[0].chips).toBe(a - 50);
    expect(eextra(s).players[1].chips).toBe(b + 50);
  });

  it("holdem_new_hand 新一局庄家轮转", () => {
    let s = einit(gameState());
    const oldDealer = eextra(s).dealerIndex;
    s = reducer(s, { type: "holdem_fold", playerIndex: eextra(s).currentActor, payload: null, timestamp: 0 });
    const winner = eextra(s).players.findIndex(p => !p.folded);
    s = reducer(s, { type: "holdem_take_money", playerIndex: winner, payload: { amount: eextra(s).pot }, timestamp: 0 });
    s = reducer(s, { type: "holdem_new_hand", playerIndex: 0, payload: null, timestamp: 0 });
    expect(eextra(s).dealerIndex).toBe((oldDealer + 1) % 2);
    expect(eextra(s).phase).toBe("preflop");
  });

  it("holdem_end_game -> phase=ended", () => {
    let s = einit(gameState());
    s = reducer(s, { type: "holdem_end_game", playerIndex: 0, payload: null, timestamp: 0 });
    expect(s.phase).toBe("ended");
  });

  it("非当前回合玩家 fold 被拒绝", () => {
    let s = einit(gameState());
    const current = eextra(s).currentActor;
    const other = current ^ 1;
    // other is not current actor
    const s2 = reducer(s, { type: "holdem_fold", playerIndex: other, payload: null, timestamp: 0 });
    expect(s2).toBe(s);
  });

  it("holdem_all_in 双方全下 -> showdown", () => {
    let s = reducer(gameState(), {
      type: "holdem_init", playerIndex: 0,
      payload: { ...DEFAULT_CFG, startingChips: 100, players: [{ index: 0, name: "A" }, { index: 1, name: "B" }] },
      timestamp: 0,
    });
    const utG = eextra(s).currentActor;
    s = reducer(s, { type: "holdem_all_in", playerIndex: utG, payload: null, timestamp: 0 });
    const bb = eextra(s).currentActor;
    s = reducer(s, { type: "holdem_all_in", playerIndex: bb, payload: null, timestamp: 0 });
    expect(eextra(s).phase).toBe("showdown");
  });
});
