# BoardGameSimulator — 桌游大厅

无第三方服务器的多人桌游联机方案：**设备服务器 + 浏览器玩家端**。

## 架构

```
┌─ 大厅服务器（主机设备：手机 App / 电脑 Node）───────────┐
│  · HTTP 静态页面 + WS 大厅（同端口 8787，双栈 v4+v6）    │
│  · 常驻多玩家 · 游戏库 · 自动分配座位 · 主机发起         │
│  · 引擎权威（L3 校验）· 会话管理 · 踢人 · 口令           │
│  · 心跳/重连窗口/身份恢复 · 对局数据 AES 加密            │
└──────────────────────────────────────────────────────┘
  玩家1（主机本机）   玩家2/3…（浏览器扫码/链接接入，零安装）
```

- 传输：WebSocket（TCP）——蜂窝 TCP 入站放行（实测），UDP 入站被运营商拦
- 联机：公网玩家用**蜂窝 v6**（入站放行实测）；同网玩家用**局域网地址**
- 加密：对局数据 AES-256-GCM（密钥随邀请 URL 传递），防中间人偷看

## 快速开始（电脑开发）

```bash
npm install
npm run bundle        # 打包 host-server 单文件（es2019，node12 兼容）
npm run serve         # 启动大厅服务器（默认 8787）
# 浏览器打开 http://localhost:8787/?ws=1（两个标签 = 两个玩家）
npm run verify        # 全量回归：tsc + 单测 + 大厅流程 + 新功能
```

## 测试脚本

| 脚本 | 内容 |
|---|---|
| `npm test` | vitest 单测（引擎/规则/L3） |
| `scripts/bgs-ws.cjs` | 大厅全流程自动化（接入→发起→对局→回大厅） |
| `scripts/bgs-features.cjs` | 新功能验证（踢人/抢占恢复/重连窗口） |
| `scripts/bgs-natural-end.cjs` | 对局自然结束自动回大厅 |
| `scripts/bgs-addr.cjs` | 邀请地址分类过滤单测 |

## 手机 App（主机端）

工程：`../BGS-App`（Cordova + nodejs-mobile，Node 服务器跑在 App 内）

```bash
cd ../BGS-App
powershell -ExecutionPolicy Bypass -File build-app.ps1   # 一键打包 APK
# 安装：adb install -r platforms/android/app/build/outputs/apk/debug/app-debug.apk
```

App 打开 → 自动启动服务器并进入大厅 → 点"邀请"→ 公网/局域网二维码 → 玩家扫码加入。

## 保活（手机当服务器）

App 内"保活设置"引导（应用启动管理/电池不限制/锁屏锁定）——华为等厂商需用户手动配置，否则后台被杀。

## 诊断

- `diag6.html`：IPv6 链路诊断（蜂窝入站/候选/双端建连）
- `diag.html`：SDP 回环诊断
