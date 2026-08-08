// ============================================================
// BoardGameSimulator — WS 转发服务器（方案A PC 验证版）
// 单房间：host / guest 两个连接，按信封 {to,type,payload} 双向盲转
// 未来手机 App = 同一逻辑（Termux+Node 或 Kotlin 原生）
// 用法: node scripts/ws-server.cjs [port]   (默认 8787)
// ============================================================
'use strict';
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.argv[2] || '8787', 10);
const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

let host = null;
let guest = null;

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'register') {
      if (msg.role === 'host' && !host) { host = ws; ws.role = 'host'; console.log(`[${new Date().toISOString()}] host 接入`); }
      else if (msg.role === 'guest' && !guest) { guest = ws; ws.role = 'guest'; console.log(`[${new Date().toISOString()}] guest 接入`); }
      else console.log(`[${new Date().toISOString()}] register 忽略: role=${msg.role} (已占用或未知)`);
      return;
    }
    const target = msg.to === 'host' ? host
      : msg.to === 'guest' ? guest
      : (ws === host ? guest : host);
    if (target && target.readyState === 1) {
      target.send(raw.toString());
    } else {
      console.log(`[${new Date().toISOString()}] 转发丢弃: to=${msg.to} type=${msg.type}`);
    }
  });
  ws.on('close', () => {
    if (ws === host) { host = null; console.log(`[${new Date().toISOString()}] host 断开`); }
    if (ws === guest) { guest = null; console.log(`[${new Date().toISOString()}] guest 断开`); }
  });
  ws.on('error', (e) => console.log(`[${new Date().toISOString()}] ws error: ${e.message}`));
});

console.log(`ws-server listening 0.0.0.0:${PORT}`);
