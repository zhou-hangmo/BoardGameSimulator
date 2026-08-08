// ============================================================
// BoardGameSimulator — L3 进程内执行器（Node/无 Worker 环境）
// 与 l3.worker.ts 同协议：init(code) 注册 hooks/functions，
// hook/query 同步调用（服务端本地可信代码，不做沙箱隔离）
// ============================================================

interface L3CallArgs {
  type: 'hook' | 'query';
  name: string;
  state: unknown;
  args: unknown[];
}

export class L3Inline {
  private hooks = new Map<string, Array<(...args: unknown[]) => void>>();
  private functions = new Map<string, (...args: unknown[]) => unknown>();

  constructor(l3Code: string) {
    const gameAPI = {
      on: (event: string, callback: (...args: unknown[]) => void): void => {
        const list = this.hooks.get(event) ?? [];
        list.push(callback);
        this.hooks.set(event, list);
      },
      off: (event: string, callback: (...args: unknown[]) => void): void => {
        const list = this.hooks.get(event);
        if (list) this.hooks.set(event, list.filter(cb => cb !== callback));
      },
    };
    const registerFunction = (name: string, fn: (...args: unknown[]) => unknown): void => {
      this.functions.set(name, fn);
    };
    const fn = new Function('game', 'registerFunction', l3Code);
    fn(gameAPI, registerFunction);
  }

  async call(type: 'hook' | 'query', name: string, state: unknown, args: unknown[]): Promise<unknown> {
    if (type === 'hook') {
      const list = this.hooks.get(name);
      if (list) {
        for (const cb of list) cb(state, ...args);
      }
      return undefined;
    }
    const fn = this.functions.get(name);
    if (!fn) {
      throw new Error(`未注册的L3函数: ${name}`);
    }
    return fn(state, ...args);
  }
}

export type L3Call = (req: L3CallArgs) => Promise<unknown>;
