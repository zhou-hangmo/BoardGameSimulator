// ============================================================
// BoardGameSimulator — 手机端 TCP 转发器（随身路由器）
// 监听所有接口 PORT → 透明转发到电脑（热点网段 UPSTREAM）
// 用途：电脑在热点局域网内无公网地址，手机A 给电脑开"门"
// 用法: node forward.cjs [port] [upstream]   (默认 8787 192.168.43.242)
// ============================================================
'use strict';
const net = require('net');

const PORT = parseInt(process.argv[2] || '8787', 10);
const UP = process.argv[3] || '192.168.43.242';

const server = net.createServer((client) => {
  const up = net.connect(PORT, UP);
  client.pipe(up);
  up.pipe(client);
  client.on('error', () => {});
  up.on('error', () => {});
});

server.listen(PORT, '::', () => {
  console.log(`forward ${PORT} (all interfaces) -> ${UP}:${PORT}`);
});
