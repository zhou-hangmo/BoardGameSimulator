// CDP 读取 WebView 页面状态（只读诊断）
const { WebSocket } = require('ws');
const URL = process.argv[2] || 'ws://localhost:9222/devtools/page/FE5E4B13C96AF21D58CDA849BF47FB1E';
const ws = new WebSocket(URL);
let id = 0;
const pending = {};
function send(method, params) {
  return new Promise((res, rej) => {
    const i = ++id; pending[i] = { res, rej };
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}
ws.on('message', d => {
  const m = JSON.parse(d.toString());
  if (m.id && pending[m.id]) { pending[m.id].res(m.result); delete pending[m.id]; }
});
ws.on('open', async () => {
  const r = await send('Runtime.evaluate', {
    expression: "JSON.stringify({ href: location.href, pid: localStorage.getItem('bgs-pid'), len: localStorage.length })",
    returnByValue: true,
  });
  console.log('页面状态:', r.result && r.result.value);
  const r2 = await send('Runtime.evaluate', {
    expression: "JSON.stringify({ wsAvail: typeof WebSocket, ready: document.readyState, body: (document.body.innerText||'').slice(0,100) })",
    returnByValue: true,
  });
  console.log('详情:', r2.result && r2.result.value);
  ws.close();
  process.exit(0);
});
setTimeout(() => { console.log('CDP 超时'); process.exit(1); }, 8000);
