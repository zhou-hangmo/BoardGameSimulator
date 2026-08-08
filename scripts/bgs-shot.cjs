// ============================================================
// BoardGameSimulator — 冒烟/探针脚本（puppeteer-core + Edge 无头）
// 自轮询 + 强诊断：任何等待超时都会 dump 页面现场证据
// 用法:
//   node scripts/bgs-shot.cjs --probe  最小连通性检查
//   node scripts/bgs-shot.cjs           全流程冒烟
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:3000/BoardGameSimulator/';
const SHOT_DIR = path.join(__dirname, '..', 'screenshots');
const PROBE = process.argv.includes('--probe');

const results = [];
const pageErrors = [];
const pageLogs = [];
let shotSeq = 0;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function shot(page, label) {
  shotSeq++;
  const file = path.join(SHOT_DIR, `${String(shotSeq).padStart(2, '0')}-${label}.png`);
  try {
    await Promise.race([
      page.screenshot({ path: file }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('screenshot 超时')), 15000)),
    ]);
    console.log(`   📸 ${file}`);
  } catch (e) {
    console.log(`   ⚠️ 截图失败(${e.message}): ${file}`);
  }
  return file;
}

/** 页面现场 dump（超时诊断用） */
async function dumpPage(page, tag) {
  const info = await page.evaluate(() => {
    const grid = document.querySelector('.bs-grid');
    return {
      bodyText: (document.body.innerText || '').slice(0, 300).replace(/\n/g, ' | '),
      gridCount: document.querySelectorAll('.bs-grid').length,
      gridShape: grid ? `${grid.querySelectorAll('.bs-cell').length}格 ${grid.getBoundingClientRect().width.toFixed(0)}x${grid.getBoundingClientRect().height.toFixed(0)}` : '无',
      appClasses: (document.getElementById('app') || {}).children
        ? Array.from(document.getElementById('app').children).map(c => c.className || c.tagName).join(',')
        : '?',
      startDisabled: (() => { const b = document.querySelector('#btn-start'); return b ? b.disabled : '无按钮'; })(),
    };
  });
  console.log(`\n⚠️ ${tag} 现场:${info.bodyText ? '\n  text: ' + info.bodyText : ''}${info.gridCount ? `\n  grid: ${info.gridCount} 个,${info.gridShape}` : ''}\n  app: ${info.app} | 开始按钮: ${info.startDisabled}`);
}

/** 自轮询：500ms 检查，deadline 超时 dump 现场并抛错 */
async function poll(page, fn, timeout = 12000, desc = '条件') {
  console.log(`→ 等待: ${desc} ...`);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await page.evaluate(fn)) {
        console.log(`  ✓ ${desc}`);
        return;
      }
    } catch (e) {
      console.log(`  (页面计算异常: ${e.message}，继续轮询)`);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  await dumpPage(page, `超时: ${desc}`);
  throw new Error(`超时: ${desc}`);
}

/** 触发 pointerdown（应用内按钮均监听 pointerdown） */
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
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(3000) });
    if (res.status !== 200) throw new Error(`status ${res.status}`);
    console.log(`✅ dev server ${BASE} (${res.status})`);
  } catch (e) {
    throw new Error(`dev server 不可达 (${BASE}): ${e.message}`);
  }

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: [
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-gpu',
      '--mute-audio',
    ],
  });
  try {
    const context = await browser.createBrowserContext();
    const host = await context.newPage();
    await host.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    for (const p of [host]) {
      p.on('pageerror', e => pageErrors.push(`pageerror: ${e.message}`));
      p.on('console', m => {
        const t = m.text();
        pageLogs.push(`[${m.type()}] ${t}`);
        if (m.type() === 'error') pageErrors.push(`console.error: ${t}`);
      });
    }

    // ---------- Probe: 最小连通性 ----------
    await host.goto(`${BASE}?test=1&game=battleship&role=host`, { waitUntil: 'load', timeout: 30000 });
    await poll(host, () => !!document.querySelector('.room-code'), 15000, 'host 大厅出现 (probe)');
    const probeErrors = pageErrors.slice();
    const probeText = await host.$eval('.room-code', el => el.textContent || '');
    record('probe 浏览器链路+HBuilder', probeText.includes('000000'), `房间码="${probeText.trim().split('\n')[0]}"`);
    record('probe 无 JS 错误', probeErrors.length === 0, probeErrors.join(' ; ') || 'clean');
    await shot(host, 'probe-host-lobby');
    if (PROBE) {
      const fails = results.filter(r => !r.ok);
      console.log(`\nPROBE 结果: ${results.length - fails.length}/${results.length}`);
      process.exit(fails.length ? 1 : 0);
    }

    // ---------- 全流程 ----------
    const guest = await context.newPage();
    await guest.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    for (const p of [guest]) {
      p.on('pageerror', e => pageErrors.push(`pageerror: ${e.message}`));
      p.on('console', m => { if (m.type() === 'error') pageErrors.push(`console.error: ${m.text()}`); });
    }

    // guest 自动入房
    await guest.goto(`${BASE}?test=1&game=battleship&role=guest`, { waitUntil: 'load', timeout: 30000 });
    await poll(guest, () => !!document.querySelector('.room-code'), 15000, 'guest 自动入房');

    // 满员 → 开始
    await poll(host, () => {
      const b = document.querySelector('#btn-start');
      return b && !b.disabled;
    }, 25000, 'host 满员 2/2 开始可用');
    const playersText = await host.evaluate(() => (document.querySelector('.section-hdr') || {}).textContent || '');
    record('1 房间满员', playersText.includes('(2/2)'), playersText.trim());
    await tap(host, '#btn-start');
    console.log('  [开始游戏已点击]');

    // 布阵界面（重点：棋盘）
    await poll(host, () => document.querySelectorAll('.bs-grid').length >= 1, 20000, 'host 布阵棋盘出现');
    await poll(guest, () => document.querySelectorAll('.bs-grid').length >= 1, 20000, 'guest 布阵棋盘出现');

    const gridInfo = await host.evaluate(() => {
      const grid = document.querySelector('.bs-grid');
      if (!grid) return { cells: 0, w: 0, h: 0, visible: false, display: '', cellBg: '', cssLoaded: false };
      const rect = grid.getBoundingClientRect();
      const cell = grid.querySelector('.bs-cell');
      const cs = getComputedStyle(grid);
      return {
        cells: grid.querySelectorAll('.bs-cell').length,
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        visible: rect.width > 0 && rect.height > 0 && (grid.offsetParent !== null),
        display: cs.display,
        cols: cs.gridTemplateColumns.split(' ').length,
        cellBg: cell ? getComputedStyle(cell).backgroundColor : '',
        cssLoaded: cs.display === 'grid' && !!cell && getComputedStyle(cell).borderColor !== 'rgb(0, 0, 0)',
      };
    });
    const btnCount = await host.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => /横向|纵向|转向|随机布阵/.test(t)));
    record('4 布阵棋盘渲染',
      gridInfo.cells === 100 && gridInfo.visible && gridInfo.w > 200 && gridInfo.h > 100 && gridInfo.cssLoaded,
      `格子=${gridInfo.cells} 尺寸=${gridInfo.w}x${gridInfo.h} 可见=${gridInfo.visible} display=${gridInfo.display} 列=${gridInfo.cols} 格背景=${gridInfo.cellBg} 按钮=[${btnCount.join('|')}]`);
    await shot(host, '4-host-placement');

    // ---------- 4c 拖拽：条带尺寸=格子、空格转向、锚点落位（列表=中间拿，悬停 C3 对准中间格→船头 A1） ----------
    const geom = await host.evaluate(() => {
      const cell = document.querySelector('.bs-grid .bs-cell');
      const carrier = Array.from(document.querySelectorAll('div')).find(d => d.textContent.trim() === '航母(5)');
      const c3 = document.querySelector('[data-cell="C3"]');
      const cr = carrier.getBoundingClientRect();
      const c3r = c3.getBoundingClientRect();
      return {
        cellW: cell.getBoundingClientRect().width,
        carrierX: cr.left + cr.width / 2,
        carrierY: cr.top + cr.height / 2,
        c3X: c3r.left + c3r.width / 2,
        c3Y: c3r.top + c3r.height / 2,
      };
    });
    await host.mouse.move(geom.carrierX, geom.carrierY);
    await host.mouse.down();
    await new Promise(r => setTimeout(r, 200));
    const ghostAtDn = await host.evaluate(() => {
      const g = document.querySelector('.bs-drag-ghost');
      if (!g) return null;
      const b = g.firstElementChild.getBoundingClientRect();
      return { w: b.width, dir: getComputedStyle(g).flexDirection };
    });
    record('4c 拖拽条带=格子尺寸', !!ghostAtDn && Math.abs(ghostAtDn.w - geom.cellW) <= 1, JSON.stringify({ cell: geom.cellW, ghost: ghostAtDn }));
    await host.keyboard.press('Space');
    await new Promise(r => setTimeout(r, 150));
    const ghostAfterSpace = await host.evaluate(() => {
      const g = document.querySelector('.bs-drag-ghost');
      return g ? getComputedStyle(g).flexDirection : null;
    });
    record('4c 空格转向(拖拽中)', ghostAfterSpace === 'column', JSON.stringify(ghostAfterSpace));
    await host.mouse.move(geom.c3X, geom.c3Y, { steps: 6 });
    await host.mouse.up();
    await new Promise(r => setTimeout(r, 400));
    const placedC1 = await host.evaluate(() => {
      const c = document.querySelector('[data-cell="C1"]');
      return c ? getComputedStyle(c).backgroundColor : '';
    });
    const placedC3 = await host.evaluate(() => {
      const c = document.querySelector('[data-cell="C3"]');
      return c ? getComputedStyle(c).backgroundColor : '';
    });
    const ghost2 = await host.evaluate(() => !!document.querySelector('.bs-drag-ghost'));
    record('4c 拖放落位成功', placedC1 === 'rgb(74, 123, 217)' && placedC3 === 'rgb(74, 123, 217)' && !ghost2, `C1=${placedC1} C3=${placedC3} ghost余留=${ghost2}`);

    // 双方随机布阵 → 确认 → 战斗
    await tap(host, '随机布阵');
    await tap(guest, '随机布阵');
    await poll(host, () => {
      return Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('确认布阵'));
    }, 10000, 'host 确认布阵按钮出现');
    const confirmBtn = await host.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('确认布阵'));
      return b ? b.textContent.trim() : null;
    });
    record('4b 确认布阵按钮出现', confirmBtn === '✓ 确认布阵', JSON.stringify(confirmBtn));
    await tap(host, '确认布阵');
    await tap(guest, '确认布阵');
    await new Promise(r => setTimeout(r, 1500));
    const diag = await host.evaluate(async () => {
      const bgs = (window).__bgs;
      if (!bgs) return { hook: false };
      const bv = bgs.battleView;
      const st = bgs.engine.getState();
      const boards = st.extra?.boards;
      const bvJson = {
        viewIdx: bv?.view?.playerIndex,
        viewPhase: bv?.view?.phase,
        boardsLen: bv?.extra?.boards?.length,
        myPlaced: boards ? boards[bgs.myIdx]?.placed : undefined,
        myConfirmed: boards ? boards[bgs.myIdx]?.confirmed : undefined,
        stateShips0: boards?.[0]?.ships?.length,
        stage: boards?.[0]?.stage,
      };
      return { hook: true, battleView: bvJson };
    });
    console.log(`  [诊断 battleView] ` + JSON.stringify(diag.battleView));
    await poll(host, () => document.querySelectorAll('.bs-grid').length >= 2, 30000, 'host 战斗双棋盘');
    await poll(guest, () => document.querySelectorAll('.bs-grid').length >= 2, 30000, 'guest 战斗双棋盘');

    const battleInfo = await host.evaluate(() => ({
      count: document.querySelectorAll('.bs-grid').length,
      status: (document.querySelector('.nav-bar span:last-child') || {}).textContent || '',
      legend: /航母|战列舰|巡洋舰|潜艇|巡逻艇/.test(document.body.textContent),
    }));
    record('5 战斗阶段', battleInfo.count === 2, `棋盘=${battleInfo.count} 状态="${battleInfo.status}" 图例=${battleInfo.legend}`);
    await shot(host, '5-host-battle');
    await shot(guest, '5-guest-battle');

    // host 开火 A1
    await poll(host, () => {
      const st = document.querySelector('.nav-bar span:last-child');
      return st && st.textContent.includes('你的回合');
    }, 15000, 'host 回合');
    await host.evaluate(() => {
      const grids = Array.from(document.querySelectorAll('.bs-grid'));
      const enemyGrid = grids[grids.length - 1];
      const cell = enemyGrid.querySelector('[data-cell="A1"]');
      if (!cell) throw new Error('敌方 A1 未找到');
      cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    });
    await poll(host, () => /(命中|未中|击沉) A/.test(document.body.textContent), 20000, '开火日志出现');
    const fireInfo = await host.evaluate(() => {
      const grids = Array.from(document.querySelectorAll('.bs-grid'));
      const enemyGrid = grids[grids.length - 1];
      const a1 = enemyGrid.querySelector('[data-cell="A1"]');
      const m = (document.body.textContent || '').match(/(你|玩家[\s\S]*?)(命中|未中|击沉[\s\S]*?)A1/);
      return { shotMark: !!a1 && !!a1.querySelector('.bs-mark'), logLine: m ? m[0] : '' };
    });
    record('6 开火 A1', fireInfo.shotMark, `标记=${fireInfo.shotMark} 日志="${fireInfo.logLine.trim()}"`);
    await shot(host, '6-host-after-fire');

    // ---------- 7 游戏结束 → 返回大厅 ----------
    const endInfo = await host.evaluate(async () => {
      const bgs = (window).__bgs;
      const engine = bgs.engine;
      const boards = engine.getState().extra.boards;
      const enemyShips = boards[1].ships.map(s => s.cells).flat();
      const emptyP0 = [];
      for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
        const name = String.fromCharCode(65 + c) + (r + 1);
        if (!boards[0].ships.some(s => s.cells.includes(name))) emptyP0.push(name);
      }
      const fire = (idx, cell) => engine.dispatch({
        type: 'battleship_fire', playerIndex: idx, payload: { cell }, timestamp: Date.now(),
      });
      let k = 0;
      for (const cell of enemyShips) {
        if (engine.getState().currentTurn !== 0) await fire(1, emptyP0[k++]);
        await fire(0, cell);
        if (engine.getState().phase === 'ended') break;
      }
      bgs.broadcast();
      const s2 = engine.getState();
      return { phase: s2.phase, winner: s2.winner };
    });
    record('7 对局结束', endInfo.phase === 'ended' && endInfo.winner === 0, JSON.stringify(endInfo));
    await poll(host, () => {
      const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('返回大厅'));
      return !!b;
    }, 10000, '胜负 overlay 返回大厅按钮');
    await tap(host, '返回大厅');
    await poll(host, () => !!document.querySelector('.room-code'), 15000, 'host 回到大厅');
    const lobbyOk = await host.evaluate(() => {
      const startBtn = document.querySelector('#btn-start');
      return {
        room: (document.querySelector('.room-code')?.textContent || '').trim().split('\n')[0],
        startDisabled: startBtn ? startBtn.disabled : '无按钮',
      };
    });
    record('8 返回大厅后可重开', lobbyOk.room === '000000' && lobbyOk.startDisabled === false, JSON.stringify(lobbyOk));
    await shot(host, '8-host-back-to-lobby');

    // 汇总
    const failed = results.filter(r => !r.ok);
    console.log('\n══════════ 冒烟结果 ══════════');
    for (const r of results) console.log(`  [${r.ok ? 'PASS' : 'FAIL'}] ${r.name}`);
    console.log(`  ✅ ${results.filter(r => r.ok).length}/${results.length}`);
    const l3 = pageLogs.filter(l => l.includes('[L3]') || l.includes('INVALID_ACTION') || l.includes('L3_VALIDATION'));
    if (l3.length) {
      console.log('\n🟡 关键页面日志:');
      for (const l of l3.slice(-20)) console.log('  ' + l);
    }
    if (pageErrors.length) {
      console.log('\n⚠️ 浏览器错误:');
      for (const e of [...new Set(pageErrors)].slice(0, 10)) console.log('  ' + e);
    } else {
      console.log('\n✅ 无浏览器 pageerror/console.error');
    }
    console.log(`\n截图目录: ${SHOT_DIR}`);
    process.exit(failed.length ? 1 : 0);
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('冒烟脚本异常:', err.stack || err.message);
  if (pageLogs.length) {
    console.log('\n🟡 页面日志尾部(40):');
    for (const l of pageLogs.slice(-40)) console.log('  ' + l.slice(0, 300));
  }
  process.exit(2);
});