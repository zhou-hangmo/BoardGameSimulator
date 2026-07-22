// ============================================================
// BoardGameSimulator — L3 脚本沙箱 Worker
// ============================================================

// Worker 全局作用域（无 DOM、无 localStorage、无 fetch（通过CSP阻断））

interface WorkerInitMessage {
  type: 'init';
  code: string;
}

interface WorkerRequestMessage {
  id: number;
  type: 'hook' | 'query';
  name: string;
  state: unknown;
  args: unknown[];
}

type WorkerInMessage = WorkerInitMessage | WorkerRequestMessage;

// ---------- 受限的 L3 API ----------

const hooks = new Map<string, Array<(...args: unknown[]) => void>>();
const functions = new Map<string, (...args: unknown[]) => unknown>();

// L3 脚本中可用的受限 API
const gameAPI = {
  on(event: string, callback: (...args: unknown[]) => void): void {
    const list = hooks.get(event) ?? [];
    list.push(callback);
    hooks.set(event, list);
  },

  off(event: string, callback: (...args: unknown[]) => void): void {
    const list = hooks.get(event);
    if (list) {
      hooks.set(event, list.filter(cb => cb !== callback));
    }
  },
};

// L3 脚本中注册同步函数的 API
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function registerFunction(name: string, fn: (...args: any[]) => any): void {
  functions.set(name, fn);
}

// ---------- 消息处理 ----------

self.onmessage = (e: MessageEvent<WorkerInMessage>) => {
  const msg = e.data;

  if (msg.type === 'init') {
    try {
      // 在受限作用域中执行 L3 脚本
      const fn = new Function('game', 'registerFunction', msg.code);
      fn(gameAPI, registerFunction);
      self.postMessage({ id: 0, result: 'ok' });
    } catch (err) {
      self.postMessage({ id: 0, error: `L3 脚本语法错误: ${(err as Error).message}` });
    }
    return;
  }

  // 运行时调用
  const { id, type, name, state, args } = msg;

  try {
    if (type === 'hook') {
      const list = hooks.get(name);
      if (list) {
        for (const cb of list) {
          cb(state, ...args);
        }
      }
      self.postMessage({ id, result: undefined });
    } else if (type === 'query') {
      const fn = functions.get(name);
      if (fn) {
        const result = fn(state, ...args);
        self.postMessage({ id, result });
      } else {
        self.postMessage({ id, error: `未注册的L3函数: ${name}` });
      }
    }
  } catch (err) {
    self.postMessage({ id, error: `L3执行错误: ${(err as Error).message}` });
  }
};
