// ============================================================
// BoardGameSimulator — 方案A（WS 服务器）自动化验证
// 启动 ws-server 子进程 → host/guest 两页 ?ws=1 → 完整一局
// 用法: node scripts/bgs-ws.cjs
// ============================================================
'use strict';
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:3000/BoardGameSimulator/';
const WS_PORT = 8787;
const results = [];
const pageErrors = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function poll(page, fn, timeout = 15000, desc = '条件') {
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
  const res = await fetch(BASE, { signal: AbortSignal.timeout(3000) });
  if (res.status !== 200) throw new Error(`dev server 不可达 (${BASE}) status=${res.status}`);
  console.log(`✅ dev server ${BASE} (${res.status})`);

  // 启动 ws-server 子进程
  const srv = spawn('node', [path.join(__dirname, 'ws-server.cjs'), String(WS_PORT)], {
    cwd: path.join(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stdout.on('data', d => console.log(`  [ws-server] ${d.toString().trim()}`));
  await new Promise(r => setTimeout(r, 1500));

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-gpu', '--mute-audio'],
  });

  try {
    const context = await browser.createBrowserContext();
    const host = await context.newPage();
    const guest = await context.newPage();
    for (const p of [host, guest]) {
      await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
      p.on('pageerror', e => { pageErrors.push(`pageerror: ${e.message}`); console.log(`  [${p === host ? 'host' : 'guest'}][pageerror] ${e.message}`); });
      p.on('console', m => { if (m.type() === 'error') { pageErrors.push(`console.error: ${m.text()}`); console.log(`  [${p === host ? 'host' : 'guest'}][console.error] ${m.text().slice(0, 200)}`); } });
    }

    // ---------- host: ?ws=1 自动建房间 ----------
    await host.goto(`${BASE}?ws=1&role=host`, { waitUntil: 'load', timeout: 30000 });
    await poll(host, () => !!document.querySelector('.room-code'), 15000, 'host 房间大厅');
    record('WS host 建房间', true, 'room-code 出现');

    // ---------- guest: ?ws=1 自动加入 ----------
    await guest.goto(`${BASE}?ws=1&role=guest`, { waitUntil: 'load', timeout: 30000 });
    await poll(host, () => {
      const btn = document.querySelector('#btn-start');
      return btn && !btn.disabled;
    }, 15000, 'host 满员 2/2');
    record('WS guest 接入', true, 'host 满员，开始可用');

    // ---------- 开始游戏 → guest 收到 state ----------
    await tap(host, '#btn-start');
    await poll(guest, () => document.querySelectorAll('.bs-grid').length >= 1, 20000, 'guest 收到 state 显示布阵棋盘');
    record('WS host→guest 下发', true, 'guest 渲染棋盘');

    // ---------- 双向动作 ----------
    await tap(guest, '随机布阵');
    await tap(host, '随机布阵');
    await poll(guest, () => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('确认布阵')), 15000, 'guest 确认按钮出现');
    await poll(host, () => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('确认布阵')), 15000, 'host 确认按钮出现');
    await tap(guest, '确认布阵');
    await tap(host, '确认布阵');
    await poll(host, () => {
      const bv = window.__bgs?.battleView;
      return bv?.extra?.stage === 'battle';
    }, 15000, '双方确认进入战斗（guest 动作经 WS 到达 host）');
    record('WS guest→host 往返', true, 'host 进入战斗阶段');

    // ---------- 开火 ----------
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
    record('WS 开火往返', true, 'guest 日志出现开火记录');

    const failed = results.filter(r => !r.ok);
    console.log(`\n══════════ WS 验证结果: ${results.length - failed.length}/${results.length} ══════════`);
    results.forEach(r => console.log(`  [${r.ok ? 'PASS' : 'FAIL'}] ${r.name}`));
    if (pageErrors.length) console.log(`⚠️ 页面错误: ${pageErrors.join(' ; ')}`);
    process.exit(failed.length ? 1 : 0);
  } finally {
    await browser.close();
    srv.kill();
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
