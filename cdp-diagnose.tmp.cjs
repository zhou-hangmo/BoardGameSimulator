// CDP 诊断：检查 cordova 环境 + 重载抓 console/异常
const { WebSocket } = require('ws');
const URL = process.argv[2];
const ws = new WebSocket(URL);
let id = 0;
const pending = {};
const events = [];
function send(method, params) {
  return new Promise((res) => {
    const i = ++id; pending[i] = res;
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}
ws.on('message', d => {
  const m = JSON.parse(d.toString());
  if (m.id && pending[m.id]) { pending[m.id](m.result); delete pending[m.id]; return; }
  if (m.method === 'Runtime.consoleAPICalled') events.push(`[console.${m.params.type}] ${(m.params.args||[]).map(a=>a.value||a.description||'').join(' ')}`);
  if (m.method === 'Runtime.exceptionThrown') events.push(`[exception] ${m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text}`);
  if (m.method === 'Log.entryAdded') events.push(`[log.${m.params.entry.level}] ${m.params.entry.text}`);
});
ws.on('open', async () => {
  await send('Runtime.enable');
  await send('Log.enable');
  // 当前环境检查
  const env = await send('Runtime.evaluate', {
    expression: "JSON.stringify({ cordova: typeof cordova, device: typeof device, nodejs: typeof nodejs, scripts: Array.from(document.scripts).map(s=>s.src).join(','), body: (document.body.innerText||'').slice(0,80) })",
    returnByValue: true,
  });
  console.log('环境:', env.result && env.result.value);
  // 重载页面，抓 deviceready 前异常
  await send('Page.enable');
  await send('Page.reload');
  await new Promise(r => setTimeout(r, 6000));
  const env2 = await send('Runtime.evaluate', {
    expression: "JSON.stringify({ cordova: typeof cordova, body: (document.body.innerText||'').slice(0,80) })",
    returnByValue: true,
  });
  console.log('重载后:', env2.result && env2.result.value);
  console.log('--- 事件 ---');
  events.slice(0, 20).forEach(e => console.log(e));
  ws.close();
  process.exit(0);
});
setTimeout(() => { console.log('超时'); process.exit(1); }, 20000);
