// ============================================================
// 新功能验证：踢人 / 抢占式身份恢复 / 对局重连窗口
// 前置：node scripts/host-server.cjs 8787（干净重启）
// 用法: node scripts/bgs-features.cjs
// ============================================================
'use strict';
const { WebSocket } = require('ws');

const URL = 'ws://localhost:8787';
let seq = 0;
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** 建立连接并等待首条 lobby_state，返回 { ws, send, waitMsg, myId, state } */
function connect(playerId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const inbox = [];
    const waiters = [];
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'register', playerId }));
    });
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      for (let i = 0; i < waiters.length; i++) {
        if (waiters[i].type === m.type) { const w = waiters.splice(i, 1)[0]; w.resolve(m); return; }
      }
      if (m.type === 'lobby_state') {
        // 延迟取最新（等身份恢复广播覆盖）
        if (!inbox.some(x => x.type === 'lobby_state')) {
          inbox.push(m);
          setTimeout(() => {
            const latest = inbox.filter(x => x.type === 'lobby_state').pop();
            resolve({
              ws,
              send: (o) => ws.send(JSON.stringify(o)),
              waitMsg: (type, timeout = 5000) => new Promise((res, rej) => {
                const hit = inbox.find(x => x.type === type);
                if (hit) return res(hit);
                const w = { type, resolve: res };
                waiters.push(w);
                setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) waiters.splice(i, 1); rej(new Error(`等待 ${type} 超时`)); }, timeout);
              }),
              myId: latest.payload.you,
              state: latest.payload,
            });
          }, 400);
        } else {
          inbox.push(m);
        }
      } else {
        inbox.push(m);
      }
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('连接超时')), 5000);
  });
}

async function main() {
  // 1. 两玩家接入
  const A = await connect();
  const B = await connect();
  record('两玩家接入', A.myId !== B.myId && !!A.state.players.find(p => p.id === A.myId)?.isHost, `${A.myId}(主机)/${B.myId}`);

  // 2. 踢人：A(主机) 踢 B
  A.send({ type: 'kick_player', playerId: B.myId });
  const kicked = await B.waitMsg('kicked', 3000).catch(() => null);
  await sleep(500);
  const stateAfterKick = await A.waitMsg('lobby_state', 3000).catch(() => null);
  const onlyA = stateAfterKick && stateAfterKick.payload.players.length === 1 && stateAfterKick.payload.players[0].id === A.myId;
  record('踢人', !!kicked && onlyA, `kicked=${!!kicked} 剩余=${stateAfterKick?.payload.players.length}`);

  // 3. 被踢者重连 → 变新身份（缓存已清）
  const B2 = await connect(B.myId);
  record('被踢者重连变新身份', B2.myId !== B.myId, `新身份=${B2.myId}`);

  // 4. 抢占式恢复：B2 开第二个连接（第一个不关）→ 新连接抢占身份
  const B3 = await connect(B2.myId);
  await sleep(500);
  record('抢占式身份恢复', B3.myId === B2.myId, `${B2.myId} 被 B3 抢占`);

  // 5. 发起游戏（A 主机，游戏位 A+B3）
  A.send({ type: 'start_game', gameId: 'battleship', seats: [
    { playerId: A.myId, seat: 'player' },
    { playerId: B3.myId, seat: 'player' },
  ]});
  await A.waitMsg('game_started', 3000);
  await B3.waitMsg('game_started', 3000);
  record('发起对局', true, '双方 game_started');

  // 6. 对局中断线 → 重连窗口：B3 断开 → A 收 peer_disconnected → B3 重连 → 对局继续
  B3.ws.close();
  const pd = await A.waitMsg('peer_disconnected', 3000).catch(() => null);
  record('掉线通知', !!pd, pd ? `playerId=${pd.payload.playerId}` : '未收到');

  const B4 = await connect(B3.myId);  // 重连（身份恢复）
  await sleep(800);
  const gameStateAfter = await A.waitMsg('game_state', 3000).catch(() => null);
  record('重连后对局继续', B4.myId === B3.myId && !!gameStateAfter, `身份=${B4.myId} 恢复广播=${!!gameStateAfter}`);

  const failed = results.filter(r => !r.ok);
  console.log(`\n══════════ 新功能验证: ${results.length - failed.length}/${results.length} ══════════`);
  // 清理：主机中止对局（避免触发 30s 重连窗口影响后续测试）
  try { A.send({ type: 'back_to_lobby' }); } catch { /* ignore */ }
  await sleep(300);
  A.ws.close(); B2.ws.close(); B4.ws.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
