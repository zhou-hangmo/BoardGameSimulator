// ============================================================
// BoardGameSimulator — 游戏主界面视图
// ============================================================
import { BaseView } from './BaseView';
import { el, clear } from '../utils/dom';
import type { PlayerView, Card } from '../core/types';

export class GameView extends BaseView {
  private gameBuilt = false;
  private top!: HTMLElement;
  private main!: HTMLElement;
  private hand!: HTMLElement;
  private btnPlay!: HTMLButtonElement;
  private btnPass!: HTMLButtonElement;

  constructor(parent: HTMLElement) {
    super(parent);
  }

  protected createEl(): HTMLElement {
    return el('div', { style: 'height:100%;' });
  }

  render(view: PlayerView): void {
    if (!this.gameBuilt) {
      this.buildLayout();
    }
    this.updateContent(view);
  }

  private buildLayout(): void {
    this.gameBuilt = true;

    const top = el('div', { class: 'game-top' });
    const main = el('div', { class: 'game-main' });
    const handRow = el('div', { class: 'hand-row' });

    const btnPlay = el('button', { class: 'btn btn-primary', id: 'btn-play' });
    btnPlay.textContent = '出牌';
    btnPlay.disabled = true;
    btnPlay.addEventListener('pointerdown', () => {
      const ids = Array.from(handRow.querySelectorAll('.card-hand.sel'))
        .map(e => (e as HTMLElement).dataset.cardId!);
      if (ids.length) this.emit('ui:play_action', 'play_cards', { cards: ids });
    });

    const btnPass = el('button', { class: 'btn btn-secondary', id: 'btn-pass' });
    btnPass.textContent = '不出';
    btnPass.disabled = true;
    btnPass.addEventListener('pointerdown', () => this.emit('ui:play_action', 'pass', null));

    const btnSave = el('button', { class: 'btn btn-secondary', id: 'btn-save' });
    btnSave.textContent = '💾';
    btnSave.style.cssText = 'margin-left:4px;';
    btnSave.addEventListener('pointerdown', async () => {
      const url = await new Promise<string>((resolve) => {
        const cb = (data: string) => resolve(data);
        this.emit('ui:save_game', cb);
      });
      if (url) {
        const a = el('a', { href: url, download: 'game.png' });
        a.click();
      }
    });

    const actionRow = el('div', { class: 'action-row' });
    actionRow.append(btnPlay, btnPass, btnSave);

    const barBot = el('div', { class: 'game-bar-bot' });
    barBot.append(handRow, actionRow);

    this.el.append(top, main, barBot);
    this.top = top;
    this.main = main;
    this.hand = handRow;
    this.btnPlay = btnPlay;
    this.btnPass = btnPass;
  }

  private updateContent(v: PlayerView): void {
    const { players, publicState, playerIndex } = v;
    const isCalling = v.phase === 'calling';
    const isPlaying = v.phase === 'playing';
    const isEnded = v.phase === 'ended';
    const my = publicState.currentTurn === playerIndex;
    const ld = publicState.landlordIndex >= 0 ? players[publicState.landlordIndex] : null;

    this.top.textContent = `${isCalling ? '叫地主' : isPlaying ? '游戏中' : isEnded ? '结束' : ''}${ld ? ' · 地主:' + ld.name : ''}${isPlaying ? ' · 轮到:' + players[publicState.currentTurn].name : ''}`;

    // Opponents
    clear(this.main);
    for (const o of players.filter((_, i) => i !== playerIndex)) {
      const row = el('div', { class: 'opp-row' });
      for (let i = 0; i < Math.min(o.handCount, 10); i++) {
        row.appendChild(el('div', { class: 'card-back' }));
      }
      const name = el('div', { class: 'opp-name' });
      name.textContent = `${o.name} (${o.handCount}张)`;
      this.main.append(row, name);
    }

    // Play zone
    const playZone = el('div', { class: 'play-zone' });
    if (publicState.lastPlay) {
      const lp = publicState.lastPlay;
      for (const c of lp.cards) {
        const card = el('div', { class: 'play-card' });
        card.textContent = c.name;
        playZone.appendChild(card);
      }
      const info = el('div', { class: 'play-info' });
      info.textContent = `${players[lp.playerIndex].name} 出了 ${lp.cards.length} 张`;
      playZone.appendChild(info);
    } else if (isPlaying) {
      const wait = el('span', { class: 'wait-text' });
      wait.textContent = '等待出牌...';
      playZone.appendChild(wait);
    }
    this.main.appendChild(playZone);

    // Calling buttons
    if (isCalling && my) {
      const callBtns = el('div', { class: 'call-btns' });
      const btnCall = el('button', { class: 'btn btn-primary', id: 'btn-call' });
      btnCall.textContent = '叫地主';
      btnCall.addEventListener('pointerdown', () => this.emit('ui:play_action', 'call_landlord', { call: true }));
      const btnNoCall = el('button', { class: 'btn btn-secondary', id: 'btn-nocall' });
      btnNoCall.textContent = '不叫';
      btnNoCall.addEventListener('pointerdown', () => this.emit('ui:play_action', 'call_landlord', { call: false }));
      callBtns.append(btnCall, btnNoCall);
      this.main.appendChild(callBtns);
    }

    // Game over overlay
    if (isEnded && publicState.winner !== null) {
      const won = publicState.winner === playerIndex ||
        (ld && publicState.winner !== publicState.landlordIndex && playerIndex !== publicState.landlordIndex);
      const overlay = el('div', { class: 'game-over-overlay' });
      const goText = el('div', { class: 'go-text' });
      goText.style.color = won ? 'var(--green)' : 'var(--red)';
      goText.textContent = won ? '你赢了！' : '游戏结束';
      const btnBack = el('button', { class: 'btn btn-primary' });
      btnBack.textContent = '返回';
      btnBack.addEventListener('click', () => {
        this.emit('ui:leave_room');
        this.emit('ui:go_home');
      });
      overlay.append(goText, btnBack);
      this.main.appendChild(overlay);
    }

    // Hand cards
    clear(this.hand);
    const hand = Array.isArray(players[playerIndex].hand) ? players[playerIndex].hand as Card[] : [];
    for (const c of hand) {
      const card = el('div', {
        class: 'card-hand',
        'data-card-id': c.id,
        'data-suit': c.suit,
      });
      card.textContent = c.name;
      card.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        card.classList.toggle('sel');
      });
      this.hand.appendChild(card);
    }

    // Action buttons state
    if (isCalling && my) {
      this.btnPlay.style.display = 'none';
      this.btnPass.style.display = 'none';
    } else {
      this.btnPlay.style.display = '';
      this.btnPass.style.display = '';
      this.btnPlay.disabled = !my || !isPlaying;
      this.btnPass.disabled = !my || !isPlaying;
    }
  }

  destroy(): void {
    this.gameBuilt = false;
    super.destroy();
  }
}
