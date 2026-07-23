# BoardGame 架构文档

## 项目概览

去中心化桌游平台——Nostr 信令 + WebRTC P2P + 苹果风格抽屉交互。

**技术栈**：TypeScript，Vite，WebRTC，Nostr，motion，Web Worker

---

## 目录结构

```
src/
├── core/           # 引擎 + 网络（无 UI 依赖）
│   ├── types.ts       全局类型
│   ├── engine.ts      游戏引擎
│   ├── reducer.ts     状态更新纯函数
│   ├── registry.ts    动作/条件注册表
│   ├── l3.worker.ts   L3 脚本沙箱 Worker
│   ├── nostr.ts       Nostr 信令
│   ├── qrcode.ts      二维码
│   ├── signaling.ts   统一信令（Nostr→QR 降级）
│   ├── webrtc.ts      WebRTC DataChannel
│   ├── backup.ts      状态广播 + ACK + 缓存
│   ├── migration.ts   主机迁移
│   └── p2p.ts          P2P 管理器
├── client/         # 浏览器端
│   ├── main.ts        入口（引擎+网络+UI 组装）
│   ├── renderer.ts    UI 渲染器（抽屉交互核心）
│   └── styles.css     全局样式
├── games/          # 游戏定义
│   └── doudizhu/      斗地主
└── assets/
    └── icons/         图标
```

---

## 模块详解

### `types.ts` — 全局类型

Card、GameState、PlayerView、GameAction、GameConfig 等类型定义。全部可 JSON 序列化支持 `structuredClone`。

### `engine.ts` — 游戏引擎

- `loadGame(config)` → 校验 + 注册动作/条件 + 启动 L3 Worker
- `dispatch(action)` → L3 前置钩子 → reducer → L3 校验 → 更新 state → 后置钩子
- `buildPlayerView(i)` → 按 visibility 配置过滤手牌
- `startGame()` → Fisher-Yates 洗牌 + 发牌

### `reducer.ts` — 状态更新

纯函数 switch-case 处理 start_game / call_landlord / play_cards / pass。拒绝时返回原 state 引用。

### `registry.ts` — 注册表

ActionRegistry / ConditionRegistry / ComponentRegistry 三个 Map 单例。引擎初始化时 auto-register stub。

### `l3.worker.ts` — L3 沙箱

受限 Worker 执行用户脚本。提供 `game.on/off` 事件 API 和 `registerFunction` 同步查询。无 DOM / fetch / localStorage。

### `nostr.ts` — Nostr 信令

- 4 个公开 relay（damus.io, nos.lol 等）
- 房间码 → tag `bgs-xxx` → publish/subscribe kind:1 事件
- XOR + Base64 加密 SDP
- 30 秒重连

### `qrcode.ts` — 二维码

`encodeQR()` 生成 DataURL，`decodeQR()` 解析，`shareSignaling()` 调用系统分享/剪贴板。

### `signaling.ts` — 统一信令

Nostr → QR 降级。对上层暴露统一 `SignalingRoom` 接口。

### `webrtc.ts` — WebRTC 传输

- Google STUN 穿透
- signaling.onMessage 处理 SDP/ICE 交换
- DataChannel "game" 传输游戏数据
- 消息去重 `seenMsgs` Set

### `backup.ts` — 状态备份

- `broadcast(peers, state)` → 全量广播 + localStorage
- `receive(data)` → 缓存 + 回 ACK
- `restoreLocal()` → 从 localStorage 恢复

### `migration.ts` — 主机迁移

- `transfer(targetPeerId, state)` → 主动移交
- `handleMessage()` → 处理 host_migrate / host_changed / ping / pong / election
- ping/pong 超时 10 秒触发选举

### `p2p.ts` — P2P 管理器

三级架构：
```
├─ @moku-labs/room（优先）
├─ WebRTC + 统一信令（自建）
└─ BroadcastChannel（测试，手动启用 useBroadcastChannel()）
```

### `renderer.ts` — UI 渲染器

**抽屉系统**（showHomeLibrary）：

```
主屏幕 (main-stage)  ← scale(1→0.8) + blur(0→8px)
                      ↓ 上划 > 20%
抽屉 (drawer)         ← translateY(100%→0%)
   ├─ 导入胶囊         ← backdrop-filter 磨砂玻璃
   ├─ drawer-scroll    ← 滚动列表
   │   ├─ 游戏卡片
   │   └─ ...
   └─ ::after 遮罩     ← 透明度 0→0.25（增强玻璃对比度）
```

**交互状态机**：
- `progress` ∈ [0,1]：0=主屏幕全屏，1=抽屉全开
- `onDown` → `dragging=true` + home 缩小
- `onMove` → `apply(dx/vh)` 跟随手指
- `onUp` → `progress > 0.20` 开 / `progress >= 0.80` 保持开（即 <0.20 才关）
- `canCloseDrawer()` → 抽屉滚动到顶部时允许下滑关闭
- `preventDefault()` 阻止浏览器原生滚动抢手势

**页面导航**：
- 首页 (showHomeLibrary) → 游戏详情 (showGameDetail) → 房间大厅 (showLobby) → 游戏 (showGame)
- 左边缘滑动返回 (addSwipeBack)

### `main.ts` — 客户端入口

组装 engine / p2p / backup / migration / renderer。
```
onCreateRoom → p2p + engine → showLobby
onJoinRoom  → p2p + 等待 → showWaitRoom
onStartGame → engine.startGame → broadcastGame
onPlayAction → dispatch → 广播
onSaveGame  → engine.getState → QR 导出
onLoadGame  → JSON → engine.loadState
```

### `styles.css` — 样式

- CSS 变量系统：`--bg`, `--bg-card`, `--fill2`, `--label2` 等
- 抽屉玻璃：`backdrop-filter: blur + saturate` 动态渐变
- 主屏幕模糊：`filter: blur()` 随 progress
- 胶囊卡片：`border-radius: 20px`
- 壁纸预留：`--wallpaper` CSS 变量

---

## 运行

```bash
npm install
npm run dev          # HTTPS + 局域网
npm run build        # 构建到 docs/
```

**手机分发**：`npm run dev` → 手机同 WiFi 访问终端 IP → PWA 安装。

**联机流程**：一人创建房间 → Nostr 信令发布 SDP → WebRTC 直连 → 数据走 DataChannel。
