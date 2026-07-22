// ============================================================
// 单元测试 — Registry 注册表
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ActionRegistry, ConditionRegistry, ComponentRegistry, FunctionRegistry,
} from '../../core/registry';
import type { GameState } from '../../core/types';

// 每个测试前清空注册表（因为它们是全局单例）
beforeEach(() => {
  // 清空操作——直接访问内部Map
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ActionRegistry as any).handlers.clear();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ConditionRegistry as any).handlers.clear();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ComponentRegistry as any).components.clear();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (FunctionRegistry as any).functions.clear();
});

describe('ActionRegistry', () => {
  it('set 后 get 可以取出', () => {
    const handler = {
      execute: (state: GameState) => state,
    };
    ActionRegistry.set('draw_card', handler);
    expect(ActionRegistry.get('draw_card')).toBe(handler);
  });

  it('has 检查是否存在', () => {
    expect(ActionRegistry.has('draw_card')).toBe(false);
    ActionRegistry.set('draw_card', { execute: (s: GameState) => s });
    expect(ActionRegistry.has('draw_card')).toBe(true);
  });

  it('keys 返回所有注册的动作名', () => {
    ActionRegistry.set('a', { execute: (s: GameState) => s });
    ActionRegistry.set('b', { execute: (s: GameState) => s });
    expect(ActionRegistry.keys()).toEqual(expect.arrayContaining(['a', 'b']));
  });
});

describe('ConditionRegistry', () => {
  it('check 返回条件判断结果', () => {
    const mockState = {} as GameState;
    ConditionRegistry.set('is_landlord', {
      check: (_s, params) => (params as { idx: number }).idx === 0,
    });
    expect(ConditionRegistry.check('is_landlord', mockState, { idx: 0 }, { trigger: '', playerIndex: 0 })).toBe(true);
    expect(ConditionRegistry.check('is_landlord', mockState, { idx: 1 }, { trigger: '', playerIndex: 0 })).toBe(false);
  });

  it('不存在的条件返回 false', () => {
    expect(ConditionRegistry.check('nonexistent', {} as GameState, null, { trigger: '', playerIndex: 0 })).toBe(false);
  });
});

describe('ComponentRegistry', () => {
  it('renderLayout 渲染所有插槽', () => {
    ComponentRegistry.set('info_bar', {
      render: (data, _dispatch) => {
        const el = document.createElement('div');
        el.textContent = `info: ${(data as { text: string }).text}`;
        return el;
      },
    });
    ComponentRegistry.set('hand_area', {
      render: (_data, _dispatch) => {
        const el = document.createElement('div');
        el.textContent = 'hand';
        return el;
      },
    });

    const layout = {
      slots: {
        top_bar: { component: 'info_bar', params: { style: 'compact' } },
        bottom_bar: { component: 'hand_area' },
      },
      presetSlots: ['top_bar', 'main_area', 'bottom_bar'],
    };

    const result = ComponentRegistry.renderLayout(layout, {
      top_bar: { text: 'Hello' },
    }, () => {});

    expect(result.top_bar).toBeDefined();
    expect(result.bottom_bar).toBeDefined();
    expect(result.top_bar.textContent).toBe('info: Hello');
    expect(result.bottom_bar.textContent).toBe('hand');
  });
});

describe('FunctionRegistry', () => {
  it('call 调用注册的函数', () => {
    FunctionRegistry.set('add', (_s, a: number, b: number) => a + b);
    const result = FunctionRegistry.call('add', {} as GameState, 1, 2);
    expect(result).toBe(3);
  });

  it('不存在的函数返回 undefined', () => {
    const result = FunctionRegistry.call('nonexistent', {} as GameState);
    expect(result).toBeUndefined();
  });
});
