// ============================================================
// BoardGameSimulator — 状态更新核心（Reducer）
// ============================================================

import type { GameState, GameAction } from './types';
import {
  initBoards, placeShip, randomPlace, fire,
  type BattleshipExtra,
} from '../games/battleship/rules';

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
    case 'battleship_fire':
      return handleBattleshipFire(state, action);
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
