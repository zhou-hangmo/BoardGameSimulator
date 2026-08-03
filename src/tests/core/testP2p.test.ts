// ============================================================
// 单元测试 — TestP2P 假传输（同进程 host/guest 握手与消息路由）
// ============================================================

import { describe, it, expect } from 'vitest';
import { TestP2P, TEST_ROOM_CODE } from '../../core/testP2p';

const tick = () => new Promise(r => setTimeout(r, 30));

/** 完成一次 host/guest 握手，返回 host 分配的 pid */
async function handshake(host: TestP2P, guest: TestP2P): Promise<string> {
  const offerP = new Promise<string>(r => guest.onOffer(r));
  await host.createRoom();
  const offer = await offerP;
  expect(offer).toContain(TEST_ROOM_CODE);
  const answerP = new Promise<string>(r => host.onAnswer(r));
  const room = await guest.joinFromOffer(offer);
  expect(room).toBe(TEST_ROOM_CODE);
  const answer = await answerP;
  return host.acceptGuestAnswer(answer);
}

describe('TestP2P 握手', () => {
  it('host 创建房间广播 offer，guest 收到 --test-- 房间码', async () => {
    const host = new TestP2P('host');
    const guest = new TestP2P('guest');
    const offerP = new Promise<string>(r => guest.onOffer(r));
    const room = await host.createRoom();
    expect(room).toBe(TEST_ROOM_CODE);
    const offer = await offerP;
    expect(JSON.parse(offer).rc).toBe(TEST_ROOM_CODE);
    host.leave(); guest.leave();
  });

  it('guest joinFromOffer 后 host 收到 answer 并分配 pid', async () => {
    const host = new TestP2P('host');
    const guest = new TestP2P('guest');
    const pid = await handshake(host, guest);
    expect(pid).toMatch(/^guest-/);
    expect(host.getPeerCount()).toBe(1);
    expect(host.getPeerIds()).toEqual([pid]);
    host.leave(); guest.leave();
  });

  it('waitForDcOpen 立即成功', async () => {
    const host = new TestP2P('host');
    expect(await host.waitForDcOpen('anything')).toBe(true);
    host.leave();
  });
});

describe('TestP2P 消息路由', () => {
  it('host → guest 定向消息（state）', async () => {
    const host = new TestP2P('host');
    const guest = new TestP2P('guest');
    let received: unknown;
    guest.onMessage((from, data) => { received = { from, data }; });
    const pid = await handshake(host, guest);
    host.sendRaw(pid, 'state', { hello: 1 });
    await tick();
    expect(received).toEqual({
      from: 'host',
      data: { type: 'state', payload: { hello: 1 } },
    });
    host.leave(); guest.leave();
  });

  it('guest → host 动作送达 onAction', async () => {
    const host = new TestP2P('host');
    const guest = new TestP2P('guest');
    let got: unknown;
    host.onAction(a => { got = a; });
    await handshake(host, guest);
    const action = { type: 'battleship_fire', playerIndex: 1, payload: { cell: 'A1' }, timestamp: 0 };
    guest.sendAction(action);
    await tick();
    expect(got).toEqual(action);
    host.leave(); guest.leave();
  });

  it('guest 广播不回流到 guest 自身', async () => {
    const host = new TestP2P('host');
    const guest = new TestP2P('guest');
    let got: unknown;
    guest.onMessage((_from, data) => { got = data; });
    await handshake(host, guest);
    guest.sendAction({ type: 'x', playerIndex: 1, payload: null, timestamp: 0 });
    await tick();
    expect(got).toBeUndefined();
    host.leave(); guest.leave();
  });
});

describe('TestP2P 多客人', () => {
  it('两名 guest 依次加入，host 按序记录', async () => {
    const host = new TestP2P('host');
    const g1 = new TestP2P('guest');
    const g2 = new TestP2P('guest');
    const answers: string[] = [];
    host.onAnswer(a => answers.push(a));
    const offerP = new Promise<string>(r => g1.onOffer(r));
    await host.createRoom();
    const offer = await offerP;
    await g1.joinFromOffer(offer);
    await g2.joinFromOffer(offer);
    await tick();
    expect(answers).toHaveLength(2);
    const p1 = await host.acceptGuestAnswer(answers[0]);
    const p2 = await host.acceptGuestAnswer(answers[1]);
    expect(p1).not.toBe(p2);
    expect(host.getPeerIds()).toEqual([p1, p2]);
    expect(host.getPeerCount()).toBe(2);
    g1.leave(); g2.leave(); host.leave();
  });

  it('host 向指定 guest 定向发送，另一 guest 收不到', async () => {
    const host = new TestP2P('host');
    const g1 = new TestP2P('guest');
    const g2 = new TestP2P('guest');
    const answers: string[] = [];
    host.onAnswer(a => answers.push(a));
    const offerP = new Promise<string>(r => g1.onOffer(r));
    await host.createRoom();
    const offer = await offerP;
    await g1.joinFromOffer(offer);
    await g2.joinFromOffer(offer);
    await tick();
    const p1 = await host.acceptGuestAnswer(answers[0]);
    const p2 = await host.acceptGuestAnswer(answers[1]);

    let g2Got: unknown;
    g2.onMessage((_from, data) => { g2Got = data; });
    host.sendRaw(p1, 'state', { to: 'p1' });
    await tick();
    expect(g2Got).toBeUndefined();
    host.sendRaw(p2, 'state', { to: 'p2' });
    await tick();
    expect(g2Got).toEqual({ type: 'state', payload: { to: 'p2' } });
    g1.leave(); g2.leave(); host.leave();
  });
});
