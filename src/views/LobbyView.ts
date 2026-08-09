// ============================================================
// BoardGameSimulator — 游戏大厅视图（常驻）
// 玩家列表（名字/主机/座位声明）+ 游戏库（从机浏览/主机发起）
// 主机发起：座位分配面板（每个玩家可选 游戏位/观战位）
// ============================================================
import { BaseView } from './BaseView';
import { el } from '../utils/dom';
import type { LobbyState, LobbyPlayer, GameMeta, SeatAssign } from '../core/lobbyTypes';

export class LobbyView extends BaseView {
  private state: LobbyState | null = null;
  private seatDraft: Record<string, 'player' | 'spectator'> = {}; // 发起面板草稿

  constructor(parent: HTMLElement) {
    super(parent);
  }

  protected createEl(): HTMLElement {
    return el('div', { style: 'display:flex;flex-direction:column;height:100%;' });
  }

  /** 渲染大厅（服务器广播 lobby_state） */
  showLobby(state: LobbyState): void {
    this.state = state;
    this.seatDraft = {};
    this.el.innerHTML = '';
    this.el.append(
      this.buildHeader(state),
      this.buildPlayers(state),
      this.buildGames(state),
      this.buildStatus(state),
    );
  }

  private buildHeader(st: LobbyState): HTMLElement {
    const bar = el('div', { class: 'nav-bar' });
    bar.append(
      el('span', { class: 'nav-title' }, [`游戏大厅 · ${st.players.length} 人在线`]),
    );
    return bar;
  }

  private buildPlayers(st: LobbyState): HTMLElement {
    const box = el('div', { style: 'padding:10px 14px;' });
    box.append(el('div', { class: 'section-hdr' }, ['玩家']));
    const list = el('div', { style: 'display:flex;flex-direction:column;gap:6px;' });
    for (const p of st.players) {
      list.appendChild(this.playerRow(p, st));
    }
    box.append(list);
    return box;
  }

  private playerRow(p: LobbyPlayer, st: LobbyState): HTMLElement {
    const row = el('div', { class: 'player-row' });
    row.append(el('span', { class: 'dot green' }));
    row.append(el('span', {}, [`${p.name}${p.isHost ? ' (主机)' : ''}`]));
    row.append(el('span', { style: 'margin-left:auto;font-size:12px;color:var(--label3);' }, [p.wantPlay ? '🎯 想玩' : '👁 观战']));
    if (p.id === st.you) {
      const btn = el('button', {
        class: 'btn btn-secondary',
        style: 'font-size:12px;padding:3px 10px;margin-left:8px;',
      }, [p.wantPlay ? '改观战' : '我想玩']);
      btn.addEventListener('pointerdown', () => this.emit('ui:set_seat', !p.wantPlay));
      row.append(btn);
    }
    return row;
  }

  private buildGames(st: LobbyState): HTMLElement {
    const box = el('div', { style: 'padding:0 14px;' });
    box.append(el('div', { class: 'section-hdr' }, ['游戏库']));
    const list = el('div', { style: 'display:flex;flex-direction:column;gap:8px;' });
    for (const g of st.games) {
      list.appendChild(this.gameCard(g, st));
    }
    box.append(list);
    return box;
  }

  private gameCard(g: GameMeta, st: LobbyState): HTMLElement {
    const card = el('div', {
      style: 'display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:var(--bg2,#f7f7f7);',
    });
    card.append(el('div', { style: 'font-size:20px;' }, ['🃏']));
    const body = el('div', { style: 'flex:1;min-width:0;' });
    body.append(
      el('div', { style: 'font-weight:600;' }, [g.name]),
      el('div', { style: 'font-size:12px;color:var(--label2);' }, [`${g.description} · ${g.playerCount}人`]),
    );
    card.append(body);
    if (p_isHost(st, this.myId())) {
      const btn = el('button', { class: 'btn btn-primary', style: 'font-size:13px;padding:6px 14px;' }, ['发起']);
      btn.addEventListener('pointerdown', () => this.openStartPanel(g, st));
      card.append(btn);
    } else {
      card.append(el('span', { style: 'font-size:12px;color:var(--label3);' }, ['等待主机发起']));
    }
    return card;
  }

  private buildStatus(st: LobbyState): HTMLElement {
    const box = el('div', { style: 'padding:10px 14px;text-align:center;' });
    if (st.status === 'playing') {
      const g = st.games.find(x => x.id === st.currentGame);
      box.append(el('div', { style: 'color:var(--label2);font-size:13px;' }, [`对局中：${g?.name ?? st.currentGame}`]));
      if (p_isHost(st, this.myId())) {
        const btn = el('button', { class: 'btn btn-secondary', style: 'font-size:13px;padding:6px 14px;margin-top:8px;' }, ['中止回大厅']);
        btn.addEventListener('pointerdown', () => this.emit('ui:back_to_lobby'));
        box.append(btn);
      }
    } else if (st.notice) {
      box.append(el('div', { style: 'color:var(--label2);font-size:13px;' }, [st.notice]));
    } else {
      box.append(el('div', { style: 'color:var(--label3);font-size:13px;' }, ['等待主机发起游戏…']));
    }
    return box;
  }

  // ---------- 主机发起面板 ----------

  private openStartPanel(g: GameMeta, st: LobbyState): void {
    this.seatDraft = {};
    for (const p of st.players) {
      this.seatDraft[p.id] = p.wantPlay ? 'player' : 'spectator';
    }
    // 保证游戏位数量恰好 playerCount：多退少补（按声明顺序）
    const want = st.players;
    let playersSeated = want.filter(p => this.seatDraft[p.id] === 'player').length;
    if (playersSeated > g.playerCount) {
      for (let i = want.length - 1; i >= 0 && playersSeated > g.playerCount; i--) {
        const pid = want[i].id;
        if (this.seatDraft[pid] === 'player') {
          this.seatDraft[pid] = 'spectator';
          playersSeated--;
        }
      }
    } else {
      for (const p of want) {
        if (playersSeated >= g.playerCount) break;
        if (this.seatDraft[p.id] !== 'player') {
          this.seatDraft[p.id] = 'player';
          playersSeated++;
        }
      }
    }
    this.renderStartPanel(g, st);
  }

  private renderStartPanel(g: GameMeta, st: LobbyState): void {
    const prev = document.getElementById('start-panel');
    prev?.remove();
    const mask = el('div', { id: 'start-panel', style: 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;' });
    const panel = el('div', {
      style: 'background:var(--bg1,#fff);border-radius:14px;padding:16px;width:88vw;max-width:360px;max-height:80vh;overflow-y:auto;',
    });
    panel.append(el('div', { style: 'font-weight:600;margin-bottom:8px;' }, [`发起「${g.name}」· 选择座位`]));
    const rows = el('div', { style: 'display:flex;flex-direction:column;gap:8px;margin-bottom:12px;' });
    for (const p of st.players) {
      const row = el('div', { style: 'display:flex;align-items:center;gap:8px;' });
      row.append(el('span', { style: 'flex:1;font-size:14px;' }, [`${p.name}${p.isHost ? ' (主机)' : ''}`]));
      const cur = this.seatDraft[p.id];
      const seg = el('div', { style: 'display:flex;gap:4px;' });
      for (const opt of [['player', '游戏位'], ['spectator', '观战位']] as const) {
        const b = el('button', {
          class: 'btn',
          style: `font-size:12px;padding:4px 10px;${cur === opt[0] ? 'background:var(--green,#2fbf71);color:#fff;' : ''}`,
        }, [opt[1]]);
        b.addEventListener('pointerdown', () => {
          this.seatDraft[p.id] = opt[0];
          this.renderStartPanel(g, st);
        });
        seg.append(b);
      }
      row.append(seg);
      rows.append(row);
    }
    const err = el('div', { style: 'color:#d33;font-size:12px;margin-bottom:8px;display:none;' });
    const confirm = el('button', { class: 'btn btn-primary', style: 'width:100%;' }, ['✓ 发起游戏']);
    confirm.addEventListener('pointerdown', () => {
      const seats: SeatAssign[] = Object.entries(this.seatDraft).map(([playerId, seat]) => ({ playerId, seat }));
      const n = seats.filter(s => s.seat === 'player').length;
      if (n !== g.playerCount) {
        err.style.display = 'block';
        err.textContent = `「${g.name}」需要 ${g.playerCount} 个游戏位，当前选了 ${n} 个`;
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

  private myId(): string {
    return this.state?.you ?? '';
  }
}

/** 我是否是主机 */
function p_isHost(st: LobbyState, myId: string): boolean {
  return st.players.some(p => p.id === myId && p.isHost);
}
