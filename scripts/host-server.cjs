"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// scripts/host-server.ts
var import_http = require("http");
var import_fs = require("fs");
var import_path = __toESM(require("path"), 1);
var import_ws = require("ws");

// src/core/registry.ts
var ActionRegistryImpl = class {
  constructor() {
    this.handlers = /* @__PURE__ */ new Map();
  }
  set(name, handler) {
    if (this.handlers.has(name)) {
      console.warn(`[ActionRegistry] \u8986\u76D6\u5DF2\u6709\u52A8\u4F5C: ${name}`);
    }
    this.handlers.set(name, handler);
  }
  get(name) {
    return this.handlers.get(name);
  }
  has(name) {
    return this.handlers.has(name);
  }
  keys() {
    return Array.from(this.handlers.keys());
  }
};
var ConditionRegistryImpl = class {
  constructor() {
    this.handlers = /* @__PURE__ */ new Map();
  }
  set(name, handler) {
    this.handlers.set(name, handler);
  }
  get(name) {
    return this.handlers.get(name);
  }
  has(name) {
    return this.handlers.has(name);
  }
  check(name, state, params, context) {
    const handler = this.handlers.get(name);
    if (!handler) {
      console.warn(`[ConditionRegistry] \u672A\u627E\u5230\u6761\u4EF6: ${name}`);
      return false;
    }
    return handler.check(state, params, context);
  }
};
var ComponentRegistryImpl = class {
  constructor() {
    this.components = /* @__PURE__ */ new Map();
  }
  set(name, component) {
    this.components.set(name, component);
  }
  get(name) {
    return this.components.get(name);
  }
  has(name) {
    return this.components.has(name);
  }
  renderLayout(layout, data, dispatch) {
    const rendered = {};
    for (const [slotName, config] of Object.entries(layout.slots)) {
      const comp = this.components.get(config.component);
      if (!comp) {
        console.warn(`[ComponentRegistry] \u672A\u627E\u5230\u7EC4\u4EF6: ${config.component} (slot: ${slotName})`);
        continue;
      }
      const slotData = data[slotName] ?? {};
      rendered[slotName] = comp.render(slotData, dispatch);
    }
    return rendered;
  }
};
var FunctionRegistryImpl = class {
  constructor() {
    this.functions = /* @__PURE__ */ new Map();
  }
  set(name, fn) {
    this.functions.set(name, fn);
  }
  get(name) {
    return this.functions.get(name);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  call(name, state, ...args) {
    const fn = this.functions.get(name);
    if (!fn) {
      console.warn(`[FunctionRegistry] \u672A\u627E\u5230\u51FD\u6570: ${name}`);
      return void 0;
    }
    return fn(state, ...args);
  }
};
var ActionRegistry = new ActionRegistryImpl();
var ConditionRegistry = new ConditionRegistryImpl();
var ComponentRegistry = new ComponentRegistryImpl();
var FunctionRegistry = new FunctionRegistryImpl();

// src/games/battleship/rules.ts
var BATTLE_SHIPS = [
  { id: "ship_carrier", size: 5 },
  { id: "ship_battleship", size: 4 },
  { id: "ship_cruiser", size: 3 },
  { id: "ship_submarine", size: 3 },
  { id: "ship_patrol", size: 2 }
];
var COLS = "ABCDEFGHIJ";
var SIZE = 10;
function parseCell(cell) {
  const m = /^([A-J])(10|[1-9])$/.exec(cell);
  if (!m) return null;
  return { r: m[2] === "10" ? 9 : Number(m[2]) - 1, c: COLS.indexOf(m[1]) };
}
function cellAt(r, c) {
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;
  return COLS[c] + (r + 1);
}
function initBoards(count) {
  return {
    stage: "placement",
    boards: Array.from({ length: count }, () => ({
      placed: false,
      confirmed: false,
      ships: BATTLE_SHIPS.map((s) => ({ id: s.id, size: s.size, cells: [], hits: 0, sunk: false })),
      shots: {}
    }))
  };
}
function isValidShape(cells) {
  if (cells.length === 0) return false;
  const pts = cells.map(parseCell);
  if (pts.some((p) => !p)) return false;
  const list = pts;
  if (new Set(cells).size !== cells.length) return false;
  const rows = list.map((p) => p.r);
  const cols = list.map((p) => p.c);
  const vertical = rows.every((r) => r === rows[0]);
  const horizontal = cols.every((c) => c === cols[0]);
  if (!vertical && !horizontal) return false;
  const line = (vertical ? cols : rows).slice().sort((a, b) => a - b);
  for (let i = 1; i < line.length; i++) {
    if (line[i] !== line[i - 1] + 1) return false;
  }
  return true;
}
function placeShip(extra, playerIndex, shipId, cells) {
  if (extra.stage !== "placement") return { ok: false, error: "\u5F53\u524D\u4E0D\u5728\u5E03\u9635\u9636\u6BB5" };
  const board = extra.boards[playerIndex];
  if (!board) return { ok: false, error: "\u68CB\u76D8\u672A\u521D\u59CB\u5316" };
  const ship = board.ships.find((s) => s.id === shipId);
  if (!ship) return { ok: false, error: `\u672A\u77E5\u8230\u8239: ${shipId}` };
  if (cells.length !== ship.size) return { ok: false, error: `\u957F\u5EA6\u4E0D\u7B26: \u9700\u8981 ${ship.size} \u683C` };
  if (!isValidShape(cells)) return { ok: false, error: "\u5FC5\u987B\u6A2A/\u7AD6\u4E00\u6761\u76F4\u7EBF\u4E14\u8FDE\u7EED" };
  const otherCells = new Set(
    board.ships.filter((s) => s.id !== shipId).flatMap((s) => s.cells)
  );
  if (cells.some((c) => otherCells.has(c))) return { ok: false, error: "\u4E0E\u5DF2\u6709\u8230\u8239\u91CD\u53E0" };
  const newBoard = {
    ...board,
    confirmed: false,
    // 改船后需重新确认
    ships: board.ships.map((s) => s.id === shipId ? { ...s, cells } : s)
  };
  newBoard.placed = newBoard.ships.every((s) => s.cells.length > 0);
  const boards = extra.boards.map((b, i) => i === playerIndex ? newBoard : b);
  return { ok: true, extra: { ...extra, boards } };
}
function removeShip(extra, playerIndex, shipId) {
  if (extra.stage !== "placement") return { ok: false, error: "\u5F53\u524D\u4E0D\u5728\u5E03\u9635\u9636\u6BB5" };
  const board = extra.boards[playerIndex];
  if (!board) return { ok: false, error: "\u68CB\u76D8\u672A\u521D\u59CB\u5316" };
  const ship = board.ships.find((s) => s.id === shipId);
  if (!ship) return { ok: false, error: `\u672A\u77E5\u8230\u8239: ${shipId}` };
  if (ship.cells.length === 0) return { ok: false, error: "\u8BE5\u8230\u672A\u90E8\u7F72" };
  const newBoard = {
    ...board,
    confirmed: false,
    // 移除舰船后需重新确认
    ships: board.ships.map((s) => s.id === shipId ? { ...s, cells: [], hits: 0, sunk: false } : s)
  };
  newBoard.placed = newBoard.ships.every((s) => s.cells.length > 0);
  const boards = extra.boards.map((b, i) => i === playerIndex ? newBoard : b);
  return { ok: true, extra: { ...extra, boards } };
}
function randomCells(size) {
  const horizontal = Math.random() < 0.5;
  const r = Math.floor(Math.random() * SIZE);
  const c = Math.floor(Math.random() * SIZE);
  if (horizontal) {
    const c0 = Math.min(c, SIZE - size);
    return Array.from({ length: size }, (_, i) => cellAt(r, c0 + i));
  }
  const r0 = Math.min(r, SIZE - size);
  return Array.from({ length: size }, (_, i) => cellAt(r0 + i, c));
}
function randomPlace(extra, playerIndex) {
  if (extra.stage !== "placement") return { ok: false, error: "\u5F53\u524D\u4E0D\u5728\u5E03\u9635\u9636\u6BB5" };
  const board = extra.boards[playerIndex];
  if (!board) return { ok: false, error: "\u68CB\u76D8\u672A\u521D\u59CB\u5316" };
  if (board.placed && board.confirmed) return { ok: false, error: "\u8BE5\u73A9\u5BB6\u5DF2\u786E\u8BA4\u5E03\u9635" };
  for (let attempt = 0; attempt < 2e3; attempt++) {
    const ships = board.ships.map((s) => ({ ...s, cells: [] }));
    const used = /* @__PURE__ */ new Set();
    let success = true;
    for (const ship of ships) {
      const cells = randomCells(ship.size);
      if (cells.some((c) => used.has(c)) || !isValidShape(cells)) {
        success = false;
        break;
      }
      ship.cells = cells;
      cells.forEach((c) => used.add(c));
    }
    if (!success) continue;
    const newBoard = { ...board, placed: true, confirmed: false, ships };
    const boards = extra.boards.map((b, i) => i === playerIndex ? newBoard : b);
    return { ok: true, extra: { ...extra, boards } };
  }
  return { ok: false, error: "\u968F\u673A\u5E03\u9635\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5" };
}
function confirmBoard(extra, playerIndex) {
  if (extra.stage !== "placement") return { ok: false, error: "\u5F53\u524D\u4E0D\u5728\u5E03\u9635\u9636\u6BB5" };
  const board = extra.boards[playerIndex];
  if (!board) return { ok: false, error: "\u68CB\u76D8\u672A\u521D\u59CB\u5316" };
  if (!board.placed) return { ok: false, error: "\u8BF7\u5148\u90E8\u7F72\u5168\u90E8\u8230\u8239" };
  if (board.confirmed) return { ok: false, error: "\u5DF2\u786E\u8BA4\u5E03\u9635" };
  const boards = extra.boards.map((b, i) => i === playerIndex ? { ...b, confirmed: true } : b);
  const allConfirmed = boards.every((b) => b.confirmed);
  return { ok: true, extra: { ...extra, stage: allConfirmed ? "battle" : "placement", boards } };
}
function fire(extra, playerIndex, cell) {
  if (extra.stage !== "battle") return { ok: false, error: "\u5F53\u524D\u4E0D\u5728\u6218\u6597\u9636\u6BB5" };
  const board = extra.boards[playerIndex];
  const target = extra.boards[playerIndex ^ 1];
  if (!board || !target) return { ok: false, error: "\u68CB\u76D8\u672A\u521D\u59CB\u5316" };
  if (!parseCell(cell)) return { ok: false, error: "\u975E\u6CD5\u5750\u6807" };
  if (board.shots[cell]) return { ok: false, error: "\u8BE5\u683C\u5DF2\u5F00\u706B" };
  const shots = { ...board.shots };
  const hitShip = target.ships.find((s) => s.cells.includes(cell));
  if (!hitShip) {
    shots[cell] = "miss";
    const boards2 = extra.boards.map((b, i) => i === playerIndex ? { ...b, shots } : b);
    return {
      ok: true,
      extra: { ...extra, boards: boards2 },
      result: { cell, result: "miss", sunk: null, winner: null }
    };
  }
  const hits = hitShip.hits + 1;
  const sunk = hits === hitShip.size;
  shots[cell] = sunk ? "sunk" : "hit";
  const targetShips = target.ships.map(
    (s) => s.id === hitShip.id ? { ...s, hits, sunk } : s
  );
  const boards = extra.boards.map(
    (b, i) => i === playerIndex ? { ...b, shots } : i === (playerIndex ^ 1) ? { ...b, ships: targetShips } : b
  );
  const allSunk = targetShips.every((s) => s.sunk);
  return {
    ok: true,
    extra: { ...extra, boards },
    result: {
      cell,
      result: sunk ? "sunk" : "hit",
      sunk: sunk ? hitShip.id : null,
      winner: allSunk ? playerIndex : null
    }
  };
}

// src/core/reducer.ts
function reducer(state, action) {
  switch (action.type) {
    case "start_game":
      return handleStartGame(state, action);
    case "call_landlord":
      return handleCallLandlord(state, action);
    case "play_cards":
      return handlePlayCards(state, action);
    case "pass":
      return handlePass(state, action);
    case "battleship_place":
      return handleBattleshipPlace(state, action);
    case "battleship_random":
      return handleBattleshipRandom(state, action);
    case "battleship_remove":
      return handleBattleshipRemove(state, action);
    case "battleship_confirm":
      return handleBattleshipConfirm(state, action);
    case "battleship_fire":
      return handleBattleshipFire(state, action);
    default:
      return state;
  }
}
function handleStartGame(state, _action) {
  if (state.phase !== "idle") return state;
  return {
    ...state,
    version: state.version + 1,
    phase: "calling",
    currentTurn: 0
  };
}
function handleCallLandlord(state, action) {
  if (state.phase !== "calling") return state;
  const call = action.payload?.call;
  if (!call) {
    const nextTurn = (state.currentTurn + 1) % state.players.length;
    if (nextTurn === 0) {
      return { ...state, version: state.version + 1, phase: "ended", winner: -1, currentTurn: 0 };
    }
    return { ...state, version: state.version + 1, currentTurn: nextTurn };
  }
  return {
    ...state,
    version: state.version + 1,
    landlordIndex: action.playerIndex,
    phase: "playing",
    currentTurn: action.playerIndex,
    players: state.players.map((p) => {
      if (p.index === action.playerIndex) {
        return { ...p, hand: [...p.hand, ...state.bottomCards], handCount: p.hand.length + state.bottomCards.length };
      }
      return p;
    }),
    bottomCards: [],
    lastPlay: null,
    passCount: 0
  };
}
function handlePlayCards(state, action) {
  if (state.phase !== "playing" || action.playerIndex !== state.currentTurn) return state;
  const cards = action.payload?.cards ?? [];
  const player = state.players[action.playerIndex];
  const playedCards = player.hand.filter((c) => cards.includes(c.id));
  const remainingHand = player.hand.filter((c) => !cards.includes(c.id));
  const newPlayers = state.players.map((p, i) => {
    if (i === action.playerIndex) {
      return { ...p, hand: remainingHand, handCount: remainingHand.length };
    }
    return p;
  });
  if (remainingHand.length === 0) {
    const winner = action.playerIndex === state.landlordIndex ? state.landlordIndex : (state.landlordIndex + 1) % state.players.length;
    return {
      ...state,
      version: state.version + 1,
      players: newPlayers,
      discard: playedCards,
      lastPlay: { playerIndex: action.playerIndex, cards: playedCards, pattern: null },
      phase: "ended",
      winner
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
    passCount: 0
  };
}
function handlePass(state, action) {
  if (state.phase !== "playing" || action.playerIndex !== state.currentTurn) return state;
  const nextTurn = (state.currentTurn + 1) % state.players.length;
  return {
    ...state,
    version: state.version + 1,
    currentTurn: nextTurn,
    passCount: state.passCount + 1
  };
}
function ensureExtra(state) {
  const extra = state.extra;
  if (extra && Array.isArray(extra.boards)) return extra;
  return initBoards(state.players.length || 2);
}
function applyExtra(state, extra) {
  return {
    ...state,
    version: state.version + 1,
    extra,
    phase: extra.stage === "battle" ? "playing" : state.phase
  };
}
function handleBattleshipPlace(state, action) {
  if (state.phase === "ended") return state;
  const payload = action.payload;
  if (!payload || typeof payload.shipId !== "string" || !Array.isArray(payload.cells)) return state;
  const r = placeShip(ensureExtra(state), action.playerIndex, payload.shipId, payload.cells);
  if (!r.ok) return state;
  return applyExtra(state, r.extra);
}
function handleBattleshipRandom(state, action) {
  if (state.phase === "ended") return state;
  const r = randomPlace(ensureExtra(state), action.playerIndex);
  if (!r.ok) return state;
  return applyExtra(state, r.extra);
}
function handleBattleshipRemove(state, action) {
  if (state.phase === "ended") return state;
  const payload = action.payload;
  if (!payload || typeof payload.shipId !== "string") return state;
  const r = removeShip(ensureExtra(state), action.playerIndex, payload.shipId);
  if (!r.ok) return state;
  return applyExtra(state, r.extra);
}
function handleBattleshipConfirm(state, action) {
  if (state.phase === "ended") return state;
  const r = confirmBoard(ensureExtra(state), action.playerIndex);
  if (!r.ok) return state;
  return applyExtra(state, r.extra);
}
function handleBattleshipFire(state, action) {
  const extra = state.extra;
  if (!extra || extra.stage !== "battle") return state;
  if (state.phase !== "playing" || action.playerIndex !== state.currentTurn) return state;
  const payload = action.payload;
  if (!payload || typeof payload.cell !== "string") return state;
  const r = fire(extra, action.playerIndex, payload.cell);
  if (!r.ok) return state;
  const next = { ...state, version: state.version + 1, extra: r.extra };
  const log2 = r.extra.log ?? [];
  next.extra = {
    ...r.extra,
    log: [...log2, { by: action.playerIndex, cell: payload.cell, result: r.result.result, sunk: r.result.sunk }].slice(-100)
  };
  if (r.result.winner !== null) {
    next.phase = "ended";
    next.winner = r.result.winner;
  } else {
    next.currentTurn = (state.currentTurn + 1) % state.players.length;
  }
  return next;
}

// src/core/l3Inline.ts
var L3Inline = class {
  constructor(l3Code) {
    this.hooks = /* @__PURE__ */ new Map();
    this.functions = /* @__PURE__ */ new Map();
    const gameAPI = {
      on: (event, callback) => {
        const list = this.hooks.get(event) ?? [];
        list.push(callback);
        this.hooks.set(event, list);
      },
      off: (event, callback) => {
        const list = this.hooks.get(event);
        if (list) this.hooks.set(event, list.filter((cb) => cb !== callback));
      }
    };
    const registerFunction = (name, fn2) => {
      this.functions.set(name, fn2);
    };
    const fn = new Function("game", "registerFunction", l3Code);
    fn(gameAPI, registerFunction);
  }
  async call(type, name, state, args) {
    if (type === "hook") {
      const list = this.hooks.get(name);
      if (list) {
        for (const cb of list) cb(state, ...args);
      }
      return void 0;
    }
    const fn = this.functions.get(name);
    if (!fn) {
      throw new Error(`\u672A\u6CE8\u518C\u7684L3\u51FD\u6570: ${name}`);
    }
    return fn(state, ...args);
  }
};

// src/core/engine.ts
var import_meta = {};
var GameEngine = class {
  constructor(initialState) {
    this.config = null;
    this.worker = null;
    this.inline = null;
    this.workerReady = false;
    this.pendingCallbacks = /* @__PURE__ */ new Map();
    this.requestId = 0;
    // 串行队列：保证并发 dispatch 按到达顺序逐个执行（L3 worker 基于 this.state 快照，
    // 并发会 lost update——后完成者覆盖先完成者）
    this.dispatchQueue = Promise.resolve();
    this.state = initialState;
  }
  // ========== 配置加载 ==========
  loadGame(config) {
    for (const rule of config.l2?.rules ?? []) {
      for (const action of rule?.actions ?? []) {
        if (!ActionRegistry.has(action.type)) {
          ActionRegistry.set(action.type, {
            execute: (s, _p, _c) => s,
            validate: () => true
          });
        }
      }
      if (rule.condition && !ConditionRegistry.has(rule.condition.type)) {
        ConditionRegistry.set(rule.condition.type, { check: () => true });
      }
    }
    const errors = this.validateConfig(config);
    if (errors.filter((e) => e.level === "error").length > 0) {
      return errors;
    }
    this.config = config;
    if (config.l3) {
      this.initWorker(config.l3);
    }
    return errors;
  }
  validateConfig(config) {
    const errors = [];
    const { l1, l2 } = config;
    if (!l1?.cards || l1.cards.length === 0) {
      errors.push({ level: "error", path: "l1.cards", message: "\u5361\u724C\u5217\u8868\u4E0D\u80FD\u4E3A\u7A7A" });
    }
    if (!l1?.players || l1.players.count < 2) {
      errors.push({ level: "error", path: "l1.players.count", message: "\u81F3\u5C11\u9700\u89812\u540D\u73A9\u5BB6" });
    }
    for (const rule of l2?.rules ?? []) {
      for (const action of rule?.actions ?? []) {
        if (!ActionRegistry.has(action.type)) {
          errors.push({ level: "error", path: `l2.rules.actions.${action.type}`, message: `\u672A\u6CE8\u518C\u7684\u52A8\u4F5C: ${action.type}` });
        }
      }
      if (rule.condition && !ConditionRegistry.has(rule.condition.type)) {
        errors.push({
          level: "warning",
          path: `l2.rules.condition.${rule.condition.type}`,
          message: `\u672A\u6CE8\u518C\u7684\u6761\u4EF6: ${rule.condition.type}`
        });
      }
    }
    return errors;
  }
  // ========== L3 管理（浏览器用 Worker 沙箱，Node 用进程内执行） ==========
  initWorker(l3Code) {
    if (typeof Worker === "undefined") {
      this.inline = new L3Inline(l3Code);
      this.workerReady = true;
      return;
    }
    this.worker = new Worker(new URL("./l3.worker.ts", import_meta.url), { type: "module" });
    this.worker.onmessage = (e) => {
      const { id, result, error } = e.data;
      const cb = this.pendingCallbacks.get(id);
      if (cb) {
        this.pendingCallbacks.delete(id);
        if (error) {
          console.error(`[Engine] L3 Worker \u9519\u8BEF: ${error}`);
        }
        cb(result);
      }
    };
    this.worker.postMessage({ type: "init", code: l3Code });
    this.workerReady = true;
  }
  callWorker(type, name, args) {
    if (!this.workerReady) {
      return Promise.resolve(void 0);
    }
    if (this.inline) {
      return this.inline.call(type, name, this.state, args);
    }
    if (!this.worker) {
      return Promise.resolve(void 0);
    }
    const id = ++this.requestId;
    return new Promise((resolve) => {
      this.pendingCallbacks.set(id, resolve);
      const req = { id, type, name, state: this.state, args };
      this.worker.postMessage(req);
    });
  }
  // 调用 L3 注册的自定义函数（state 会自动作为首个参数传入）
  query(name, ...args) {
    if (!this.workerReady) return Promise.resolve(void 0);
    return this.callWorker("query", name, args);
  }
  // ========== 状态管理 ==========
  getState() {
    return this.state;
  }
  loadState(state) {
    this.state = state;
  }
  async dispatch(action) {
    const run = this.dispatchQueue.then(() => this.dispatchInner(action));
    this.dispatchQueue = run.catch(() => {
    });
    return run;
  }
  async dispatchInner(action) {
    await this.callWorker("hook", "before_action", [action]);
    const prevState = this.state;
    const newState = reducer(prevState, action);
    if (newState === prevState) {
      return {
        code: "INVALID_ACTION",
        message: `\u52A8\u4F5C ${action.type} \u5728\u5F53\u524D\u72B6\u6001\u4E0B\u4E0D\u53EF\u6267\u884C`
      };
    }
    const l3Validate = await this.callWorker("query", "validate_action", [newState, action]);
    if (l3Validate === false) {
      return { code: "L3_VALIDATION_FAILED", message: "L3\u6821\u9A8C\u672A\u901A\u8FC7" };
    }
    this.state = newState;
    await this.callWorker("hook", "after_state_update", [this.state]);
    return null;
  }
  // ========== 玩家视图过滤 ==========
  buildPlayerView(playerIndex) {
    if (!this.config) {
      throw new Error("\u672A\u52A0\u8F7D\u6E38\u620F\u914D\u7F6E");
    }
    const visibility = this.config.l1.visibility;
    const players = this.state.players.map(
      (p) => this.filterPlayerData(p, playerIndex, visibility)
    );
    const publicState = {
      currentTurn: this.state.currentTurn,
      phase: this.state.phase,
      landlordIndex: this.state.landlordIndex,
      lastPlay: this.state.lastPlay,
      passCount: this.state.passCount,
      winner: this.state.winner,
      discard: this.state.discard,
      bottomCards: this.filterField("bottomCards", this.state.bottomCards, playerIndex, visibility)
    };
    return {
      version: this.state.version,
      playerIndex,
      phase: this.state.phase,
      currentTurn: this.state.currentTurn,
      winner: this.state.winner,
      players,
      publicState
    };
  }
  filterPlayerData(player, viewerIndex, visibility) {
    const isOwner = player.index === viewerIndex;
    const rule = visibility["players[*].hand"] ?? { mode: "full", description: "" };
    let hand;
    if (rule.mode === "owner_only") {
      hand = isOwner ? player.hand : { count: player.hand.length };
    } else if (rule.mode === "count") {
      hand = { count: player.hand.length };
    } else if (rule.mode === "hidden") {
      hand = { count: 0 };
    } else {
      hand = player.hand;
    }
    return {
      index: player.index,
      name: player.name,
      hand,
      handCount: player.hand.length,
      isDisconnected: player.isDisconnected,
      extra: player.extra
    };
  }
  filterField(_fieldPath, value, _playerIndex, _visibility) {
    return value;
  }
  // ========== 生命周期 ==========
  startGame(count) {
    if (!this.config) throw new Error("\u672A\u52A0\u8F7D\u6E38\u620F\u914D\u7F6E");
    const l1 = this.config.l1;
    const deck = [...l1.cards];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const total = count ?? l1.players.count;
    const cardsPer = Math.floor(51 / total);
    const players = [];
    for (let i = 0; i < total; i++) {
      players.push({
        index: i,
        name: i === 0 ? "\u4F60" : `\u73A9\u5BB6 ${i + 1}`,
        hand: deck.slice(i * cardsPer, (i + 1) * cardsPer),
        handCount: cardsPer,
        isHost: i === 0,
        isDisconnected: false
      });
    }
    const bottomCards = deck.slice(total * cardsPer, total * cardsPer + 3);
    this.state = { ...this.state, players, deck: [], bottomCards, phase: "calling", currentTurn: 0 };
  }
  destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingCallbacks.clear();
  }
};

// src/games/battleship/config.json
var config_default = {
  meta: {
    name: "\u6D77\u6218\u68CB",
    version: "1.0",
    maxPlayers: 2
  },
  l1: {
    cards: [
      { id: "ship_carrier", name: "\u822A\u7A7A\u6BCD\u8230", suit: "ship", rank: "5", value: 5, extra: { size: 5 } },
      { id: "ship_battleship", name: "\u6218\u5217\u8230", suit: "ship", rank: "4", value: 4, extra: { size: 4 } },
      { id: "ship_cruiser", name: "\u5DE1\u6D0B\u8230", suit: "ship", rank: "3", value: 3, extra: { size: 3 } },
      { id: "ship_submarine", name: "\u6F5C\u8247", suit: "ship", rank: "3", value: 2, extra: { size: 3 } },
      { id: "ship_patrol", name: "\u5DE1\u903B\u8247", suit: "ship", rank: "2", value: 1, extra: { size: 2 } },
      { id: "cell_hit", name: "\u{1F4A5} \u547D\u4E2D", suit: "token", rank: "H", value: 0 },
      { id: "cell_miss", name: "\u{1F4A7} \u672A\u547D\u4E2D", suit: "token", rank: "M", value: 0 },
      { id: "cell_empty", name: "\u{1F30A} \u672A\u77E5", suit: "token", rank: "E", value: 0 }
    ],
    players: {
      count: 2,
      initialResources: {}
    },
    uiLayout: {
      slots: {
        top_bar: { component: "info_area" },
        main_area: { component: "board_area" },
        bottom_bar: { component: "ship_area" }
      },
      presetSlots: ["top_bar", "main_area", "bottom_bar"]
    },
    visibility: {
      "players[*].board": { mode: "owner_only", description: "\u5DF1\u65B9\u68CB\u76D8\u4EC5\u81EA\u5DF1\u53EF\u89C1" },
      "players[*].enemyView": { mode: "owner_only", description: "\u654C\u65B9\u89C6\u91CE\u4EC5\u81EA\u5DF1\u53EF\u89C1" },
      "players[*].ships": { mode: "owner_only", description: "\u8230\u8239\u90E8\u7F72\u4EC5\u81EA\u5DF1\u53EF\u89C1" }
    }
  },
  l2: {
    rules: [
      {
        trigger: "on_game_start",
        actions: [{ type: "enter_placement" }]
      },
      {
        trigger: "on_placement_complete",
        actions: [{ type: "enter_battle" }]
      },
      {
        trigger: "on_turn_start",
        actions: [{ type: "wait_for_shot" }]
      },
      {
        trigger: "on_shot_fired",
        actions: [
          { type: "check_hit" },
          { type: "check_sunk" },
          { type: "check_win" },
          { type: "next_turn" }
        ]
      },
      {
        trigger: "on_all_sunk",
        actions: [{ type: "declare_winner" }]
      }
    ]
  },
  l3: null
};

// src/games/battleship/l3.ts
var l3Script = `
// ---------- \u5E38\u91CF ----------
var COLS = 'ABCDEFGHIJ';

function parseCell(cell) {
  if (typeof cell !== 'string') return null;
  var m = /^([A-J])(10|[1-9])$/.exec(cell);
  if (!m) return null;
  return { r: m[2] === '10' ? 9 : Number(m[2]) - 1, c: COLS.indexOf(m[1]) };
}

function boardOf(state, idx) {
  var extra = state && state.extra;
  return extra && Array.isArray(extra.boards) ? extra.boards[idx] : null;
}

function shipOf(board, shipId) {
  return board.ships.find(function (s) { return s.id === shipId; });
}

function validShape(cells) {
  if (!cells || cells.length === 0) return false;
  var pts = cells.map(parseCell);
  if (pts.some(function (p) { return !p; })) return false;
  if (new Set(cells).size !== cells.length) return false;
  var rows = pts.map(function (p) { return p.r; });
  var cols = pts.map(function (p) { return p.c; });
  var vertical = rows.every(function (r) { return r === rows[0]; });
  var horizontal = cols.every(function (c) { return c === cols[0]; });
  if (!vertical && !horizontal) return false;
  var line = (vertical ? cols : rows).slice().sort(function (a, b) { return a - b; });
  for (var i = 1; i < line.length; i++) {
    if (line[i] !== line[i - 1] + 1) return false;
  }
  return true;
}

// ---------- \u5E03\u9635\u6821\u9A8C ----------

function placeShip(state, playerIndex, shipId, cells) {
  var extra = state.extra;
  if (!extra || extra.stage !== 'placement') return { ok: false, error: '\u5F53\u524D\u4E0D\u5728\u5E03\u9635\u9636\u6BB5' };
  var board = boardOf(state, playerIndex);
  if (!board) return { ok: false, error: '\u68CB\u76D8\u672A\u521D\u59CB\u5316' };
  var ship = shipOf(board, shipId);
  if (!ship) return { ok: false, error: '\u672A\u77E5\u8230\u8239' };
  if (!cells || cells.length !== ship.size) return { ok: false, error: '\u957F\u5EA6\u4E0D\u7B26' };
  if (!validShape(cells)) return { ok: false, error: '\u5FC5\u987B\u6A2A/\u7AD6\u4E00\u6761\u76F4\u7EBF\u4E14\u8FDE\u7EED' };
  var selfCells = ship.cells || [];
  var otherCells = board.ships
    .filter(function (s) { return s.id !== shipId; })
    .reduce(function (acc, s) { return acc.concat(s.cells); }, []);
  var conflict = cells.some(function (c) { return otherCells.indexOf(c) >= 0; });
  if (conflict) return { ok: false, error: '\u4E0E\u5DF2\u6709\u8230\u8239\u91CD\u53E0' };
  return { ok: true };
}

function removeShip(state, playerIndex, shipId) {
  var extra = state.extra;
  if (!extra || extra.stage !== 'placement') return { ok: false, error: '\u5F53\u524D\u4E0D\u5728\u5E03\u9635\u9636\u6BB5' };
  var board = boardOf(state, playerIndex);
  if (!board) return { ok: false, error: '\u68CB\u76D8\u672A\u521D\u59CB\u5316' };
  var ship = shipOf(board, shipId);
  if (!ship) return { ok: false, error: '\u672A\u77E5\u8230\u8239' };
  if (!ship.cells || ship.cells.length === 0) return { ok: false, error: '\u8BE5\u8230\u672A\u90E8\u7F72' };
  return { ok: true };
}

function randomPlace(state, playerIndex) {
  var extra = state.extra;
  if (!extra || extra.stage !== 'placement') return { ok: false, error: '\u5F53\u524D\u4E0D\u5728\u5E03\u9635\u9636\u6BB5' };
  var board = boardOf(state, playerIndex);
  if (!board) return { ok: false, error: '\u68CB\u76D8\u672A\u521D\u59CB\u5316' };
  if (board.placed && board.confirmed) return { ok: false, error: '\u8BE5\u73A9\u5BB6\u5DF2\u786E\u8BA4\u5E03\u9635' };
  return { ok: true };
}

function confirmBoard(state, playerIndex) {
  var extra = state.extra;
  if (!extra || extra.stage !== 'placement') return { ok: false, error: '\u5F53\u524D\u4E0D\u5728\u5E03\u9635\u9636\u6BB5' };
  var board = boardOf(state, playerIndex);
  if (!board) return { ok: false, error: '\u68CB\u76D8\u672A\u521D\u59CB\u5316' };
  if (!board.placed) return { ok: false, error: '\u8BF7\u5148\u90E8\u7F72\u5168\u90E8\u8230\u8239' };
  if (board.confirmed) return { ok: false, error: '\u5DF2\u786E\u8BA4\u5E03\u9635' };
  return { ok: true };
}

// ---------- \u5F00\u706B\u6821\u9A8C ----------

function fire(state, playerIndex, cell) {
  var extra = state.extra;
  if (!extra || extra.stage !== 'battle') return { ok: false, error: '\u5F53\u524D\u4E0D\u5728\u6218\u6597\u9636\u6BB5' };
  if (playerIndex !== state.currentTurn) return { ok: false, error: '\u672A\u8F6E\u5230\u4F60' };
  var board = boardOf(state, playerIndex);
  if (!board) return { ok: false, error: '\u68CB\u76D8\u672A\u521D\u59CB\u5316' };
  if (!parseCell(cell)) return { ok: false, error: '\u975E\u6CD5\u5750\u6807' };
  if (board.shots[cell]) return { ok: false, error: '\u8BE5\u683C\u5DF2\u5F00\u706B' };
  return { ok: true };
}

// ---------- \u5F15\u64CE\u81EA\u52A8\u8C03\u7528\u7684\u52A8\u4F5C\u6821\u9A8C ----------

function validateAction(oldState, _newState, action) {
  if (!action || typeof action !== 'object') return false;
  switch (action.type) {
    case 'start_game':
      return oldState.phase === 'idle';
    case 'battleship_place': {
      var p = action.payload || {};
      return placeShip(oldState, action.playerIndex, p.shipId, p.cells).ok;
    }
    case 'battleship_random':
      return randomPlace(oldState, action.playerIndex).ok;
    case 'battleship_remove': {
      var p = action.payload || {};
      return removeShip(oldState, action.playerIndex, p.shipId).ok;
    }
    case 'battleship_confirm':
      return confirmBoard(oldState, action.playerIndex).ok;
    case 'battleship_fire': {
      var p = action.payload || {};
      return fire(oldState, action.playerIndex, p.cell).ok;
    }
    default:
      return true;
  }
}

// ---------- \u94A9\u5B50 ----------

game.on('before_action', function (state, action) {
  console.log('[L3] before_action: ' + action.type + ' by ' + action.playerIndex);
});

game.on('after_state_update', function (state) {
  var stage = state.extra ? state.extra.stage : '?';
  console.log('[L3] after_state_update: phase=' + state.phase + ' turn=' + state.currentTurn + ' stage=' + stage);
});

// ---------- \u6CE8\u518C ----------

registerFunction('validate_action', validateAction);
registerFunction('place_ship', placeShip);
registerFunction('random_place', randomPlace);
registerFunction('remove_ship', removeShip);
registerFunction('confirm_board', confirmBoard);
registerFunction('fire', fire);
`;

// src/games/battleship/test.ts
var battleshipTest = {
  id: "battleship",
  name: "\u6D77\u6218\u68CB",
  config: { ...config_default, l3: l3Script }
};

// src/games/battleship/view.ts
function stripShips(board) {
  return {
    placed: board.placed,
    confirmed: board.confirmed,
    shots: board.shots,
    ships: board.ships.map((s) => ({ id: s.id, size: s.size, hits: s.hits, sunk: s.sunk, cells: [] }))
  };
}
function filterExtra(extra, viewerIndex) {
  return {
    stage: extra.stage,
    log: extra.log ?? [],
    boards: extra.boards.map((b, i) => i === viewerIndex ? b : stripShips(b))
  };
}

// scripts/host-server.ts
var PORT = parseInt(process.argv[2] || "8787", 10);
var DOCS = import_path.default.join(__dirname, "..", "docs");
var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json"
};
var s0 = {
  version: 0,
  players: [],
  deck: [],
  discard: [],
  bottomCards: [],
  landlordIndex: -1,
  currentTurn: 0,
  phase: "idle",
  lastPlay: null,
  passCount: 0,
  winner: null
};
var engine = null;
var clients = /* @__PURE__ */ new Map();
function log(msg) {
  console.log(`[${(/* @__PURE__ */ new Date()).toISOString()}] ${msg}`);
}
function broadcastState() {
  if (!engine) return;
  const state = engine.getState();
  for (const [ws, idx] of clients) {
    const v = engine.buildPlayerView(idx);
    const ex = state.extra;
    if (ex && Array.isArray(ex.boards)) v.extra = filterExtra(ex, idx);
    send(ws, { type: "state", payload: v });
  }
}
function send(ws, msg) {
  if (ws.readyState === import_ws.WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
function startGame() {
  const config = battleshipTest.config;
  if (!config) {
    log("\u914D\u7F6E\u7F3A\u5931");
    return;
  }
  engine = new GameEngine(s0);
  const errs = engine.loadGame(config);
  if (errs.filter((e) => e.level === "error").length > 0) {
    log(`\u914D\u7F6E\u9519\u8BEF: ${errs.map((e) => e.message).join("; ")}`);
    return;
  }
  engine.startGame(2);
  const s = engine.getState();
  engine.loadState({ ...s, extra: initBoards(2), phase: "idle" });
  log("\u6EE1\u5458 2/2\uFF0C\u5F00\u5C40\uFF08\u5E03\u9635\u9636\u6BB5\uFF09");
  broadcastState();
}
var server = (0, import_http.createServer)(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    urlPath = urlPath.replace(/^\/BoardGameSimulator/, "");
    if (urlPath === "/") urlPath = "/index.html";
    const file = import_path.default.normalize(import_path.default.join(DOCS, urlPath));
    if (!file.startsWith(DOCS)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    const data = await import_fs.promises.readFile(file);
    const ext = import_path.default.extname(file).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
var wss = new import_ws.WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});
wss.on("connection", (ws) => {
  log("\u5BA2\u6237\u7AEF\u63A5\u5165");
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === "register") {
      if (clients.size >= 2) {
        log("\u62D2\u7EDD: \u623F\u95F4\u5DF2\u6EE1");
        ws.close();
        return;
      }
      const idx = clients.size;
      clients.set(ws, idx);
      log(`player-${idx} \u52A0\u5165 (${clients.size}/2)`);
      send(ws, { type: "assign", payload: { playerIndex: idx } });
      if (clients.size === 2) startGame();
      return;
    }
    if (msg.type === "action") {
      const idx = clients.get(ws);
      if (idx === void 0 || !engine) return;
      const action = msg.payload;
      action.playerIndex = action.playerIndex ?? idx;
      log(`action: ${action.type} by ${action.playerIndex}`);
      void engine.dispatch(action).then((err) => {
        if (err) log(`dispatch \u62D2\u7EDD: ${err.message}`);
        broadcastState();
      });
    }
  });
  ws.on("close", () => {
    const idx = clients.get(ws);
    if (idx !== void 0) {
      clients.delete(ws);
      log(`player-${idx} \u65AD\u5F00 (${clients.size}/2)`);
    }
  });
  ws.on("error", () => {
  });
});
server.listen(PORT, "0.0.0.0", () => {
  log(`\u4E00\u4F53\u670D\u52A1\u5668 listening 0.0.0.0:${PORT} (\u9875\u9762 http://<ip>:${PORT}/ + ws)`);
});
