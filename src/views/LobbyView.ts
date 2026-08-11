// ============================================================
// BoardGameSimulator — 游戏大厅视图（常驻）
// 白色背景 · 游戏位/观战位两个圆角矩形区域（计数+允许数量）
// 玩家行内嵌分段胶囊（参与/观战，滑动指示）
// ============================================================
import { BaseView } from './BaseView';
import { el } from '../utils/dom';
import QRCode from 'qrcode';
import { SegmentedControl } from '../components/SegmentedControl';
import type { LobbyState, LobbyPlayer, GameMeta, SeatAssign } from '../core/lobbyTypes';

const SEAT_OPTS = [
  { key: 'player', label: '游戏' },
  { key: 'spectator', label: '观战' },
];

/** 允许数量文案：2 → "可容纳 2 人"；2~4 → "可容纳 2~4 人" */
function capacityLabel(g: GameMeta): string {
  return g.minPlayers === g.maxPlayers
    ? `可容纳 ${g.minPlayers} 人`
    : `可容纳 ${g.minPlayers}~${g.maxPlayers} 人`;
}

export class LobbyView extends BaseView {
  private state: LobbyState | null = null;   // 最近一次大厅状态（邀请面板用）
  private seatDraft: Record<string, 'player' | 'spectator'> = {}; // 发起面板草稿

  constructor(parent: HTMLElement) {
    super(parent);
  }

  protected createEl(): HTMLElement {
    return el('div', { style: 'display:flex;flex-direction:column;height:100%;background:var(--color-bg2,#f2f2f7);' });
  }

  /** 渲染大厅（服务器广播 lobby_state） */
  showLobby(state: LobbyState): void {
    this.state = state;
    this.seatDraft = {};
    this.el.innerHTML = '';
    this.el.append(
      this.buildHeader(state),
      this.buildStatus(state),
      this.buildSeatRegions(state),
      this.buildGames(state),
    );
  }

  private buildHeader(st: LobbyState): HTMLElement {
    const bar = el('div', { class: 'nav-bar', style: 'position:relative;' });
    const title = `游戏大厅 · ${st.players.length} 人在线${st.hasPassword ? ' · 需口令' : ''}`;
    bar.append(el('span', { class: 'nav-title' }, [title]));
    const invite = el('button', { class: 'btn btn-secondary', style: 'font-size:12px;padding:4px 10px;position:absolute;right:12px;top:50%;transform:translateY(-50%);' }, ['邀请']);
    invite.addEventListener('pointerdown', () => this.openInvitePanel());
    bar.append(invite);
    return bar;
  }

  private buildStatus(st: LobbyState): HTMLElement {
    const box = el('div', { style: 'padding:10px 14px 0;text-align:center;' });
    if (st.status === 'playing') {
      const g = st.games.find(x => x.id === st.currentGame);
      box.append(el('div', { style: 'color:var(--color-label2);font-size:13px;' }, [`对局中：${g?.name ?? st.currentGame}`]));
      if (this.amHost(st)) {
        const btn = el('button', { class: 'btn btn-secondary', style: 'font-size:13px;padding:6px 14px;margin-top:8px;' }, ['中止回大厅']);
        btn.addEventListener('pointerdown', () => this.emit('ui:back_to_lobby'));
        box.append(btn);
      }
    } else if (st.notice) {
      box.append(el('div', { style: 'color:var(--color-label2);font-size:13px;' }, [st.notice]));
    } else {
      box.append(el('div', { style: 'color:var(--color-label3);font-size:13px;' }, ['等待主机发起游戏…']));
      if (this.amHost(st)) {
        const pwdBtn = el('button', { class: 'btn btn-secondary', style: 'font-size:12px;padding:4px 12px;margin-top:8px;' }, [st.hasPassword ? '修改口令' : '设置口令']);
        pwdBtn.addEventListener('pointerdown', () => this.emit('ui:set_password'));
        box.append(pwdBtn);
      } else {
        // 非主机：离开大厅（释放游戏位）
        const leaveBtn = el('button', { class: 'btn btn-secondary', style: 'font-size:12px;padding:4px 12px;margin-top:8px;color:#d33;' }, ['离开大厅']);
        leaveBtn.addEventListener('pointerdown', () => this.emit('ui:leave_lobby'));
        box.append(leaveBtn);
      }
    }
    // 保活设置入口（App 主机常驻，随时可重看）
    if (location.hostname === 'localhost') {
      const keepBtn = el('button', { class: 'btn btn-secondary', style: 'font-size:12px;padding:4px 12px;margin-top:8px;margin-left:6px;' }, ['保活设置']);
      keepBtn.addEventListener('pointerdown', () => this.emit('ui:show_keepalive'));
      box.append(keepBtn);
    }
    return box;
  }

  // ---------- 游戏位 / 观战位 区域 ----------

  private buildSeatRegions(st: LobbyState): HTMLElement {
    const wrap = el('div', { style: 'display:flex;flex-direction:column;gap:10px;padding:12px 14px;' });
    const me = st.players.find(p => p.id === st.you);

    // 游戏位区（计数）
    const playerSeated = st.players.filter(p => p.wantPlay);
    const gameCount = el('span', {
      style: 'font-size:12px;color:var(--color-label3);',
    }, [`${playerSeated.length} 人`]);
    gameCount.setAttribute('data-count', String(playerSeated.length));
    wrap.append(this.seatRegion('游戏位', gameCount, playerSeated, me?.id));

    // 观战位区
    const spectating = st.players.filter(p => !p.wantPlay);
    const specCount = el('span', { style: 'font-size:12px;color:var(--color-label3);' }, [`${spectating.length} 人`]);
    wrap.append(this.seatRegion('观战位', specCount, spectating, me?.id));

    return wrap;
  }

  private seatRegion(title: string, countEl: HTMLElement, players: LobbyPlayer[], myId?: string): HTMLElement {
    const card = el('div', {
      style: 'border-radius:12px;background:#fff;padding:10px 12px;',
    });
    const head = el('div', { style: 'display:flex;align-items:baseline;gap:8px;margin-bottom:4px;' });
    head.append(
      el('span', { style: 'font-size:14px;font-weight:600;' }, [title]),
      countEl,
    );
    card.append(head);
    if (players.length === 0) {
      card.append(el('div', { style: 'font-size:12px;color:var(--color-label3);padding:6px 0;' }, ['空']));
    } else {
      for (const p of players) {
        card.append(this.playerRow(p, p.id === myId));
      }
    }
    return card;
  }

  private playerRow(p: LobbyPlayer, isMe: boolean): HTMLElement {
    const row = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:5px 0;' });
    row.setAttribute('data-pid', p.id);
    const nameWrap = el('span', { style: 'flex:1;display:flex;align-items:center;gap:5px;font-size:14px;min-width:0;' });
    // 自己：绿色小点标识
    if (isMe) {
      nameWrap.append(el('span', { style: 'width:7px;height:7px;border-radius:50%;background:var(--color-green,#34c759);flex:none;' }));
    }
    nameWrap.append(el('span', { style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' }, [`${p.name}${p.isHost ? '（主机）' : ''}`]));
    // 自己：点名字改名
    if (isMe) {
      const nameSpan = nameWrap.lastElementChild as HTMLElement;
      nameSpan.style.borderBottom = '1px dashed var(--color-label3)';
      nameSpan.style.cursor = 'pointer';
      nameSpan.title = '点击改名';
      nameSpan.addEventListener('pointerdown', () => this.openRenameDialog(p.name));
    }
    row.append(nameWrap);
    // 分段胶囊：自己可切换，他人只读
    row.append(SegmentedControl({
      options: SEAT_OPTS,
      value: p.wantPlay ? 'player' : 'spectator',
      onChange: (k) => this.emit('ui:set_seat', k === 'player'),
      disabled: !isMe,
    }));
    // 主机：他人行显示"踢出"按钮
    if (this.amHost(this.state) && !isMe) {
      const kick = el('button', {
        style: 'border:none;background:transparent;color:#d33;font-size:12px;padding:4px 2px;cursor:pointer;flex:none;',
      }, ['踢出']);
      kick.addEventListener('pointerdown', () => this.emit('ui:kick_player', p.id));
      row.append(kick);
    }
    return row;
  }

  // ---------- 游戏库 ----------

  private buildGames(st: LobbyState): HTMLElement {
    const box = el('div', { style: 'padding:0 14px 12px;' });
    box.append(el('div', { style: 'font-size:13px;color:var(--color-label2);padding:10px 0 6px;' }, ['游戏库']));
    const list = el('div', { style: 'display:flex;flex-direction:column;gap:8px;' });
    for (const g of st.games) {
      list.appendChild(this.gameCard(g, st));
    }
    box.append(list);
    return box;
  }

  private gameCard(g: GameMeta, st: LobbyState): HTMLElement {
    const card = el('div', {
      style: 'display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:#fff;',
    });
    const body = el('div', { style: 'flex:1;min-width:0;' });
    body.append(
      el('div', { style: 'font-weight:600;font-size:14px;' }, [g.name]),
      el('div', { style: 'font-size:12px;color:var(--color-label2);' }, [`${g.description} · ${capacityLabel(g)}`]),
    );
    card.append(body);
    if (this.amHost(st)) {
      const btn = el('button', { class: 'btn btn-primary', style: 'font-size:13px;padding:6px 14px;' }, ['发起']);
      btn.addEventListener('pointerdown', () => this.openStartPanel(g, st));
      card.append(btn);
    } else {
      card.append(el('span', { style: 'font-size:12px;color:var(--color-label3);' }, ['等待主机发起']));
    }
    return card;
  }

  // ---------- 主机发起面板 ----------

  private openStartPanel(g: GameMeta, st: LobbyState): void {
    this.seatDraft = {};
    for (const p of st.players) {
      this.seatDraft[p.id] = p.wantPlay ? 'player' : 'spectator';
    }
    // 按声明补齐/裁剪到允许范围内
    const want = st.players;
    const need = g.maxPlayers;
    let seated = want.filter(p => this.seatDraft[p.id] === 'player').length;
    if (seated > need) {
      for (let i = want.length - 1; i >= 0 && seated > need; i--) {
        const pid = want[i].id;
        if (this.seatDraft[pid] === 'player') { this.seatDraft[pid] = 'spectator'; seated--; }
      }
    } else {
      for (const p of want) {
        if (seated >= need) break;
        if (this.seatDraft[p.id] !== 'player') { this.seatDraft[p.id] = 'player'; seated++; }
      }
    }
    this.renderStartPanel(g, st);
  }

  private renderStartPanel(g: GameMeta, st: LobbyState): void {
    const prev = document.getElementById('start-panel');
    prev?.remove();
    const mask = el('div', { id: 'start-panel', style: 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;' });
    const panel = el('div', {
      style: 'background:#fff;border-radius:14px;padding:16px;width:88vw;max-width:360px;max-height:80vh;overflow-y:auto;',
    });
    panel.append(el('div', { style: 'font-weight:600;font-size:15px;margin-bottom:4px;' }, [`发起「${g.name}」`]));
    panel.append(el('div', { style: 'font-size:12px;color:var(--color-label3);margin-bottom:10px;' }, [`${capacityLabel(g)}，选择游戏位`]));
    const rows = el('div', { style: 'display:flex;flex-direction:column;gap:8px;margin-bottom:12px;' });
    for (const p of st.players) {
      const row = el('div', { style: 'display:flex;align-items:center;gap:8px;' });
      row.append(el('span', { style: 'flex:1;font-size:14px;' }, [`${p.name}${p.isHost ? '（主机）' : ''}`]));
      row.append(SegmentedControl({
        options: SEAT_OPTS,
        value: this.seatDraft[p.id],
        onChange: (k) => {
          this.seatDraft[p.id] = k as 'player' | 'spectator';
          this.renderStartPanel(g, st);
        },
      }));
      rows.append(row);
    }
    const err = el('div', { style: 'color:#d33;font-size:12px;margin-bottom:8px;display:none;' });
    const confirm = el('button', { class: 'btn btn-primary', style: 'width:100%;' }, ['发起游戏']);
    confirm.addEventListener('pointerdown', () => {
      const seats: SeatAssign[] = Object.entries(this.seatDraft).map(([playerId, seat]) => ({ playerId, seat }));
      const n = seats.filter(s => s.seat === 'player').length;
      if (n < g.minPlayers || n > g.maxPlayers) {
        err.style.display = 'block';
        err.textContent = `「${g.name}」需要 ${g.minPlayers}~${g.maxPlayers} 个游戏位，当前选了 ${n} 个`;
        return;
      }
      this.emit('ui:start_game', g.id, seats);
      mask.remove();
    });
    const cancel = el('button', { class: 'btn btn-secondary', style: 'width:100%;margin-top:8px;' }, ['取消']);
    cancel.addEventListener('pointerdown', () => mask.remove());
    panel.append(rows, err, confirm, cancel);
    mask.append(panel);
    document.body.append(mask);
  }

  // ---------- 改名弹层 ----------

  private openRenameDialog(current: string): void {
    const mask = el('div', { style: 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;' });
    const panel = el('div', { style: 'background:#fff;border-radius:14px;padding:16px;width:80vw;max-width:320px;' });
    panel.append(el('div', { style: 'font-weight:600;font-size:15px;margin-bottom:10px;' }, ['修改昵称']));
    const input = el('input', { style: 'width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #ddd;border-radius:8px;font-size:14px;' }) as HTMLInputElement;
    input.value = current.replace('（主机）', '');
    input.maxLength = 12;
    panel.append(input);
    const err = el('div', { style: 'color:#d33;font-size:12px;margin-top:6px;display:none;' });
    const confirm = el('button', { class: 'btn btn-primary', style: 'width:100%;margin-top:10px;' }, ['保存']);
    confirm.addEventListener('pointerdown', () => {
      const name = input.value.trim();
      if (!name) { err.style.display = 'block'; err.textContent = '昵称不能为空'; return; }
      this.emit('ui:rename', name);
      mask.remove();
    });
    const cancel = el('button', { class: 'btn btn-secondary', style: 'width:100%;margin-top:8px;' }, ['取消']);
    cancel.addEventListener('pointerdown', () => mask.remove());
    panel.append(err, confirm, cancel);
    mask.append(panel);
    document.body.append(mask);
    setTimeout(() => input.focus(), 0);
  }

  // ---------- 邀请面板（胶囊切换 局域网/公网） ----------

  private openInvitePanel(): void {
    const port = location.port || '80';
    const addrs = this.state?.addresses;
    const keyPart = this.state?.key ? `&key=${this.state.key}` : '';
    const wanUrls = (addrs?.wan ?? []).map(v6 => `http://[${v6}]:${port}/?ws=1${keyPart}`);
    const lanUrls = [
      ...(addrs?.lanV4 ?? []).map(v4 => `http://${v4}:${port}/?ws=1${keyPart}`),
      ...(addrs?.lanV6 ?? []).map(v6 => `http://[${v6}]:${port}/?ws=1${keyPart}`),
    ];
    let mode: 'lan' | 'wan' = wanUrls.length > 0 ? 'wan' : 'lan';

    const mask = el('div', { style: 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;' });
    const panel = el('div', {
      style: 'background:#fff;border-radius:14px;padding:16px;width:88vw;max-width:340px;text-align:center;',
    });
    panel.append(el('div', { style: 'font-weight:600;font-size:15px;margin-bottom:8px;' }, ['邀请玩家加入']));

    // 胶囊切换（setValue 驱动滑动动画 + 内容重渲染）
    const seg = SegmentedControl({
      options: [
        { key: 'lan', label: '局域网' },
        { key: 'wan', label: '公网' },
      ],
      value: mode,
      fill: true,
      onChange: (k) => {
        mode = k as 'lan' | 'wan';
        (seg as HTMLElement & { setValue?: (k: string) => void }).setValue?.(mode);
        render();
      },
    });
    panel.append(seg);

    const body = el('div', { style: 'margin-top:10px;' });
    panel.append(body);

    const render = (): void => {
      body.innerHTML = '';
      const urls = mode === 'wan' ? wanUrls : lanUrls;
      const hint = mode === 'wan' ? '公网玩家（异地/蜂窝）扫此码' : '同一 WiFi/热点玩家扫此码';
      if (urls.length === 0) {
        const empty = el('div', { style: 'color:var(--color-label3);font-size:13px;padding:20px 0;line-height:1.6;' });
        empty.append(
          mode === 'wan'
            ? '未检测到蜂窝网络地址\n请确认手机使用蜂窝流量（4G/5G）'
            : '未检测到局域网地址\n请连接 WiFi 或开启热点，等待自动刷新',
        );
        body.append(empty);
        return;
      }
      const img = el('img', { style: 'width:220px;height:220px;margin:8px auto;display:block;border:4px solid #fff;border-radius:8px;' });
      img.alt = '邀请二维码';
      body.append(img);
      body.append(el('div', { style: 'font-size:12px;color:var(--color-label3);margin-bottom:4px;' }, [hint]));
      const ta = el('textarea', { readOnly: 'true', style: 'width:100%;height:72px;background:#f4f4f4;border:1px solid #ddd;border-radius:8px;font:12px monospace;box-sizing:border-box;padding:6px;' });
      ta.value = urls.join('\n');
      body.append(ta);
      void QRCode.toDataURL(urls[0], { width: 440, margin: 1 }).then(u => { img.src = u; }).catch(() => { /* 二维码生成失败 */ });
    };
    render();

    const close = el('button', { class: 'btn btn-secondary', style: 'width:100%;margin-top:8px;' }, ['关闭']);
    close.addEventListener('pointerdown', () => mask.remove());
    panel.append(close);
    mask.append(panel);
    document.body.append(mask);
  }

  private amHost(st: LobbyState | null): boolean {
    return !!st?.players.find(p => p.id === st.you)?.isHost;
  }
}
