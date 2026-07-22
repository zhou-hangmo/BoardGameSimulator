// ============================================================
// BoardGameSimulator — 注册表系统
// ============================================================

import type { GameState, ActionContext, UILayout } from './types';

// ---------- Action Registry ----------
export interface IActionHandler {
  execute(state: GameState, params: unknown, context: ActionContext): GameState;
  validate?(state: GameState, params: unknown, context: ActionContext): boolean;
}

class ActionRegistryImpl {
  private handlers = new Map<string, IActionHandler>();

  set(name: string, handler: IActionHandler): void {
    if (this.handlers.has(name)) {
      console.warn(`[ActionRegistry] 覆盖已有动作: ${name}`);
    }
    this.handlers.set(name, handler);
  }

  get(name: string): IActionHandler | undefined {
    return this.handlers.get(name);
  }

  has(name: string): boolean {
    return this.handlers.has(name);
  }

  keys(): string[] {
    return Array.from(this.handlers.keys());
  }
}

// ---------- Condition Registry ----------
export interface IConditionHandler {
  check(state: GameState, params: unknown, context: ActionContext): boolean;
}

class ConditionRegistryImpl {
  private handlers = new Map<string, IConditionHandler>();

  set(name: string, handler: IConditionHandler): void {
    this.handlers.set(name, handler);
  }

  get(name: string): IConditionHandler | undefined {
    return this.handlers.get(name);
  }

  has(name: string): boolean {
    return this.handlers.has(name);
  }

  check(name: string, state: GameState, params: unknown, context: ActionContext): boolean {
    const handler = this.handlers.get(name);
    if (!handler) {
      console.warn(`[ConditionRegistry] 未找到条件: ${name}`);
      return false;
    }
    return handler.check(state, params, context);
  }
}

// ---------- Component Registry ----------
export interface UIComponent {
  render(data: unknown, dispatch: (action: string, payload: unknown) => void): HTMLElement;
  update?(element: HTMLElement, newData: unknown): void;
}

class ComponentRegistryImpl {
  private components = new Map<string, UIComponent>();

  set(name: string, component: UIComponent): void {
    this.components.set(name, component);
  }

  get(name: string): UIComponent | undefined {
    return this.components.get(name);
  }

  has(name: string): boolean {
    return this.components.has(name);
  }

  renderLayout(
    layout: UILayout,
    data: Record<string, unknown>,
    dispatch: (action: string, payload: unknown) => void
  ): Record<string, HTMLElement> {
    const rendered: Record<string, HTMLElement> = {};
    for (const [slotName, config] of Object.entries(layout.slots)) {
      const comp = this.components.get(config.component);
      if (!comp) {
        console.warn(`[ComponentRegistry] 未找到组件: ${config.component} (slot: ${slotName})`);
        continue;
      }
      const slotData = data[slotName] ?? {};
      rendered[slotName] = comp.render(slotData, dispatch);
    }
    return rendered;
  }
}

// ---------- Function Registry（L3同步查询） ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type IL3Function = (state: GameState, ...args: any[]) => any;

class FunctionRegistryImpl {
  private functions = new Map<string, IL3Function>();

  set(name: string, fn: IL3Function): void {
    this.functions.set(name, fn);
  }

  get(name: string): IL3Function | undefined {
    return this.functions.get(name);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  call(name: string, state: GameState, ...args: any[]): any {
    const fn = this.functions.get(name);
    if (!fn) {
      console.warn(`[FunctionRegistry] 未找到函数: ${name}`);
      return undefined;
    }
    return fn(state, ...args);
  }
}

// ---------- 全局单例导出 ----------
export const ActionRegistry = new ActionRegistryImpl();
export const ConditionRegistry = new ConditionRegistryImpl();
export const ComponentRegistry = new ComponentRegistryImpl();
export const FunctionRegistry = new FunctionRegistryImpl();
