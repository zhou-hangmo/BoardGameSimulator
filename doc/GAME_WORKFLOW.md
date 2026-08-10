# 扩充游戏库 · 工作流

基于配置驱动的引擎（`GameEngine`）——新游戏的规则/逻辑通过 **config（L1/L2）+ L3 脚本** 注册，服务器权威校验，客户端视图渲染。

## 加新游戏前的一次性重构（前置依赖）

当前服务器 `startSession` **硬编码**了 battleship 的初始化和隐私过滤：

```ts
// scripts/host-server.ts（现状）
const config = battleshipTest.config;
engine.loadGame(config);
engine.loadState({ ...s, extra: initBoards(n), phase: 'idle' });
```

**需要改为按 `gameId` 查注册表**，支持任意游戏接入：

### 目标形态

```ts
// src/games/registry.ts（新文件，服务器 + 客户端共用类型）
interface GameRegistration {
  meta: {
    id: string;
    name: string;
    description: string;
    minPlayers: number;
    maxPlayers: number;
    ready: boolean;
  };
  config: GameConfig;                                         // L1/L2/L3 配置
  initExtra?: (playerCount: number) => unknown;               // 初始对局数据
  filterView?: (extra: unknown, playerIndex: number) => unknown; // 隐私过滤
}
const GAME_REGISTRY: Record<string, GameRegistration> = {};
export function registerGame(g: GameRegistration): void { ... }
export function getGame(id: string): GameRegistration | undefined { ... }
```

### 改动范围

| 文件 | 改动 |
|---|---|
| `src/games/registry.ts` | 新增：注册表 + 类型 |
| `src/games/battleship/` | battleship 注册调用（`registerGame(...)`） |
| `scripts/host-server.ts` | `startSession` 改为查注册表（`getGame(gameId)`），GAMES 数组用注册表生成 |
| `src/client/main.ts` | `showGame` 按 gameId/extra 形状分发视图 |

**预计工作量**：半天（纯重构，不影响现有功能，bgs-ws/features 回归验证）。

---

## 标准工作流（加一款游戏 ≈ 5 步）

### 阶段 0 · 游戏规格（10 分钟）

确定以下要素并写成一段话：

- **玩法简介**：回合制/即时？玩家操作什么？
- **人数范围**：2 人？2-4 人？
- **数据模型**：棋盘/卡牌/骰子？每方有隐藏信息吗？
- **胜负条件**
- **关键规则**：合法操作是什么？是否必须同时操作？
- **示例**（battleship）：
  > 双人回合制海战。每人一张 10×10 棋盘 + 5 艘船（航母/战列舰/巡洋舰/潜艇/巡逻艇，长度 5/4/3/3/2）。先布阵（放置所有船），双方确认后轮流开火。命中可连发，击沉船后报告"沉没"，全部船沉没即为胜利。对方舰船位置（隐藏信息）对敌方不可见。

### 阶段 1 · 纯逻辑 + 单测（核心，不碰 UI/服务器）

**创建目录** `src/games/<id>/`

#### 1a. `rules.ts`（数据结构 + 纯函数）

```ts
// 以黑白棋（Othello）为例
export interface GameState {
  board: number[][];        // 8×8，0=空 1=黑 2=白
  currentPlayer: number;    // 当前回合
  passCount: number;        // 连续一手无法下（双方都 pass = 结束）
}

export function createBoard(): number[][] { ... }
export function isLegalMove(state: GameState, row: number, col: number): boolean { ... }
export function placePiece(state: GameState, row: number, col: number): GameState { ... }
export function getWinner(state: GameState): number | null { ... }
```

**原则**：
- 纯函数：输入状态 + 操作 → 输出新状态（不修改原对象）
- 校验与操作分离：`isLegalMove` 判断合法性；`placePiece` 执行落子
- 导出类型供 config 和视图引用

#### 1b. `config.json`（L1/L2 配置）

```jsonc
{
  "meta": { "name": "黑白棋", "maxPlayers": 2 },
  "l1": {
    "cards": [/* 棋盘类无卡牌，给空数组 */],
    "players": { "count": 2 },
    "extra": "board"    // 标记对局数据字段名
  },
  "l2": {
    "rules": [
      {
        "actions": [{ "type": "othello_place", "handler": "place" }],
        "condition": { "type": "always" }
      }
    ]
  }
}
```

> ⚠️ L1/L2 配置格式见 `src/games/battleship/config.json` 作为参考。L2 动作注册给 `ActionRegistry`，reducer 里调度规则执行。config 驱动引擎——不需要改 `reducer.ts` 本身，只需在 reducer 里处理动作映射（现有 `battleship_place`/`battleship_fire` 等硬编码——**可能需要改为通用 dispatch**（动作 type → 通用 handler 查表）——这是重构点之一。

#### 1c. `l3.ts`（L3 校验脚本字符串）

```ts
export const l3Script = `
  const { parseCell, cellAt, isLegalMove, placePiece, getWinner } = require('./rules');
  // registerFunction / game.on 模式，参考 src/games/battleship/l3.ts
  registerFunction('validate_action', function(state, action) {
    // 校验 action 合法性
  });
  game.on('before_action', function(state, action) {
    // 前置钩子
  });
`;
```

#### 1d. 单测

```ts
// src/tests/games/<id>/rules.test.ts
import { describe, it, expect } from 'vitest';
import { createBoard, isLegalMove, placePiece } from '../../../games/<id>/rules';

describe('<Game> 规则', () => {
  it('初始棋盘正确', () => { ... });
  it('合法落子', () => { ... });
  it('越界落子非法', () => { ... });
  it('胜负判断', () => { ... });
});
```

**验证**：`npm test` → 新增用例全绿。

### 阶段 2 · 注册表接入（配表，不写逻辑）

#### 2a. 创建 `src/games/<id>/test.ts`（导出注册数据）

```ts
import { registerGame } from '../registry';
import config from './config.json';
import { initBoard, filterBoard } from './rules';
import { l3Script } from './l3';

registerGame({
  meta: { id: '<id>', name: '<名称>', description: '<描述>', minPlayers: 2, maxPlayers: 2, ready: true },
  config: { ...config, l3: l3Script } as GameConfig,
  initExtra: (n) => ({ board: createBoard(), currentPlayer: 0, passCount: 0 }),
  filterView: (extra, idx) => extra,  // 无隐藏信息时返回原数据；有隐藏信息时过滤
});
```

#### 2b. 服务器 `host-server.ts` 改一行

```ts
// startSession 改为查注册表
const reg = getGame(gameId);
const engine = new GameEngine(s0);
engine.loadGame(reg.config);
engine.startGame(players.length);
if (reg.initExtra) engine.loadState({ ...engine.getState(), extra: reg.initExtra(players.length), phase: 'idle' });
```

#### 2c. 大厅游戏库自动扩展

`GAMES` 数组从注册表动态生成（`Object.values(REGISTRY).map(r => r.meta)`），**无需手动加条目**。

**验证**：服务器启动脚本（`bgs-ws` 适配游戏 id 参数——新游戏冒烟见阶段 4）。

### 阶段 3 · 客户端视图（如果现有视图不匹配）

#### 3a. 判断是否需要新视图

| 游戏类型 | 现有视图 | 需新视图？ |
|---|---|---|
| 棋盘类（五子棋/黑白棋/围棋） | BattleView（battleship 10×10 网格） | **可复用/扩展**——改 grid 渲染（去掉拖拽/布阵逻辑，换为点击落子） |
| 卡牌类（斗地主等） | GameView（通用卡牌视图） | 可能可复用 |
| 其他 | — | 需新建 `views/<Game>View.ts` |

#### 3b. main.ts 视图分发

```ts
// showGame 按 extra 形状或 gameId 路由
const reg = getGame(currentGameId);
if (reg?.viewId === 'board') return showBoardView(v);     // 棋盘类共用
if (reg?.viewId === 'card') return showCardView(v);       // 卡牌类共用
showBoardView(v);  // 默认（battleship 兼容）
```

### 阶段 4 · 自动化冒烟

**方案 A**（推荐）：参数化 `bgs-ws.cjs` 支持任意游戏 id：

```bash
node scripts/bgs-ws.cjs --game=othello
```

断言改为通用流程：接入→发起（座位面板已通用）→ 游戏阶段操作（**游戏专属**：随机布阵 → 确认 → 战斗 是 battleship 专属的，其他游戏不同）→ **需要每个游戏写自己的操作断言脚本**。

**方案 B**：新游戏独立冒烟脚本（如 `bgs-ws-othello.cjs`），复用大厅接入逻辑（复制 battleship 的接入+发起部分），定制操作断言部分。

**建议**：方案 B（独立脚本、互不干扰）。

### 阶段 5 · 打包 + 真机验证

```bash
npm run verify                # tsc + 单测 + 现有冒烟
powershell -File build-app.ps1  # App 打包（自动含新游戏注册）
adb install -r ...             # 手机安装
# 真机测试：大厅发起新游戏 → 完整对局
```

---

## 适合框架的游戏类型

| 类型 | 例子 | 视图复用 | 隐私过滤 | 难度 |
|---|---|---|---|---|
| 完全公开棋盘 | 黑白棋、五子棋、围棋 | 可扩展棋盘视图 | 无需过滤 | ⭐ 最简单 |
| 双方隐藏部分信息 | 海战棋（已有）、猜数字 | 棋盘/自定义视图 | **需要 filterView** | ⭐⭐ |
| 卡牌类 | 斗地主、UNO | GameView 通用 | 可选 | ⭐⭐ |
| 实时/动作类 | 无 | ❌ 不适合（框架只支持回合制） | — | — |

---

## 推荐"第一模板"：黑白棋（Othello）

- 8×8 棋盘、公开信息（无需隐私过滤）
- 逻辑极简：合法落子判断 + 翻转 + 计分
- rules.ts 约 80 行（比 battleship 250 行少很多）
- 视图：复用棋盘 grid（10×10 → 参数化 8×8），去掉布阵/拖拽逻辑
- **30 分钟可从逻辑到单测全绿**，之后接入注册表 + 视图 1-2 小时

---

## 常见问题

**Q：为什么 L1/L2 config 格式仍然用 battleship 的 pattern？**

battleship 是目前唯一验证过的配置驱动实现。新游戏沿用同一套 schema，`reducer.ts` 中需要通用化（从硬编码 `battleship_*` → 查 config 的动作列表）。这一通用化是"前置重构"的一部分。

**Q：视图必须做吗？没有视图能不能先验证逻辑？**

可以——纯逻辑 + 单测（阶段 1）就能在命令行验证全部规则。服务器接入后（阶段 2）可以用 `bgs-features` 模式的脚本直连 ws，发 action、收 state，无需 UI。视图（阶段 3）是最后一步。

**Q：第二个游戏之后工作流会更快吗？**

会。注册表就绪后，第 N 个游戏（N>1）只需：`rules.ts` + `config.json` + `l3.ts` + 视图（可选）→ 注册一条 → 冒烟脚本。无架构改动。
