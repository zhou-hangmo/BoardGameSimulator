// ============================================================
// 对局自然结束自动回大厅验证（phase=ended → 自动回大厅）
// 前置：node scripts/host-server.cjs 8787
// 用法: node scripts/bgs-natural-end.cjs
// ============================================================
'use strict';
const puppeteer = require('puppeteer-core');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ORIGIN = 'http://localhost:8787';
const results = [];
const pageErrors = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function poll(page, fn, timeout = 20000, desc = '条件') {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await page.evaluate(fn)) { console.log(`  ✓ ${desc}`); return; }
    } catch (e) { /* retry */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`超时: ${desc}`);
}

async function tap(page, text) {
  const ok = await page.evaluate((sel) => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => (b.textContent || '').includes(sel));
    if (!btn) return false;
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    return true;
  }, text);
  if (!ok) throw new Error(`未找到可点元素: "${text}"`);
  console.log(`  tapped: "${text}"`);
}

async function main() {
  const res = await fetch(`${ORIGIN}/`, { signal: AbortSignal.timeout(3000) });
  if (res.status !== 200) throw new Error(`服务器不可达 — 请先运行: node scripts/host-server.cjs 8787`);

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-gpu', '--mute-audio'],
  });
  try {
    const context = await browser.createBrowserContext();
    const host = await context.newPage();
    const guest = await context.newPage();
    for (const [p, tag] of [[host, 'host'], [guest, 'guest']]) {
      await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
      p.on('pageerror', e => { pageErrors.push(e.message); console.log(`  [${tag}][pageerror] ${e.message}`); });
      p.on('console', m => { if (m.type() === 'error') console.log(`  [${tag}][console.error] ${m.text().slice(0, 150)}`); });
    }

    await host.goto(`${ORIGIN}/?ws=1`, { waitUntil: 'load', timeout: 30000 });
    await guest.goto(`${ORIGIN}/?ws=1`, { waitUntil: 'load', timeout: 30000 });
    await poll(host, () => document.body.innerText.includes('2/2 人'), 15000, '大厅 2 人游戏位');

    // 发起 → 布阵
    await tap(host, '发起');
    await poll(host, () => !!document.getElementById('start-panel'), 10000, '座位面板');
    await tap(host, '发起游戏');
    await poll(host, () => document.querySelectorAll('.bs-grid').length >= 1, 15000, '布阵棋盘');

    // 双方随机布阵 + 确认
    await tap(host, '随机布阵');
    await tap(guest, '随机布阵');
    await poll(host, () => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('确认布阵')), 15000, 'host 确认按钮');
    await poll(guest, () => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('确认布阵')), 15000, 'guest 确认按钮');
    await tap(host, '确认布阵');
    await tap(guest, '确认布阵');
    await poll(host, () => { const bv = window.__bgs?.battleView; return bv?.extra?.stage === 'battle'; }, 15000, '进入战斗');

    // guest 船位（host 的攻击目标）
    const guestCells = await guest.evaluate(() => {
      const bv = window.__bgs.battleView;
      const my = bv.extra.boards[bv.view.playerIndex];
      return my.ships.flatMap(s => s.cells);
    });
    console.log(`  guest 船格: ${guestCells.length} 个`);

    // 交替开火：host 打 guest 船位，guest 空炮让回合
    let hostTurn = true;
    let fired = 0;
    const maxFires = guestCells.length + 10;
    for (const cell of guestCells) {
      if (fired >= maxFires) break;
      // host 开火
      await host.evaluate((c) => {
        const bv = window.__bgs.battleView;
        bv.emit('ui:play_action', 'battleship_fire', { cell: c });
      }, cell);
      fired++;
      await new Promise(r => setTimeout(r, 600));
      // guest 空炮（选未开火格，miss 让回合回 host）
      const guestMiss = await guest.evaluate(() => {
        const bv = window.__bgs.battleView;
        const my = bv.extra.boards[bv.view.playerIndex];
        for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
          const n = 'ABCDEFGHIJ'[c] + (r + 1);
          if (!my.shots[n]) return n;
        }
        return null;
      });
      if (guestMiss) {
        await guest.evaluate((c) => {
          const bv = window.__bgs.battleView;
          bv.emit('ui:play_action', 'battleship_fire', { cell: c });
        }, guestMiss);
        await new Promise(r => setTimeout(r, 600));
      }
    }

    // 等待自然结束 → 自动回大厅
    const backOk = await (async () => {
      try {
        await poll(host, () => {
          const bv = window.__bgs?.battleView;
          return !bv || !bv.extra || document.body.innerText.includes('游戏大厅');
        }, 30000, 'host 回大厅');
        await poll(guest, () => document.body.innerText.includes('游戏大厅'), 20000, 'guest 回大厅');
        return true;
      } catch { return false; }
    })();
    const lobbyTxt = await host.evaluate(() => document.body.innerText.slice(0, 120));
    record('对局自然结束自动回大厅', backOk && lobbyTxt.includes('游戏大厅') && lobbyTxt.includes('2 人在线'), lobbyTxt.replace(/\n/g, '|'));

    const failed = results.filter(r => !r.ok);
    console.log(`\n══════════ 结果: ${results.length - failed.length}/${results.length} ══════════`);
    process.exit(failed.length ? 1 : 0);
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
