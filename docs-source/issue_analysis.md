# Issue Analysis Report

> **Project**: `BoardGameSimulator`
> **Generated**: 2026-07-23 14:40:00
> **Last Updated**: 2026-07-23 14:40:00

---

## Summary

| Priority | Total | Pending | Resolved | Deferred | Rejected |
|----------|-------|---------|----------|----------|----------|
| 🔴 Critical | 7 | 1 | 6 | 0 | 0 |
| 🟡 Warning | 6 | 0 | 6 | 0 | 0 |
| 🔵 Suggestion | 4 | 0 | 4 | 0 | 0 |
| **Total** | **17** | **1** | **16** | **0** | **0** |

---

## Issues

### IS-001: Nostr `limit: 0` 导致历史事件丢失
- **Status**: ✅ Resolved
- **Priority**: 🔴 Critical
- **Category**: Logic Bug
- **File**: `src/core/nostr.ts`
- **Line**: 69
- **Description**:
  `ws.send(JSON.stringify(['REQ', tag, { kinds: [1], '#t': [tag], limit: 0 }]));` —— NIP-01 规范中 `limit: 0` 在 REQ/subsription 中表示"返回 0 条历史事件，仅接收之后的新事件"。如果 host 先连上 relay 并发布 join/offer，peer B 在 host 之后连接subscribe，`limit: 0` 导致 B 看不到 host 已发布的任何消息。这是 issue #4（加入者看不到）的根因之一。

- **Impact**:
  房间创建后加入的玩家收不到 host 的 SDP offer，P2P 连接建立失败。

- **Fix Options**: Option A
- **Chosen Fix**: Option A
- **Resolution**: 2026-07-23 — Option A applied

---

### IS-002: WebRTC + signaling 消息循环路由
- **Status**: ✅ Resolved
- **Priority**: 🔴 Critical
- **Category**: Architecture
- **File**: `src/core/webrtc.ts`
- **Line**: 83
- **Description**:
  `signaling.onMessage(...)` 注册在 signaling 层处理 `join_req`/`sdp`/`ice`。webrtc 的 `handleIncoming` 创建 offer → 调用 `signaling.sendTo` → 这个消息又通过 Nostr 广播回到同一个 tag → signaling.onMessage 捕获 → 可能再次触发 `handleIncoming`（自循环）。需要过滤自己的消息（`msg.from === myPeerId` 已做），但 `host_ready` 和 `join_req` 可能形成 echo loop。

- **Impact**:
  SDP 交换可能重复；在特定时序下导致无限连接尝试。

- **Fix Options**: Option A
- **Chosen Fix**: Option A
- **Resolution**: 2026-07-23 — Option A applied

---

### IS-003: OnMove 方向在 library 页不正确
- **Status**: ✅ Resolved
- **Priority**: 🔴 Critical
- **Category**: Logic Bug
- **File**: `src/client/renderer.ts`
- **Line**: 114
- **Description**:
  `offset = Math.max(-host.clientHeight, Math.min(0, base - dy));` 在 library 页（atHome=false, base=-vh）时，手指上划（dy>0）：offset = -vh - dy → 超过 -vh → 被 clamp 为 -vh。用户只能把页面往下拉回 home，无法往上继续。游戏库界面被 clamp 死，不可见。`limit: max(0, ...)` 应该是 `min(0, ...)` 的相反：在 home 页允许 offset ∈ [-vh, 0]；上划时 offset 逐渐趋向 -vh。

- **Impact**:
  游戏库界面空白 — transform 推导到不可见区域。

- **Fix Options**: Option A
- **Chosen Fix**: Option A
- **Resolution**: 2026-07-23 — Option A applied

---

### IS-004: 键盘弹出时触摸翻页冲突
- **Status**: ✅ Resolved
- **Priority**: 🔴 Critical
- **Category**: User Experience
- **File**: `src/client/renderer.ts`
- **Line**: 124
- **Description**:
  输入框聚焦 → 键盘弹出 → 用户点空白处想关闭键盘 → tap 触发 `touchstart` 在 `host` 上 → `onDown` → `dragging=true` → `touchend` → `onUp` → snapTo（即使手指未移动）。没有 `inputFocused` 状态来禁用手势系统，`isInteractive` 只在 `touchstart` 上检查 target，无法阻止整条手势链。

- **Impact**:
  用户在输入框聚焦时无法点空白处关闭键盘，任何空白处 tap 都触发翻页。

- **Fix Options**: Option A
- **Chosen Fix**: Option A
- **Resolution**: 2026-07-23 — Option A applied

---

### IS-005: 翻页缺少速度判断
- **Status**: ✅ Resolved
- **Priority**: 🔴 Critical
- **Category**: Logic Bug
- **File**: `src/client/renderer.ts`
- **Line**: 121
- **Description**:
  `snapTo` 只有距离判断（> 30% 翻页，否则回弹）。iOS 的做法是 `距离 > 30% OR 速度 > 500px/s 且方向正确`。快速小幅划动（如 300px/s 划 50px）被错误地回弹。需要在 `onMove` 中记录 `lastY`/`lastTime`，在 `onUp` 中计算 `velocity = (y - lastY) / (now - lastTime) * 1000`。

- **Impact**:
  快速小幅划动无法翻页，与所有 iOS 原生应用的体验不一致。

- **Fix Options**: Option A
- **Chosen Fix**: Option A
- **Resolution**: 2026-07-23 — Option A applied

---

### IS-006: P2PManager.leave 在 BC 模式下被错误覆盖
- **Status**: ✅ Resolved
- **Priority**: 🟡 Warning
- **Category**: Logic Bug
- **File**: `src/core/p2p.ts`
- **Line**: 54
- **Description**:
  `this.room.leave = () => { wrc.leave(); sig.leave(); };` 覆盖了 room 的 leave 方法。如果 future 代码允许 forceBC 后重新 init，leave 会被错误覆盖成 wrc/sig 的版本（BC room 没有 wrc/sig）。

- **Impact**:
  当前通过 initialized 检查避免，但架构脆弱。

- **Fix Options**: Option A
- **Chosen Fix**: Option A
- **Resolution**: 2026-07-23 — Option A applied

---

### IS-007: HostMigration 自动 ping 检测未实现
- **Status**: ✅ Resolved
- **Priority**: 🟡 Warning
- **Category**: Logic Bug
- **File**: `src/core/migration.ts`
- **Line**: 102-104
- **Description**:
  `setInterval(() => { /* If no ping received in 10s, start election */ }, 5000);` —— 回调体为空。ping/pong 自动检测完全未实现：没有 `lastPingTime` 记录，没有超时检查，没有触发选举。

- **Impact**:
  主机迁移的"意外掉线自动恢复"功能不可用。

- **Fix Options**: Option A
- **Chosen Fix**: Option A
- **Resolution**: 2026-07-23 — Option A applied

---

### IS-008: StateBackup.setTransport 每次广播都重建
- **Status**: ✅ Resolved
- **Priority**: 🟡 Performance
- **File**: `src/client/main.ts`
- **Line**: 33
- **Description**:
  `backup.setTransport((pid, data) => ...)` 在 `broadcastGame()` 中调用（每步操作都触发）。应在 createRoom 时设置一次。

- **Impact**:
  不必要的函数对象分配，每步操作创建一个新闭包。

- **Fix Options**: Option A
- **Chosen Fix**: Option A
- **Resolution**: 2026-07-23 — Option A applied

---

### IS-009: snapTo 中 homeBtn 动画与 onDown 冲突
- **Status**: ✅ Resolved
- **Priority**: 🟡 Warning
- **Category**: Maintainability
- **File**: `src/client/renderer.ts`
- **Line**: 103-104, 108-109
- **Description**:
  `snapTo` 中 `animate(homeBtn, { scale(0), opacity: 0 })` + `setTimeout` 250ms 后 `animate(scale(1), opacity: 1)`。同时 `onDown` 也在 0.1s 内做 `animate(scale(0), opacity: 0)`。连续快速操作时两个 `scale(0)` 动画叠加，回弹动画可能在第一个没结束前开始。

- **Impact**:
  home 按钮在快速翻页时闪烁或卡顿。

- **Fix Options**: Option A
- **Chosen Fix**: Option A
- **Resolution**: 2026-07-23 — Option A applied

---

### IS-010: signaling.joinRoom 在 Nostr 不可用时无 fallback
- **Status**: ✅ Resolved
- **Priority**: 🟡 Warning
- **Category**: Logic Bug
- **File**: `src/core/signaling.ts`
- **Line**: 61-68
- **Description**:
  `joinRoom` try 调用 `nostr!.joinRoom(code)`，catch 后 nostr 仍为 null，静默失败。sendTo/broadcast 通过 `nostr?.sendTo?.()` 静默忽略。创建房间做了 try/catch fallback 到本地房间码生成，但 join 没有。

- **Impact**:
  Nostr 不可用时 join 功能完全失效，无提示给用户。

- **Fix Options**: Option A
- **Chosen Fix**: Option A
- **Resolution**: 2026-07-23 — Option A applied

---

### IS-011: `as any` 类型断言丢失 shareRoom
- **Status**: ✅ Resolved
- **Priority**: 🟡 Warning
- **Category**: Maintainability
- **File**: `src/core/p2p.ts`
- **Line**: 50, 53
- **Description**:
  `createWebRTCRoom(sig as any)` 和 `this.room = wrc as unknown as RoomAPI` 两层类型断言，丢失 `shareRoom` 方法。虽然 p2p.ts 的 `shareRoom()` 访问 `(this.room as any).shareRoom`，但 webrtc room 没有这个方法。

- **Impact**:
  分享房间功能不可用，编译时不会报错。

- **Fix Options**: Option A
- **Chosen Fix**: Option A
- **Resolution**: 2026-07-23 — Option A applied

---

### IS-012: 键盘焦点状态应全局管理
- **Status**: ✅ Resolved
- **Priority**: 🔵 Suggestion
- **Category**: Maintainability
- **File**: `src/client/renderer.ts`
- **Line**: 97, 124
- **Description**:
  `isInteractive(el)` 每次都 walk DOM 检查 target。更干净：维护 `inputFocused` 布尔值，在 input `focus`/`blur` 事件中切换，手势直接读。

- **Impact**:
  低——不影响功能，但代码意图不够清晰。

- **Fix Options**: Option A
- **Chosen Fix**: Option A
- **Resolution**: 2026-07-23 — Option A applied

---

### IS-013: engine.saveSnapshot 与 StateBackup 重复存储
- **Status**: ✅ Resolved
- **Priority**: 🔵 Suggestion
- **Category**: Maintainability
- **File**: `src/core/engine.ts`, `src/core/backup.ts`
- **Line**: 254, 66
- **Description**:
  `engine.saveSnapshot()` key=`room_snapshot_current`，`StateBackup.saveLocal()` key=`bgs_backup`。同一份 GameState 存了两次到 localStorage，不同 key。恢复时可能拿到不同版本。

- **Impact**:
  存储浪费，恢复时可能不一致。

- **Fix Options**: Option A
- **Chosen Fix**: Option A
- **Resolution**: 2026-07-23 — Option A applied

---

### IS-014: `limit: 0` 无注释解释意图
- **Status**: ✅ Resolved
- **Priority**: 🔵 Suggestion
- **Category**: Documentation
- **File**: `src/core/nostr.ts`
- **Line**: 69
- **Description**:
  `limit: 0` 在 NIP-01 订阅 filter 中表示"仅未来新事件"。如果是有意（不关心历史），应加注释说明。否则维护者无法判断是设计决策还是笔误。

- **Impact**:
  维护困难。

- **Fix Options**: Option A
- **Chosen Fix**: Option A
- **Resolution**: 2026-07-23 — Option A applied

---

### IS-015: reducer.ts 未使用 L2 规则引擎
- **Status**: ✅ Resolved
- **Priority**: 🔵 Suggestion
- **Category**: Architecture
- **File**: `src/core/reducer.ts`
- **Line**: 11
- **Description**:
  `reducer()` 硬编码 4 个 action（start_game, call_landlord, play_cards, pass）。L2 `BehaviorRule` 类型定义了 trigger/condition/actions 规则链但完全没有被读取和使用。新游戏需改 reducer 源码才能支持，违背了"规则驱动"的设计初衷。

- **Impact**:
  可扩展性受限——添加新游戏必须改引擎代码。

- **Fix Options**: Option A
- **Chosen Fix**: Option A
- **Resolution**: 2026-07-23 — Option A applied

---

### IS-016: showHomeLibrary 重建DOM后事件监听器丢失
- **Status**: ✅ Resolved
- **Priority**: 🔴 Critical
- **Category**: Logic Bug
- **File**: src/client/renderer.ts
- **Line**: 43
- **Description**: init() 绑定的事件监听器（touchstart/move/end等）在 showHomeLibrary() 通过 innerHTML 重建DOM后全部丢失。由于host引用指向已移除的元素，后续 transform 修改无视觉变化。
- **Impact**: 翻转后页面假死——transform 修改不生效，无法翻回，游戏库界面空白。
- **Fix Options**: A: showHomeLibrary 内部重建监听器
- **Chosen Fix**: Option A
- **Resolution**: 2026-07-23 — Option A applied

### IS-017: tap与drag未区分导致输入框无法关闭
- **Status**: ✅ Resolved
- **Priority**: 🔴 Critical
- **Category**: Logic Bug
- **File**: src/client/renderer.ts
- **Line**: 121
- **Description**: onUp 中即使手指未移动（tap），也执行snapTo逻辑。用户点击空白处想关闭键盘时，3px以内的微小抖动都会触发翻页动画。
- **Impact**: 输入框聚焦后无法通过点击空白处关闭键盘。
- **Fix Options**: A: 移动<5px不触发snap，直接return
- **Chosen Fix**: Option A
- **Resolution**: 2026-07-23 — Option A applied

### IS-018: snap 方向参数反转导致抽屉开关逻辑错乱
- **Status**: ✅ Resolved
- **Priority**: 🔴 Critical
- **Category**: Logic Bug
- **File**: src/client/renderer.ts
- **Line**: 119
- **Description**: snap(open ? progress < 0.80 : progress > 0.20) 中关闭条件 progress < 0.80 应改为 progress >= 0.80。原逻辑：没动够→关，动够了→开——完全反了。导致极小下滑关、大幅下滑不关、任意上滑也关。
- **Impact**: 抽屉开关完全不可用。
- **Fix Options**: A: 改为 >= 0.80
- **Chosen Fix**: Option A
- **Resolution**: 2026-07-23 — 改为 snap(open ? progress >= 0.80 : progress > 0.20)

### IS-019: window 事件监听器在 showHomeLibrary 多次调用后重复叠加
- **Status**: ⏳ Pending
- **Priority**: 🔴 Critical
- **Category**: Logic Bug
- **File**: src/client/renderer.ts
- **Line**: 132-142
- **Description**: showHomeLibrary 内 window.addEventListener 从未 remove。首页→二级页→返回首页（showHomeLibrary 再次调用）→ window 上的 touchmove/touchend/mousemove/mouseup 重复绑定。N 次返回后有 N 份 handler 同时运行，drag 状态互相覆盖。
- **Impact**: 返回首页后抽屉交互异常，状态机错乱。
- **Fix Options**: (to be filled by code-fixer)
- **Chosen Fix**: (to be filled by code-fixer)
- **Resolution**: (to be filled after fix)
