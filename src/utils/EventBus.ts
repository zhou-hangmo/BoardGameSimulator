// ============================================================
// BoardGameSimulator — 全局事件总线（发布/订阅模式）
// ============================================================

type EventHandler = {
  fn: (...args: any[]) => void;
  ctx?: any;
};

class EventBus {
  #events = new Map<string, EventHandler[]>();

  /** 订阅事件 */
  on(name: string, fn: (...args: any[]) => void, ctx?: any): void {
    if (!this.#events.has(name)) {
      this.#events.set(name, []);
    }
    const list = this.#events.get(name)!;
    if (!list.some(e => e.fn === fn && e.ctx === ctx)) {
      list.push({ fn, ctx });
    }
  }

  /** 订阅事件（仅触发一次） */
  once(name: string, fn: (...args: any[]) => void, ctx?: any): void {
    const wrapper = (...args: any[]) => {
      this.off(name, wrapper);
      fn.apply(ctx, args);
    };
    this.on(name, wrapper, ctx);
  }

  /** 取消订阅 */
  off(name: string, fn: (...args: any[]) => void): void {
    const list = this.#events.get(name);
    if (list) {
      this.#events.set(name, list.filter(e => e.fn !== fn));
    }
  }

  /** 发布事件 */
  emit(name: string, ...args: any[]): void {
    this.#events.get(name)?.forEach(e => {
      e.fn.apply(e.ctx, args);
    });
  }

  /** 清空所有事件 */
  clear(): void {
    this.#events.clear();
  }
}

export const bus = new EventBus();
