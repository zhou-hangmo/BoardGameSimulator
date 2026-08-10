// 测试 Node 端口可达性（file:// 页面内 fetch）
const { WebSocket } = require('ws');
const URL = process.argv[2];
const ws = new WebSocket(URL);
ws.on('open', () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: "fetch('http://localhost:8787/').then(function(r){ return 'HTTP ' + r.status; }).catch(function(e){ return 'ERR:' + e.message; })",
      awaitPromise: true,
      returnByValue: true,
    },
  }));
});
ws.on('message', d => {
  const m = JSON.parse(d.toString());
  if (m.id === 1) {
    console.log('Node 端口测试:', m.result && m.result.result && m.result.result.value);
    ws.close();
    process.exit(0);
  }
});
setTimeout(() => { console.log('超时'); process.exit(1); }, 10000);
