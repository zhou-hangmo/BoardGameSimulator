// ============================================================
// 单元测试 — Reducer 状态更新
// ============================================================

import { describe, it, expect } from 'vitest';
import { reducer } from '../../core/reducer';
import type { GameState, GameAction, Card } from '../../core/types';

function makeCard(id: string): Card {
  return { id, suit: 'spade', rank: 'A', name: id, value: 14 };
}

function makeTestState(overrides: Partial<GameState> = {}): GameState {
  return {
    version: 1,
    players: [
      { index: 0, name: '玩家1', hand: [makeCard('sA'), makeCard('hK')], handCount: 2, isHost: true, isDisconnected: false },
      { index: 1, name: '玩家2', hand: [makeCard('dQ'), makeCard('cJ')], handCount: 2, isHost: false, isDisconnected: false },
      { index: 2, name: '玩家3', hand: [makeCard('h10'), makeCard('s9')], handCount: 2, isHost: false, isDisconnected: false },
    ],
    deck: [],
    discard: [],
    bottomCards: [makeCard('djoker'), makeCard('bjoker'), makeCard('sK')],
    landlordIndex: -1,
    currentTurn: 0,
    phase: 'idle',
    lastPlay: null,
    passCount: 0,
    winner: null,
    ...overrides,
  };
}

describe('reducer', () => {
  describe('start_game', () => {
    it('应该从 idle 进入 calling 阶段', () => {
      const state = makeTestState({ phase: 'idle' });
      const action: GameAction = { type: 'start_game', playerIndex: 0, timestamp: 0 };
      const next = reducer(state, action);

      expect(next.phase).toBe('calling');
      expect(next.currentTurn).toBe(0);
      expect(next.version).toBe(state.version + 1);
    });

    it('非 idle 阶段调用应该被无视', () => {
      const state = makeTestState({ phase: 'playing' });
      const action: GameAction = { type: 'start_game', playerIndex: 0, timestamp: 0 };
      const next = reducer(state, action);

      expect(next).toBe(state); // 相同引用
    });
  });

  describe('call_landlord', () => {
    it('叫地主成功后进入 playing 阶段', () => {
      const state = makeTestState({ phase: 'calling', currentTurn: 1 });
      const action: GameAction = { type: 'call_landlord', playerIndex: 1, payload: { call: true }, timestamp: 0 };
      const next = reducer(state, action);

      expect(next.landlordIndex).toBe(1);
      expect(next.phase).toBe('playing');
      expect(next.currentTurn).toBe(1);
      // 地主获得底牌
      expect(next.players[1].hand.length).toBe(5); // 2 + 3底牌
      expect(next.bottomCards).toEqual([]);
    });

    it('不叫地主轮转到下一个人', () => {
      const state = makeTestState({ phase: 'calling', currentTurn: 0 });
      const action: GameAction = { type: 'call_landlord', playerIndex: 0, payload: { call: false }, timestamp: 0 };
      const next = reducer(state, action);

      expect(next.currentTurn).toBe(1);
      expect(next.phase).toBe('calling');
    });

    it('所有人都不叫则游戏结束', () => {
      const state = makeTestState({ phase: 'calling', currentTurn: 2 });
      const action: GameAction = { type: 'call_landlord', playerIndex: 2, payload: { call: false }, timestamp: 0 };
      const next = reducer(state, action);

      expect(next.phase).toBe('ended');
      expect(next.winner).toBe(-1);
    });
  });

  describe('play_cards', () => {
    it('出牌后手牌减少', () => {
      const state = makeTestState({ phase: 'playing', currentTurn: 0 });
      const action: GameAction = {
        type: 'play_cards',
        playerIndex: 0,
        payload: { cards: ['sA'] },
        timestamp: 0,
      };
      const next = reducer(state, action);

      expect(next.players[0].hand.length).toBe(1);
      expect(next.players[0].handCount).toBe(1);
      expect(next.discard.length).toBe(1);
      expect(next.currentTurn).toBe(1); // 下一回合
      expect(next.passCount).toBe(0);
    });

    it('手牌出完后游戏结束', () => {
      const state = makeTestState({
        phase: 'playing',
        currentTurn: 0,
        landlordIndex: 0,
        players: [
          { index: 0, name: '地主', hand: [makeCard('sA')], handCount: 1, isHost: true, isDisconnected: false },
          { index: 1, name: '农民1', hand: [makeCard('hK')], handCount: 1, isHost: false, isDisconnected: false },
          { index: 2, name: '农民2', hand: [makeCard('dQ')], handCount: 1, isHost: false, isDisconnected: false },
        ],
      });
      const action: GameAction = {
        type: 'play_cards',
        playerIndex: 0,
        payload: { cards: ['sA'] },
        timestamp: 0,
      };
      const next = reducer(state, action);

      expect(next.phase).toBe('ended');
      expect(next.winner).toBe(0); // 地主胜
    });

    it('非当前回合玩家出牌被无视', () => {
      const state = makeTestState({ phase: 'playing', currentTurn: 0 });
      const action: GameAction = { type: 'play_cards', playerIndex: 1, payload: { cards: ['hK'] }, timestamp: 0 };
      const next = reducer(state, action);

      expect(next).toBe(state); // 被拒绝
    });
  });

  describe('pass', () => {
    it('不出轮转到下一个人', () => {
      const state = makeTestState({ phase: 'playing', currentTurn: 0, passCount: 0 });
      const action: GameAction = { type: 'pass', playerIndex: 0, timestamp: 0 };
      const next = reducer(state, action);

      expect(next.currentTurn).toBe(1);
      expect(next.passCount).toBe(1);
    });
  });

  describe('未知 action', () => {
    it('应该原样返回 state', () => {
      const state = makeTestState();
      const action: GameAction = { type: 'unknown_action', playerIndex: 0, timestamp: 0 };
      const next = reducer(state, action);

      expect(next).toBe(state);
    });
  });
});
