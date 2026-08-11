// ============================================================
// BoardGameSimulator — 状态更新核心（Reducer）
// ============================================================

import type { GameState, GameAction } from './types';
import {
  initBoards, placeShip, randomPlace, removeShip, confirmBoard, fire,
  type BattleshipExtra,
} from '../games/battleship/rules';
import {
  initHoldemExtra, postBlinds,
  holdemBet, holdemCall, holdemRaise, holdemCheck, holdemFold, holdemAllIn,
  takeMoney, borrowMoney, repayMoney, giveMoney, requestUndo, approveUndo, rejectUndo,
  newHand, endGame,
  type HoldemExtra, type InitConfig,
} from '../games/holdem/rules';

/**
 * 主 Reducer：接收当前状态和 Action，返回新状态。
 * 这是一个纯函数——不修改传入的 state，始终返回新的 state 对象。
 */
export function reducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'start_game':
      return handleStartGame(state, action);
    case 'call_landlord':
      return handleCallLandlord(state, action);
    case 'play_cards':
      return handlePlayCards(state, action);
    case 'pass':
      return handlePass(state, action);
    case 'battleship_place':
      return handleBattleshipPlace(state, action);
    case 'battleship_random':
      return handleBattleshipRandom(state, action);
    case 'battleship_remove':
      return handleBattleshipRemove(state, action);
    case 'battleship_confirm':
      return handleBattleshipConfirm(state, action);
    case 'battleship_fire':
      return handleBattleshipFire(state, action);
    case 'holdem_init':
      return handleHoldemInit(state, action);
    case 'holdem_bet':
      return handleHoldemBet(state, action);
    case 'holdem_call':
      return handleHoldemSimple(state, action, holdemCall);
    case 'holdem_raise':
      return handleHoldemRaise(state, action);
    case 'holdem_check':
      return handleHoldemSimple(state, action, holdemCheck);
    case 'holdem_fold':
      return handleHoldemSimple(state, action, holdemFold);
    case 'holdem_all_in':
      return handleHoldemSimple(state, action, holdemAllIn);
    case 'holdem_take_money':
      return handleHoldemTakeMoney(state, action);
    case 'holdem_borrow':
      return handleHoldemBorrow(state, action);
    case 'holdem_repay':
      return handleHoldemRepay(state, action);
    case 'holdem_give_money':
      return handleHoldemGiveMoney(state, action);
    case 'holdem_request_undo':
      return handleHoldemSimple(state, action, requestUndo);
    case 'holdem_approve_undo':
      return handleHoldemSimple(state, action, approveUndo);
    case 'holdem_reject_undo':
      return handleHoldemSimple(state, action, rejectUndo);
    case 'holdem_new_hand':
      return handleHoldemSimple(state, action, newHand);
    case 'holdem_end_game':
      return handleHoldemEndGame(state, action);
    default:
      return state; // 未知 action，原样返回
  }
}

// ---------- 内置动作处理 ----------

function handleStartGame(state: GameState, _action: GameAction): GameState {
  if (state.phase !== 'idle') return state; // 拒绝：返回原引用

  return {
    ...state,
    version: state.version + 1,
    phase: 'calling',
    currentTurn: 0,
  };
}

function handleCallLandlord(state: GameState, action: GameAction): GameState {
  if (state.phase !== 'calling') return state; // 拒绝：返回原引用

  const call = (action.payload as { call: boolean })?.call;
  if (!call) {
    const nextTurn = (state.currentTurn + 1) % state.players.length;
    if (nextTurn === 0) {
      return { ...state, version: state.version + 1, phase: 'ended', winner: -1, currentTurn: 0 };
    }
    return { ...state, version: state.version + 1, currentTurn: nextTurn };
  }

  return {
    ...state,
    version: state.version + 1,
    landlordIndex: action.playerIndex,
    phase: 'playing',
    currentTurn: action.playerIndex,
    players: state.players.map(p => {
      if (p.index === action.playerIndex) {
        return { ...p, hand: [...p.hand, ...state.bottomCards], handCount: p.hand.length + state.bottomCards.length };
      }
      return p;
    }),
    bottomCards: [],
    lastPlay: null,
    passCount: 0,
  };
}

function handlePlayCards(state: GameState, action: GameAction): GameState {
  if (state.phase !== 'playing' || action.playerIndex !== state.currentTurn) return state; // 拒绝：返回原引用

  const cards = (action.payload as { cards: string[] })?.cards ?? [];
  const player = state.players[action.playerIndex];
  const playedCards = player.hand.filter(c => cards.includes(c.id));
  const remainingHand = player.hand.filter(c => !cards.includes(c.id));

  const newPlayers = state.players.map((p, i) => {
    if (i === action.playerIndex) {
      return { ...p, hand: remainingHand, handCount: remainingHand.length };
    }
    return p;
  });

  if (remainingHand.length === 0) {
    const winner = action.playerIndex === state.landlordIndex
      ? state.landlordIndex
      : (state.landlordIndex + 1) % state.players.length;
    return {
      ...state,
      version: state.version + 1,
      players: newPlayers,
      discard: playedCards,
      lastPlay: { playerIndex: action.playerIndex, cards: playedCards, pattern: null },
      phase: 'ended',
      winner,
    };
  }

  const nextTurn = (state.currentTurn + 1) % state.players.length;

  return {
    ...state,
    version: state.version + 1,
    players: newPlayers,
    discard: playedCards,
    lastPlay: { playerIndex: action.playerIndex, cards: playedCards, pattern: null },
    currentTurn: nextTurn,
    passCount: 0,
  };
}

function handlePass(state: GameState, action: GameAction): GameState {
  if (state.phase !== 'playing' || action.playerIndex !== state.currentTurn) return state; // 拒绝：返回原引用

  const nextTurn = (state.currentTurn + 1) % state.players.length;

  return {
    ...state,
    version: state.version + 1,
    currentTurn: nextTurn,
    passCount: state.passCount + 1,
  };
}

// ---------- 海战棋 ----------

function ensureExtra(state: GameState): BattleshipExtra {
  const extra = state.extra as BattleshipExtra | undefined;
  if (extra && Array.isArray(extra.boards)) return extra;
  return initBoards(state.players.length || 2);
}

function applyExtra(state: GameState, extra: BattleshipExtra): GameState {
  return {
    ...state,
    version: state.version + 1,
    extra,
    phase: extra.stage === 'battle' ? 'playing' : state.phase,
  };
}

function handleBattleshipPlace(state: GameState, action: GameAction): GameState {
  if (state.phase === 'ended') return state; // 拒绝：返回原引用
  const payload = action.payload as { shipId: string; cells: string[] } | undefined;
  if (!payload || typeof payload.shipId !== 'string' || !Array.isArray(payload.cells)) return state;

  const r = placeShip(ensureExtra(state), action.playerIndex, payload.shipId, payload.cells);
  if (!r.ok) return state;
  return applyExtra(state, r.extra);
}

function handleBattleshipRandom(state: GameState, action: GameAction): GameState {
  if (state.phase === 'ended') return state;

  const r = randomPlace(ensureExtra(state), action.playerIndex);
  if (!r.ok) return state;
  return applyExtra(state, r.extra);
}

function handleBattleshipRemove(state: GameState, action: GameAction): GameState {
  if (state.phase === 'ended') return state;
  const payload = action.payload as { shipId: string } | undefined;
  if (!payload || typeof payload.shipId !== 'string') return state;

  const r = removeShip(ensureExtra(state), action.playerIndex, payload.shipId);
  if (!r.ok) return state;
  return applyExtra(state, r.extra);
}

function handleBattleshipConfirm(state: GameState, action: GameAction): GameState {
  if (state.phase === 'ended') return state;

  const r = confirmBoard(ensureExtra(state), action.playerIndex);
  if (!r.ok) return state;
  return applyExtra(state, r.extra);
}

function handleBattleshipFire(state: GameState, action: GameAction): GameState {
  const extra = state.extra as BattleshipExtra | undefined;
  if (!extra || extra.stage !== 'battle') return state; // 拒绝：返回原引用
  if (state.phase !== 'playing' || action.playerIndex !== state.currentTurn) return state;

  const payload = action.payload as { cell: string } | undefined;
  if (!payload || typeof payload.cell !== 'string') return state;

  const r = fire(extra, action.playerIndex, payload.cell);
  if (!r.ok) return state;

  const next: GameState = { ...state, version: state.version + 1, extra: r.extra };
  const log = r.extra.log ?? [];
  next.extra = {
    ...r.extra,
    log: [...log, { by: action.playerIndex, cell: payload.cell, result: r.result.result, sunk: r.result.sunk }].slice(-100),
  };
  if (r.result.winner !== null) {
    next.phase = 'ended';
    next.winner = r.result.winner;
  } else {
    next.currentTurn = (state.currentTurn + 1) % state.players.length;
  }
  return next;
}

// ---------- 德州扑克 ----------

function ensureHoldem(state: GameState): HoldemExtra {
  return (state.extra as HoldemExtra) ?? null!;
}

function applyHoldem(state: GameState, extra: HoldemExtra): GameState {
  return { ...state, version: state.version + 1, extra };
}

function handleHoldemInit(state: GameState, action: GameAction): GameState {
  if (state.phase !== 'idle') return state;
  const payload = action.payload as InitConfig & { players: { index: number; name: string }[] } | undefined;
  if (!payload) return state;

  const playerList = payload.players ?? [];
  const extra = initHoldemExtra(playerList.length, payload);
  // 注入玩家名
  extra.players = extra.players.map((p, i) => ({
    ...p,
    name: playerList[i]?.name ?? `玩家${i + 1}`,
  }));
  const startedExtra = postBlinds(extra);

  return {
    ...state,
    version: state.version + 1,
    extra: startedExtra,
    players: startedExtra.players.map((p, i) => ({
      index: p.index,
      name: p.name,
      hand: [],
      handCount: 0,
      isHost: i === 0,
      isDisconnected: false,
      extra: { chips: p.chips, roundBet: p.roundBet, totalBet: p.totalBet, folded: p.folded, allIned: p.allIned, borrowUsed: p.borrowUsed },
    })),
    currentTurn: startedExtra.currentActor >= 0 ? startedExtra.currentActor : 0,
    phase: 'playing',
  };
}

function handleHoldemBet(state: GameState, action: GameAction): GameState {
  const extra = ensureHoldem(state);
  if (!extra) return state;
  const amount = (action.payload as { amount?: number } | undefined)?.amount ?? 0;
  const r = holdemBet(extra, action.playerIndex, amount);
  if (!r.ok) return state;
  return syncHoldemPlayers(applyHoldem(state, r.extra));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleHoldemSimple(
  state: GameState,
  action: GameAction,
  fn: (extra: HoldemExtra, playerIndex: number) => any,
): GameState {
  const extra = ensureHoldem(state);
  if (!extra) return state;
  const r = fn(extra, action.playerIndex);
  if (!r.ok) return state;
  const result = applyHoldem(state, r.extra);
  // 同步 players 数组到 GameState.players
  return syncHoldemPlayers(result);
}

function handleHoldemRaise(state: GameState, action: GameAction): GameState {
  const extra = ensureHoldem(state);
  if (!extra) return state;
  const amount = (action.payload as { amount?: number } | undefined)?.amount ?? 0;
  const r = holdemRaise(extra, action.playerIndex, amount);
  if (!r.ok) return state;
  return syncHoldemPlayers(applyHoldem(state, r.extra));
}

function handleHoldemTakeMoney(state: GameState, action: GameAction): GameState {
  const extra = ensureHoldem(state);
  if (!extra) return state;
  const amount = (action.payload as { amount?: number } | undefined)?.amount ?? 0;
  const r = takeMoney(extra, action.playerIndex, amount);
  if (!r.ok) return state;
  return syncHoldemPlayers(applyHoldem(state, r.extra));
}

function handleHoldemBorrow(state: GameState, action: GameAction): GameState {
  const extra = ensureHoldem(state);
  if (!extra) return state;
  const amount = (action.payload as { amount?: number } | undefined)?.amount;
  const r = borrowMoney(extra, action.playerIndex, amount);
  if (!r.ok) return state;
  return syncHoldemPlayers(applyHoldem(state, r.extra));
}

function handleHoldemRepay(state: GameState, action: GameAction): GameState {
  const extra = ensureHoldem(state);
  if (!extra) return state;
  const amount = (action.payload as { amount?: number } | undefined)?.amount;
  const r = repayMoney(extra, action.playerIndex, amount);
  if (!r.ok) return state;
  return syncHoldemPlayers(applyHoldem(state, r.extra));
}

function handleHoldemGiveMoney(state: GameState, action: GameAction): GameState {
  const extra = ensureHoldem(state);
  if (!extra) return state;
  const payload = action.payload as { toIndex: number; amount: number } | undefined;
  if (payload === undefined || typeof payload.toIndex !== 'number' || typeof payload.amount !== 'number') return state;
  const r = giveMoney(extra, action.playerIndex, payload.toIndex, payload.amount);
  if (!r.ok) return state;
  return syncHoldemPlayers(applyHoldem(state, r.extra));
}

function handleHoldemEndGame(state: GameState, _action: GameAction): GameState {
  const extra = ensureHoldem(state);
  if (!extra) return state;
  const r = endGame(extra);
  if (!r.ok) return state;
  return { ...syncHoldemPlayers(applyHoldem(state, r.extra)), phase: 'ended' };
}

function syncHoldemPlayers(state: GameState): GameState {
  const extra = state.extra as HoldemExtra | undefined;
  if (!extra) return state;
  const players = state.players.map((p, i) => {
    const hp = extra.players[i];
    if (!hp) return p;
    return {
      ...p,
      extra: { chips: hp.chips, roundBet: hp.roundBet, totalBet: hp.totalBet, folded: hp.folded, allIned: hp.allIned, borrowUsed: hp.borrowUsed },
    };
  });
  return { ...state, players, currentTurn: extra.currentActor >= 0 ? extra.currentActor : state.currentTurn };
}
