// ============================================================
// BoardGameSimulator — 大厅流程自动化验证
// 2 玩家接入 → 大厅状态 → 主机发起（座位分配）→ 游戏 → 中止回大厅
// 前置：node scripts/host-server.cjs 8787
// 用法: node scripts/bgs-ws.cjs
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
    } catch (e) {
      console.log(`  (页面计算异常: ${e.message}，继续轮询)`);
    }
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
  if (res.status !== 200) throw new Error(`大厅服务器不可达 (${ORIGIN}) — 请先运行: node scripts/host-server.cjs 8787`);
  console.log(`✅ 大厅服务器 ${ORIGIN} (${res.status})`);

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
      p.on('pageerror', e => { pageErrors.push(`pageerror: ${e.message}`); console.log(`  [${tag}][pageerror] ${e.message}`); });
      p.on('console', m => { if (m.type() === 'error') { pageErrors.push(`console.error: ${m.text()}`); console.log(`  [${tag}][console.error] ${m.text().slice(0, 200)}`); } });
    }

    // ---------- 1. 两玩家接入大厅（自动分配游戏位） ----------
    await host.goto(`${ORIGIN}/?ws=1`, { waitUntil: 'load', timeout: 30000 });
    await guest.goto(`${ORIGIN}/?ws=1`, { waitUntil: 'load', timeout: 30000 });
    await poll(host, () => document.body.innerText.includes('游戏大厅') && document.body.innerText.includes('2 人在线'), 15000, 'host 大厅 2 人在线');
    await poll(host, () => document.body.innerText.includes('2/2 人'), 10000, '游戏位自动分配 2/2');
    await poll(guest, () => document.body.innerText.includes('游戏大厅'), 10000, 'guest 大厅');
    const lobbyTxt = await host.evaluate(() => document.body.innerText.slice(0, 160));
    record('玩家接入大厅(自动分配)', lobbyTxt.includes('2 人在线') && lobbyTxt.includes('2/2 人') && lobbyTxt.includes('海战棋'), lobbyTxt.replace(/\n/g, '|'));

    // ---------- 2. 手动切回观战（胶囊可切换） ----------
    await host.evaluate(() => {
      const btn = document.querySelector('[data-pid="player-0"] [data-seat="spectator"]');
      btn?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    });
    await poll(host, () => document.body.innerText.includes('1/2 人'), 10000, '游戏位计数变 1/2');
    await host.evaluate(() => {
      const btn = document.querySelector('[data-pid="player-0"] [data-seat="player"]');
      btn?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    });
    await poll(host, () => document.body.innerText.includes('2/2 人'), 10000, '切回游戏位 2/2');
    record('座位手动切换', true, '胶囊切换 游戏↔观战');

    // ---------- 3. 主机发起（座位面板默认按声明） ----------
    await tap(host, '发起');
    await poll(host, () => !!document.getElementById('start-panel'), 10000, '座位面板出现');
    await tap(host, '发起游戏');

    // ---------- 4. 进入游戏（布阵） ----------
    await poll(host, () => document.querySelectorAll('.bs-grid').length >= 1, 20000, 'host 布阵棋盘');
    await poll(guest, () => document.querySelectorAll('.bs-grid').length >= 1, 15000, 'guest 布阵棋盘');
    record('发起游戏→布阵', true, '两端渲染棋盘');

    // ---------- 5. 随机→确认→战斗 ----------
    await tap(host, '随机布阵');
    await tap(guest, '随机布阵');
    await poll(host, () => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('确认布阵')), 15000, 'host 确认按钮');
    await poll(guest, () => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('确认布阵')), 15000, 'guest 确认按钮');
    await tap(host, '确认布阵');
    await tap(guest, '确认布阵');
    await poll(host, () => { const bv = window.__bgs?.battleView; return bv?.extra?.stage === 'battle'; }, 15000, 'host 进入战斗');
    record('对局流程(大厅会话)', true, '双方进入战斗');

    // ---------- 6. 开火往返 ----------
    await host.evaluate(() => {
      const bv = window.__bgs.battleView;
      if (!bv) return;
      const my = bv.extra.boards[bv.view.playerIndex];
      const target = my.ships.flatMap(s => s.cells)[0];
      bv.emit('ui:play_action', 'battleship_fire', { cell: target });
    });
    await poll(guest, () => {
      const bv = window.__bgs?.battleView;
      return bv?.extra?.stage === 'battle' && (bv.extra.log || []).length > 0;
    }, 10000, 'guest 收到开火记录');
    record('开火往返', true, 'guest 日志出现开火记录');

    // ---------- 7. 主机中止 → 回大厅（常驻不退出） ----------
    await tap(host, '中止回大厅');
    await poll(host, () => document.body.innerText.includes('游戏大厅') && document.body.innerText.includes('2 人在线'), 15000, 'host 回大厅且 2 人仍在线');
    await poll(guest, () => document.body.innerText.includes('游戏大厅'), 15000, 'guest 回大厅');
    const backTxt = await host.evaluate(() => document.body.innerText.slice(0, 100));
    record('结束回大厅(常驻)', backTxt.includes('2 人在线') && backTxt.includes('海战棋'), backTxt.replace(/\n/g, '|'));

    const failed = results.filter(r => !r.ok);
    console.log(`\n══════════ 大厅流程验证结果: ${results.length - failed.length}/${results.length} ══════════`);
    results.forEach(r => console.log(`  [${r.ok ? 'PASS' : 'FAIL'}] ${r.name}`));
    if (pageErrors.length) console.log(`⚠️ 页面错误: ${pageErrors.join(' ; ')}`);
    process.exit(failed.length ? 1 : 0);
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
