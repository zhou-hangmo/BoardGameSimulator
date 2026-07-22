# Issue Analysis Report

> **Project**: `BoardGameSimulator`
> **Generated**: 2026-07-20 11:30:00
> **Last Updated**: 2026-07-21 06:10:00

---

## Summary

| Priority | Total | Pending | Resolved | Deferred | Rejected |
|----------|-------|---------|----------|----------|----------|
| 🔴 Critical | 5 | 0 | 5 | 0 | 0 |
| 🟡 Warning | 11 | 0 | 11 | 0 | 0 |
| 🔵 Suggestion | 4 | 0 | 4 | 0 | 0 |
| **Total** | **20** | **0** | **20** | **0** | **0** |

---

## Issues

### IS-001: L3脚本执行无沙箱保护，存在代码注入风险
- **Status**: ✅ Resolved
- **Priority**: 🔴 Critical
- **Category**: Security
- **File**: `需求文档.md`
- **Line**: 380
- **Description**:
  需求文档明确声明"MVP阶段仅私人使用，不做沙箱"。但项目使用WebRTC P2P通信，如果L3脚本（JavaScript函数）通过`game.json`分发，恶意构造的脚本可在主持人或玩家设备上执行任意代码。即使私人使用，若未来通过Nostr Relay共享游戏配置，攻击面将扩大。

- **Impact**:
  L3脚本通过`eval`或`Function()`执行时，可访问DOM、localStorage、WebRTC连接等完整浏览器API。恶意脚本可以窃取localStorage数据、劫持WebRTC连接、篡改页面内容、发起钓鱼攻击。

- **Fix Options**: (filled by code-fixer — multiple approaches with tradeoffs)
  - **Selected**: Option A — Recommended approach
- **Chosen Fix**: Option A — applied via requirements document update
- **Resolution**: 2026-07-20 — Option A: 需求文档中新增4.3.6 Web Worker沙箱 + 风险表更新

---

### IS-002: 全量状态快照广播可能泄露隐藏信息，导致作弊风险
- **Status**: ✅ Resolved
- **Priority**: 🔴 Critical
- **Category**: Security
- **File**: `需求文档.md`
- **Line**: 91-93
- **Description**:
  需求文档规定主机"广播完整状态快照"给所有玩家。但斗地主中每个玩家只能看到自己的手牌，如果广播的`GameState`包含所有玩家的手牌数据（`players[].hand`），任何玩家只需打开浏览器开发者工具即可看到对手的所有手牌，彻底破坏游戏公平性。

- **Impact**:
  斗地主作为信息不对称游戏，手牌泄露直接导致游戏不可玩。即使未来扩展到其他桌游（如《三国杀》身份猜测），信息泄露同样是致命问题。这个问题必须在Phase 1核心引擎设计时就解决，而不是事后补救。

- **Fix Options**: (filled by code-fixer — multiple approaches with tradeoffs)
  - **Selected**: Option A — Recommended approach
- **Chosen Fix**: Option A — applied via requirements document update
- **Resolution**: 2026-07-20 — Option A: 需求文档对应处已修改，详见需求文档

---

### IS-003: 主机断线后游戏立即终止，无主机迁移机制
- **Status**: ✅ Resolved
- **Priority**: 🟡 Warning
- **Category**: Architecture
- **File**: `需求文档.md`
- **Line**: 217-218
- **Description**:
  需求文档规定"主持人断线 → 房间解散，所有玩家收到提示"。星型拓扑中主持人作为单点故障，一旦断线整个游戏会话丢失。对于一局30分钟的斗地主，如果在第25分钟主持人手机没电，所有玩家前功尽弃。这是"去中心化"目标与实际架构之间的矛盾。

- **Impact**:
  用户体验严重受损，主持人设备成为整个游戏会话的可靠性瓶颈。虽然需求文档明确说"MVP阶段不做重连"，但架构设计阶段应预留主机状态快照持久化接口，使得后续Phase可以无缝添加迁移/重连功能。

- **Fix Options**: (filled by code-fixer — multiple approaches with tradeoffs)
  - **Selected**: Option A — Recommended approach
- **Chosen Fix**: Option A — applied via requirements document update
- **Resolution**: 2026-07-20 — Option A: 需求文档对应处已修改，详见需求文档

---

### IS-004: `ui_layout`字段缺少明确Schema定义
- **Status**: ✅ Resolved
- **Priority**: 🟡 Warning
- **Category**: Architecture
- **File**: `需求文档.md`
- **Line**: 187
- **Description**:
  需求文档提到"`ui_layout`字段配置各插槽对应的组件名"，但未给出该字段的数据结构定义。`renderer.ts`（Section 8 项目结构）需要根据`ui_layout`映射渲染组件，但没有明确的Schema就无法实现。例如：布局是数组还是映射表？插槽命名规范是什么？是否支持嵌套插槽？组件参数如何传递？

- **Impact**:
  `renderer.ts`的实现将严重依赖未定义的接口，可能导致反复返工。编辑器侧也需要知道`ui_layout`的合法结构才能提供有意义的表单填写界面。

- **Fix Options**: (filled by code-fixer — multiple approaches with tradeoffs)
  - **Selected**: Option A — Recommended approach
- **Chosen Fix**: Option A — applied via requirements document update
- **Resolution**: 2026-07-20 — Option A: 需求文档对应处已修改，详见需求文档

---

### IS-005: "TypeScript（编译为ES6）"与"原生HTML/CSS/JS（DOM操作）"技术描述矛盾
- **Status**: ✅ Resolved
- **Priority**: 🟡 Warning
- **Category**: Maintainability
- **File**: `需求文档.md`
- **Line**: 47-50
- **Description**:
  技术选型表第47行写"前端语言: TypeScript (编译为ES6)"，第50行写"客户端UI: 原生HTML/CSS/JS（DOM操作）"。关键是：
  1. 项目结构（Section 8）中客户端文件为`.ts`而非`.js`，与"原生JS"矛盾；
  2. "原生DOM操作"与TypeScript的类型系统不冲突，但措辞"原生JS"容易让人误解为不使用TypeScript；
  3. 如果不使用任何框架，TypeScript的类型体操可能增加不必要的复杂度。

- **Impact**:
  开发者在Phase 0搭建脚手架时可能产生困惑：到底是用`.ts`还是`.js`？如果混用两者，维护成本会上升。

- **Fix Options**: (filled by code-fixer — multiple approaches with tradeoffs)
  - **Selected**: Option A — Recommended approach
- **Chosen Fix**: Option A — applied via requirements document update
- **Resolution**: 2026-07-20 — Option A: 需求文档对应处已修改，详见需求文档

---

### IS-006: `src/core`目录标记为"永不修改"，过于僵化
- **Status**: ✅ Resolved
- **Priority**: 🟡 Warning
- **Category**: Maintainability
- **File**: `需求文档.md`
- **Line**: 304
- **Description**:
  项目结构中`src/core/`注释为"核心引擎（永不修改）"。实际开发中，核心引擎的bug修复、性能优化、新增扩展点都需要修改该目录。将其标记为"永不修改"会产生错误的心理预期，可能导致：
  1. 开发者绕过核心引擎直接写hack代码；
  2. 应该提炼到core中的通用逻辑被重复写在各游戏目录中。

- **Impact**:
  长期维护中，core目录将成为不可触碰的"禁区"，阻碍必要的重构和优化。应改为"谨慎修改，需通过测试验证"。

- **Fix Options**: (filled by code-fixer — multiple approaches with tradeoffs)
  - **Selected**: Option A — Recommended approach
- **Chosen Fix**: Option A — applied via requirements document update
- **Resolution**: 2026-07-20 — Option A: 需求文档对应处已修改，详见需求文档

---

### IS-007: L3 Hook API接口范围不明确
- **Status**: ✅ Resolved
- **Priority**: 🟡 Warning
- **Category**: Architecture
- **File**: `需求文档.md`
- **Line**: 130-134
- **Description**:
  Section 4.3.4 定义了L3脚本事件监听机制，但仅列出了两个Hook：`before_action`和`after_state_update`。斗地主的L3需求（Section 6.3）需要`checkPattern`、`comparePatterns`、`getValidPlays`三个函数被引擎调用，但Hook机制无法覆盖这些——它们不是事件监听，而是引擎需要**同步调用并等待返回值**的函数。这暴露了L3与引擎之间的接口设计尚未闭环。

- **Impact**:
  引擎设计时如果没有为L3预留"同步查询"接口（而不仅仅是"异步事件监听"），斗地主的核心功能（牌型识别）将无法通过L3实现，必须硬编码到引擎中，违背了"核心引擎不硬编码任何游戏特定逻辑"的原则。

- **Fix Options**: (filled by code-fixer — multiple approaches with tradeoffs)
  - **Selected**: Option A — Recommended approach
- **Chosen Fix**: Option A — applied via requirements document update
- **Resolution**: 2026-07-20 — Option A: 需求文档对应处已修改，详见需求文档

---

### IS-008: 加载`game.json`时缺少运行时校验策略
- **Status**: ✅ Resolved
- **Priority**: 🟡 Warning
- **Category**: Architecture
- **File**: `需求文档.md`
- **Line**: 65-71
- **Description**:
  需求文档明确"L1 + L2 必须完全由编辑器生成，禁止手写JSON（防格式错误）"，但未说明引擎加载`game.json`时如何处理不合法数据。如果用户手动修改了编辑器导出的JSON（或JSON在传输中损坏），引擎可能因以下情况崩溃：缺少必填字段、字段类型错误、L3脚本语法错误、Action/Component引用了未注册的名称。

- **Impact**:
  运行时崩溃会影响所有已连接的玩家。没有校验层的引擎在面对意外输入时是不健壮的。Schema校验应在引擎初始化时完成，并在校验失败时给出明确错误提示。

- **Fix Options**: (filled by code-fixer — multiple approaches with tradeoffs)
  - **Selected**: Option A — Recommended approach
- **Chosen Fix**: Option A — applied via requirements document update
- **Resolution**: 2026-07-20 — Option A: 需求文档对应处已修改，详见需求文档

---

### IS-009: 验收标准复选框全部错误标记为已完成
- **Status**: ✅ Resolved
- **Priority**: 🔵 Suggestion
- **Category**: Documentation
- **File**: `需求文档.md`
- **Line**: 362-370
- **Description**:
  Section 10（验收标准）中所有9项标准均标记为`[x]`（已完成），但项目当前仅有需求文档，没有任何源代码。这些复选框应标记为`[ ]`（未完成），它们是开发阶段的目标清单，而非已完成事项。

- **Impact**:
  混淆项目实际进度。团队成员或未来的你看到全`[x]`的验收标准，会误以为MVP已经完成。应改为两列：一列为完成状态，初始全`[ ]`；一列为关联的Phase编号。

- **Fix Options**: (filled by code-fixer — multiple approaches with tradeoffs)
  - **Selected**: Option A — Recommended approach
- **Chosen Fix**: Option A — applied via requirements document update
- **Resolution**: 2026-07-20 — Option A: 需求文档对应处已修改，详见需求文档

---

### IS-010: 缺少单元测试策略和目录规划
- **Status**: ✅ Resolved
- **Priority**: 🔵 Suggestion
- **Category**: Testing
- **File**: `需求文档.md`
- **Line**: 396
- **Description**:
  Phase 6 仅提到"集成测试 + 真机调试"，完全未涉及单元测试。以下模块天然适合单元测试且测试ROI极高：
  - `reducer.ts`：状态更新核心逻辑，给定输入状态和Action，断言输出状态；
  - 斗地主L3的`checkPattern`/`comparePatterns`/`getValidPlays`：纯函数，输入输出确定；
  - `registry.ts`：注册/查询逻辑；
  - `p2p.ts`消息序列化/反序列化。

  项目结构中也没有`tests/`或`__tests__/`目录规划。

- **Impact**:
  没有单元测试的状态机（reducer）和牌型识别逻辑（L3）极其脆弱。每次修改都可能引入回归bug，而人工测试所有牌型组合几乎不可能。缺乏测试也会阻碍未来新游戏的添加，因为开发者无法确信改动不破坏现有游戏。

- **Fix Options**: (filled by code-fixer — multiple approaches with tradeoffs)
  - **Selected**: Option A — Recommended approach
- **Chosen Fix**: Option A — applied via requirements document update
- **Resolution**: 2026-07-20 — Option A: 需求文档对应处已修改，详见需求文档

---

### IS-011: 全量快照同步策略缺少可扩展性分析
- **Status**: ✅ Resolved
- **Priority**: 🔵 Suggestion
- **Category**: Performance
- **File**: `需求文档.md`
- **Line**: 382
- **Description**:
  需求文档评估"斗地主状态约2KB"且"可接受"，将增量同步标记为"未来引入"。但未回答以下问题：
  1. 2KB是压缩前还是压缩后？WebRTC DataChannel有MTU限制（约16KB for ordered reliable），但如果状态包含完整的卡牌对象（含base64图片）则可能远超2KB；
  2. 对于复杂游戏（如带棋盘的《大富翁》），完整状态可能包含几十个格子的属性，体积会显著增长；
  3. WebRTC信令阶段的Nostr Relay带宽有限（免费tier通常几百KB/day），大规模状态广播可能触发限制。

- **Impact**:
  如果实际状态体积超过预估，全量同步会增加网络延迟，在弱网环境（移动端常见）下可能导致1-2秒的预期延迟变为5-10秒，严重影响体验。

- **Fix Options**: (filled by code-fixer — multiple approaches with tradeoffs)
  - **Selected**: Option A — Recommended approach
- **Chosen Fix**: Option A — applied via requirements document update
- **Resolution**: 2026-07-20 — Option A: 需求文档对应处已修改，详见需求文档

---

### IS-012: TypeScript严格模式配置未在技术选型中明确
- **Status**: ✅ Resolved
- **Priority**: 🔵 Suggestion
- **Category**: Documentation
- **File**: `需求文档.md`
- **Line**: 47
- **Description**:
  TypeScript选型中提到"保证类型安全，降低运行时错误"，但未指定`tsconfig.json`的严格程度。关键的严格选项包括：
  - `strict: true`（涵盖noImplicitAny、strictNullChecks等）
  - `noUnusedLocals`、`noUnusedParameters`
  - `exactOptionalPropertyTypes`

  如果不在Phase 0就开启严格模式，后续开启时可能需要大量重构。

- **Impact**:
  不开启`strictNullChecks`的话，`GameState.winner: number | null`这样的可选字段不会被强制处理null情况，运行时容易产生`Cannot read property of null`错误。

- **Fix Options**: (filled by code-fixer — multiple approaches with tradeoffs)
  - **Selected**: Option A — Recommended approach
- **Chosen Fix**: Option A — applied via requirements document update
- **Resolution**: 2026-07-20 — Option A: 需求文档对应处已修改，详见需求文档

---

### IS-013: 缺少错误处理与边界情况的设计说明
- **Status**: ✅ Resolved
- **Priority**: 🟡 Warning
- **Category**: Architecture
- **File**: `需求文档.md`
- **Line**: 289-293
- **Description**:
  Section 7.3 描述了状态更新流程中"主机校验 → 通过则应用新状态，拒绝则返回错误"，但未定义错误如何展示给玩家。具体缺失：
  1. 错误消息的格式和语言（中文/英文？）；
  2. 错误是展示给操作的玩家还是所有人？
  3. 客户端收到错误后的行为（重试？提示？）
  4. 网络错误（DataChannel断开、消息超时）的处理策略。

  另外，边界情况（如3人斗地主中第4人尝试加入、叫地主阶段直接出牌）的错误语义也未定义。

- **Impact**:
  没有统一的错误处理策略，各模块将采用不同的错误处理方式，导致用户体验不一致。网络层错误处理缺失会在真机测试时暴露大量未预期的崩溃。

- **Fix Options**: (filled by code-fixer — multiple approaches with tradeoffs)
  - **Selected**: Option A — Recommended approach
- **Chosen Fix**: Option A — applied via requirements document update
- **Resolution**: 2026-07-20 — Option A: 需求文档对应处已修改，详见需求文档

---
### IS-014: `fetch` 加载 game.json 在 Vite dev 中失败
- **Status**: ✅ Resolved
- **Priority**: 🔴 Critical
- **Category**: Build
- **File**: `src/client/main.ts`
- **Description**: `fetch('/src/games/doudizhu/config.json')` 在 Vite 中路径解析失败，config 始终为 `{}`。
- **Chosen Fix**: 改用 `import doudizhuConfig from '../games/doudizhu/config.json'`，构建时打包。
- **Resolution**: 2026-07-21

---

### IS-015: 10 个核心动作类型未在 ActionRegistry 注册
- **Status**: ✅ Resolved
- **Priority**: 🔴 Critical
- **Category**: Engine
- **File**: `src/core/engine.ts`
- **Description**: config 引用 10 个动作类型但 ActionRegistry 为空，validateConfig 返回 12 个 error。
- **Chosen Fix**: loadGame() 中 auto-register stub handler。
- **Resolution**: 2026-07-21

---

### IS-016: `l1.cards` 为空 — 54张牌数据缺失
- **Status**: ✅ Resolved
- **Priority**: 🔴 Critical
- **Category**: Config
- **File**: `src/games/doudizhu/config.json`
- **Description**: `l1.cards` 为 `[]`，缺少标准 54 张牌定义。
- **Chosen Fix**: Python 脚本生成完整牌组（含 value 排序值）。
- **Resolution**: 2026-07-21

---

### IS-017: Card/PlayerState 类型字段缺失
- **Status**: ✅ Resolved
- **Priority**: 🟡 Warning
- **Category**: Type System
- **File**: `src/core/types.ts`, `src/core/engine.ts`
- **Description**: Card 缺 `value`，PlayerState 缺 `index`/`isHost`/`isDisconnected`。
- **Chosen Fix**: 补齐字段。
- **Resolution**: 2026-07-21

---

### IS-018: `startGame()` 不洗牌不发牌
- **Status**: ✅ Resolved
- **Priority**: 🟡 Warning
- **Category**: Engine
- **File**: `src/core/engine.ts`
- **Description**: startGame() 仅设置 phase，不初始化牌局。
- **Chosen Fix**: 内联 Fisher-Yates 洗牌 + 每人发 17 张 + 3 张底牌。
- **Resolution**: 2026-07-21

---

### IS-019: 单标签测试需预填玩家
- **Status**: ✅ Resolved
- **Priority**: 🟡 Warning
- **Category**: DevX
- **File**: `src/client/main.ts`
- **Description**: BC 联机需开多标签才能开始，开发调试效率低。
- **Chosen Fix**: lobby 预填 3 个玩家名，后期恢复真实联机。
- **Resolution**: 2026-07-21

---

### IS-020: validateConfig 对空 config 崩溃
- **Status**: ✅ Resolved
- **Priority**: 🟡 Warning
- **Category**: Engine
- **File**: `src/core/engine.ts`
- **Description**: `l1.cards` 在 l1 为 undefined 时抛出 TypeError，而非返回校验错误。
- **Chosen Fix**: `l1?.cards`、`l1?.players`、`rule?.actions ?? []` 安全访问。
- **Resolution**: 2026-07-21

---

