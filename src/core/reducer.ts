// ============================================================
// BoardGameSimulator — 状态更新核心（Reducer）
// ============================================================

import type { GameState, GameAction } from './types';

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
