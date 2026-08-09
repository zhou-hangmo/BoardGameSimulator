// ============================================================
// collectAddresses 分类/过滤验证（模拟蜂窝+WiFi+占位+CGN）
// 用法: node scripts/bgs-addr.cjs
// ============================================================
'use strict';

// 复制服务器 collectAddresses 逻辑（独立验证，与 host-server 保持同步）
function v6Rank(addr) { const a = addr.toLowerCase(); return a.includes('ff:fe') ? 1 : 0; }
function isPlaceholder(addr) { return addr.toLowerCase().endsWith('::1'); }

function collectAddresses(nets) {
  const wan = []; const lanV4 = []; const lanV6 = [];
  for (const name of Object.keys(nets)) {
    const isCell = /rmnet|ccmni|radio|wwan/i.test(name);
    const isLan = /wlan|eth|enp|ens/i.test(name);
    for (const ni of nets[name] ?? []) {
      if (ni.internal) continue;
      const fam = String(ni.family).toLowerCase();
      const addr = ni.address;
      if (fam.includes('6')) {
        if (addr.toLowerCase().startsWith('fe80')) continue;
        if (isCell) wan.push(addr);
        else if (isLan) lanV6.push(addr);
        else wan.push(addr);
      } else {
        if (isCell) continue;
        if (isLan) lanV4.push(addr);
        else lanV4.push(addr);
      }
    }
  }
  wan.sort((a, b) => v6Rank(a) - v6Rank(b));
  lanV6.sort((a, b) => v6Rank(a) - v6Rank(b));
  return {
    wan: wan.filter(a => !isPlaceholder(a)),
    lanV4,
    lanV6: lanV6.filter(a => !isPlaceholder(a)),
  };
}

const fakeNets = {
  rmnet0: [
    { family: 'IPv6', address: '240e:465:170:5602:4df7:786b:61fc:d20a', internal: false },  // 蜂窝隐私（公网）
    { family: 'IPv6', address: '240e:565:370:16f::1', internal: false },                   // 蜂窝占位（应过滤）
    { family: 'IPv4', address: '172.29.225.105', internal: false },                        // 蜂窝 CGN（应排除）
  ],
  wlan0: [
    { family: 'IPv6', address: '240e:37a:7a:6100:f817:6161:bcb7:5c6b', internal: false },  // WiFi 隐私（局域网 v6）
    { family: 'IPv6', address: 'fe80::b08e:f0ff:fe71:9ce7', internal: false },             // link-local（应排除）
    { family: 'IPv4', address: '192.168.1.8', internal: false },                           // WiFi v4（局域网）
  ],
  lo: [
    { family: 'IPv4', address: '127.0.0.1', internal: true },                              // 内部（应排除）
  ],
};

const r = collectAddresses(fakeNets);
const ok1 = r.wan.length === 1 && r.wan[0] === '240e:465:170:5602:4df7:786b:61fc:d20a';
const ok2 = r.lanV4.length === 1 && r.lanV4[0] === '192.168.1.8';
const ok3 = r.lanV6.length === 1 && r.lanV6[0] === '240e:37a:7a:6100:f817:6161:bcb7:5c6b';
console.log(`wan(公网v6): ${JSON.stringify(r.wan)}`);
console.log(`lanV4: ${JSON.stringify(r.lanV4)}`);
console.log(`lanV6: ${JSON.stringify(r.lanV6)}`);
console.log(`[${ok1 && ok2 && ok3 ? 'PASS' : 'FAIL'}] 分类/过滤正确（占位过滤、CGN 排除、link-local 排除、internal 排除）`);
process.exit(ok1 && ok2 && ok3 ? 0 : 1);
