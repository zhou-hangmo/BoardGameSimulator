// 查看 PC 当前 diag6 模块②候选（验证 WARP 断开后出口变化）
const puppeteer = require('puppeteer-core');
const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EXE,
    headless: true,
    args: ['--disable-gpu', '--mute-audio'],
  });
  const page = await browser.newPage();
  await page.goto('https://zhou-hangmo.github.io/BoardGameSimulator/diag6.html', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 10000));
  const m2 = await page.evaluate(() => (document.getElementById('m2') || {}).innerText || '');
  console.log(m2);
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
