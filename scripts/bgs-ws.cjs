// ============================================================
// BoardGameSimulator — 一体服务器（host-server.cjs）自动化验证
// 页面与 ws 全部来自 8787（与手机B 真机路径完全一致）
// 用法: node scripts/bgs-ws.cjs
// ============================================================
'use strict';
const path = require('path');
const { spawn } = require('child_process');
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

async function tap(page, selectorOrText) {
  const ok = await page.evaluate((sel) => {
    const find = () => {
      if (sel.startsWith('#')) return document.querySelector(sel);
      return Array.from(document.querySelectorAll('button'))
        .find(b => (b.textContent || '').includes(sel));
    };
    const btn = find();
    if (!btn) return false;
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    return true;
  }, selectorOrText);
  if (!ok) throw new Error(`未找到可点元素: "${selectorOrText}"`);
  console.log(`  tapped: "${selectorOrText}"`);
}

async function main() {
  // 页面可访问性预检（一体服务器应已在跑：node scripts/host-server.cjs 8787）
  const res = await fetch(`${ORIGIN}/`, { signal: AbortSignal.timeout(3000) });
  if (res.status !== 200) throw new Error(`一体服务器不可达 (${ORIGIN}) status=${res.status} — 请先运行: node scripts/host-server.cjs 8787`);
  console.log(`✅ 一体服务器 ${ORIGIN} (${res.status})`);

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

    // ---------- 两个纯客户端：页面与 ws 都来自 8787 ----------
    await host.goto(`${ORIGIN}/?ws=1&role=host`, { waitUntil: 'load', timeout: 30000 });
    await guest.goto(`${ORIGIN}/?ws=1&role=guest`, { waitUntil: 'load', timeout: 30000 });
    await poll(host, () => document.querySelectorAll('.bs-grid').length >= 1, 25000, 'host 收到 state 显示布阵棋盘');
    await poll(guest, () => document.querySelectorAll('.bs-grid').length >= 1, 15000, 'guest 收到 state 显示布阵棋盘');
    record('一体服务器开局下发', true, '两端渲染布阵棋盘（页面+ws 同源 8787）');

    // ---------- 双向随机布阵 ----------
    await tap(host, '随机布阵');
    await tap(guest, '随机布阵');
    await poll(host, () => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('确认布阵')), 15000, 'host 确认按钮出现');
    await poll(guest, () => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('确认布阵')), 15000, 'guest 确认按钮出现');
    record('服务器引擎处理随机', true, '两端 placed 状态经服务器同步');

    // ---------- 确认 → 战斗 ----------
    await tap(host, '确认布阵');
    await tap(guest, '确认布阵');
    await poll(host, () => { const bv = window.__bgs?.battleView; return bv?.extra?.stage === 'battle'; }, 15000, 'host 进入战斗');
    await poll(guest, () => { const bv = window.__bgs?.battleView; return bv?.extra?.stage === 'battle'; }, 15000, 'guest 进入战斗');
    record('确认流程(服务器引擎)', true, '双方进入战斗');

    // ---------- 开火往返 ----------
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
    record('开火往返(服务器引擎)', true, 'guest 日志出现开火记录');

    const failed = results.filter(r => !r.ok);
    console.log(`\n══════════ 一体服务器验证结果: ${results.length - failed.length}/${results.length} ══════════`);
    results.forEach(r => console.log(`  [${r.ok ? 'PASS' : 'FAIL'}] ${r.name}`));
    if (pageErrors.length) console.log(`⚠️ 页面错误: ${pageErrors.join(' ; ')}`);
    process.exit(failed.length ? 1 : 0);
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
