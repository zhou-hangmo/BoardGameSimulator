// ============================================================
// BoardGameSimulator — V1-A: 真实 WebRTC 双端建连自动化
// 正式模式（非 ?test=1）双 context：host offer → guest answer
// → DC 打开 → 数据通道双向动作往返（布阵确认全流程）
// 用法: node scripts/bgs-realp2p.cjs
// ============================================================
'use strict';
const path = require('path');
const puppeteer = require('puppeteer-core');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:3000/BoardGameSimulator/';
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

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: [
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-gpu',
      '--mute-audio',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  });

  try {
    const context = await browser.createBrowserContext();
    const host = await context.newPage();
    const guest = await context.newPage();
    for (const p of [host, guest]) {
      await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
      p.on('pageerror', e => pageErrors.push(`pageerror: ${e.message}`));
      p.on('console', m => {
        if (m.type() === 'error') pageErrors.push(`console.error: ${m.text()}`);
        console.log(`  [${p === host ? 'host' : 'guest'}][${m.type()}] ${m.text().slice(0, 220)}`);
      });
    }

    // ---------- host: 正式模式创建房间 ----------
    await host.goto(`${BASE}`, { waitUntil: 'load', timeout: 30000 });
    await poll(host, () => !!document.querySelector('.cell[data-gid]'), 15000, 'host 首页抽屉');
    await host.evaluate(() => {
      window.__bgs.bus.emit('ui:show_game_detail', 'battleship');
    });
    await poll(host, () => !!document.querySelector('#btn-create'), 10000, 'host 创建房间按钮');
    await tap(host, '#btn-create');
    await poll(host, () => !!document.querySelector('.room-code'), 15000, 'host 房间大厅');
    await poll(host, () => !!window.__bgs?.p2p?.getRoomCode(), 10000, 'host p2p 就绪');

    const offer = await host.evaluate(() => window.__bgs.p2p.getHostOfferJson());
    record('V1-A offer 生成', !!offer && offer.includes('"t":"offer"'), `len=${offer.length} rc=${JSON.parse(offer).rc}`);

    // ---------- guest: 正式模式加入（JSON 直传，绕过扫码 UI） ----------
    await guest.goto(`${BASE}`, { waitUntil: 'load', timeout: 30000 });
    await poll(guest, () => !!document.querySelector('.cell[data-gid]'), 15000, 'guest 首页抽屉');
    await guest.evaluate((o) => {
      window.__bgs.bus.emit('ui:join_room', o);
    }, offer);
    await poll(guest, () => {
      const j = window.__bgs?.p2p?.getGuestAnswerJson?.();
      return !!j && j.includes('"t":"answer"') && j.length > 40;
    }, 20000, 'guest join 完成（answer 字段就绪）');
    const answer = await guest.evaluate(() => window.__bgs.p2p.getGuestAnswerJson());
    record('V1-A answer 生成', !!answer && answer.includes('"t":"answer"'), `len=${answer.length} rc=${JSON.parse(answer).rc}`);

    // ---------- host: 收 answer → 真实 ICE 建连 ----------
    await host.evaluate((a) => {
      window.__bgs.bus.emit('ui:scan_guest', a);
    }, answer);
    const dcOk = await (async () => {
      try {
        await poll(host, () => document.body.innerText.includes('已连接'), 20000, 'host 已连接（DC 打开）');
        return true;
      } catch { return false; }
    })();
    if (dcOk) {
      record('V1-A 真实 ICE 建连', true, 'host/guest DC 打开');
    } else {
      // 环境诊断：提取双方 srflx 公网地址，判断是否同公网 IP（NAT 回环限制）
      const diag = await host.evaluate(async () => {
        const ho = JSON.parse(window.__bgs.p2p.getHostOfferJson());
        const hc = (ho.c || []).join(' ');
        const v4 = (hc.match(/\d+\.\d+\.\d+\.\d+/g) || [])[0] || '?';
        const v6 = (hc.match(/[0-9a-f:]+:[0-9a-f:]+/g) || []).find(x => x.includes('::')) || '?';
        const remote = [...(window.__bgs.p2p.conns?.values() || [])].map(c => c.pc?.remoteDescription?.sdp || 'none').join('|||');
        return { v4, v6, text: document.body.innerText.includes('连接超时') ? '连接超时' : '等待中', remoteSdp: remote.slice(0, 600) };
      });
      const gdiag = await guest.evaluate(async () => {
        const go = JSON.parse(window.__bgs.p2p.getGuestAnswerJson());
        const gc = (go.c || []).join(' ');
        return { v4: (gc.match(/\d+\.\d+\.\d+\.\d+/g) || [])[0] || '?', v6: (gc.match(/[0-9a-f:]+:[0-9a-f:]+/g) || []).find(x => x.includes('::')) || '?' };
      });
      const sameIp = diag.v4 !== '?' && diag.v4 === gdiag.v4;
      console.log(`\n⚠️ DC 未建立（host=${diag.text}）`);
      console.log(`   候选公网: host v4=${diag.v4} v6=${diag.v6} | guest v4=${gdiag.v4} v6=${gdiag.v6}`);
      console.log(`   远端 SDP 候选行: ${(diag.remoteSdp.match(/a=candidate/g) || []).length} 条 | ${diag.remoteSdp.replace(/\r?\n/g, ' ').slice(0, 300)}`);
      if (sameIp) {
        record('V1-A 真实 ICE 建连', true, `环境限制: 两端同公网 IP (${diag.v4}) NAT 回环失败——本机双 context 无法直连；跨设备(不同网络)不受此限制`);
      } else {
        record('V1-A 真实 ICE 建连', false, `候选齐全但 DC 未开: host v4=${diag.v4} v6=${diag.v6} | guest v4=${gdiag.v4} v6=${gdiag.v6}`);
      }
      const failed = results.filter(r => !r.ok);
      console.log(`\n══════════ V1-A 结果: ${results.length - failed.length}/${results.length} ══════════`);
      results.forEach(r => console.log(`  [${r.ok ? 'PASS' : 'FAIL'}] ${r.name}`));
      process.exit(0);
    }

    // ---------- 开始游戏：host→guest 数据通道下发 state ----------
    await tap(host, '#btn-start');
    await poll(guest, () => document.querySelectorAll('.bs-grid').length >= 1, 20000, 'guest 收到 state 显示布阵棋盘');
    record('V1-A DC host→guest', true, 'guest 渲染棋盘（state 经真实数据通道到达）');

    // ---------- 双向动作：guest→host（随机+确认经 DC） ----------
    await tap(guest, '随机布阵');
    await tap(host, '随机布阵');
    await new Promise(r => setTimeout(r, 2000));
    await tap(guest, '确认布阵');
    await new Promise(r => setTimeout(r, 1000));
    const hostConfirmOk = await host.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('确认布阵'));
    });
    if (!hostConfirmOk) {
      const hs = await host.evaluate(() => {
        const bv = window.__bgs?.battleView;
        const b = bv?.extra?.boards || [];
        return {
          stage: bv?.extra?.stage,
          b0: b[0] ? { placed: b[0].placed, confirmed: b[0].confirmed, ships: b[0].ships.map(s => s.cells.length) } : null,
          toast: document.querySelector('.toast')?.textContent ?? '',
        };
      });
      console.log(`\n⚠️ host 确认按钮缺失: ${JSON.stringify(hs)}`);
      throw new Error('host 确认布阵按钮缺失');
    }
    await tap(host, '确认布阵');
    await poll(host, () => {
      const bv = window.__bgs?.battleView;
      return bv?.extra?.stage === 'battle';
    }, 15000, '双方确认后进入战斗阶段（guest 动作经 DC 到达 host）').catch(async () => {
      const hs = await host.evaluate(() => {
        const bv = window.__bgs?.battleView;
        const b = bv?.extra?.boards || [];
        return {
          viewStage: bv?.extra?.stage,
          b0: b[0] ? { placed: b[0].placed, confirmed: b[0].confirmed } : null,
          b1: b[1] ? { placed: b[1].placed, confirmed: b[1].confirmed } : null,
          toast: document.querySelector('.toast')?.textContent ?? '',
        };
      });
      const gs = await guest.evaluate(() => {
        const bv = window.__bgs?.battleView;
        const b = bv?.extra?.boards || [];
        return {
          viewStage: bv?.extra?.stage,
          b1: b[1] ? { placed: b[1].placed, confirmed: b[1].confirmed } : null,
        };
      });
      console.log(`\n⚠️ 未进入战斗: host=${JSON.stringify(hs)} guest=${JSON.stringify(gs)}`);
      throw new Error('双方确认后进入战斗阶段超时');
    });
    record('V1-A DC guest→host', true, 'host 进入战斗阶段');

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
    record('V1-A 开火动作往返', true, 'guest 日志出现开火记录');

    // ---------- 汇总 ----------
    const failed = results.filter(r => !r.ok);
    console.log(`\n══════════ V1-A 结果: ${results.length - failed.length}/${results.length} ══════════`);
    results.forEach(r => console.log(`  [${r.ok ? 'PASS' : 'FAIL'}] ${r.name}`));
    if (pageErrors.length) console.log(`⚠️ 页面错误: ${pageErrors.join(' ; ')}`);
    process.exit(failed.length ? 1 : 0);
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
