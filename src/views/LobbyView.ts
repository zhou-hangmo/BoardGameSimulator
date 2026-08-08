// ============================================================
// BoardGameSimulator — 房间大厅 / 等待 / 客码视图
// 大厅分上下两区：玩家（上）/ 观战（下）；空闲玩家行带「观战」按钮
// ============================================================
import { BaseView } from './BaseView';
import { el, qs, qso } from '../utils/dom';

export interface PlayerInfo {
  name: string;
  isHost: boolean;
  isSpectator?: boolean;  // 观战区
  status?: string;
}

export class LobbyView extends BaseView {
  constructor(parent: HTMLElement) {
    super(parent);
  }

  protected createEl(): HTMLElement {
    return el('div', { style: 'display:flex;flex-direction:column;height:100%;' });
  }

  /** 显示房间大厅（主持人视角） */
  showLobby(code: string, players: PlayerInfo[], qrImg: string, maxPlayers = 2): void {
    this.el.innerHTML = this.buildLobbyHtml(code, players, qrImg, maxPlayers);
    this.bindLobbyButtons();
  }

  /** 显示等待房间（非主持人视角） */
  showWaitRoom(code: string, players: PlayerInfo[]): void {
    this.el.innerHTML = this.buildWaitHtml(code, players);
  }

  /** 显示客人 QR 码 */
  showGuestQr(code: string, qrImg: string): void {
    this.el.innerHTML = this.buildGuestQrHtml(code, qrImg);
    qso('#btn-log-guest', this.el)?.addEventListener('pointerdown', () => {
      this.emit('ui:show_log');
    });
  }

  /** 显示游戏详情（创建房间前） */
  showGameDetail(gameName: string, description: string, playerCount: string, gameId: string): void {
    this.el.innerHTML = this.buildGameDetailHtml(gameName, description, playerCount);
    qs('#btn-create', this.el).addEventListener('pointerdown', () => {
      this.emit('ui:create_room', gameId);
    });
  }

  // ========== HTML builders ==========

  private buildLobbyHtml(code: string, players: PlayerInfo[], qrImg: string, maxPlayers: number): string {
    const validCount = players.filter(p => !p.isSpectator).length;
    const canStart = validCount >= maxPlayers;
    return `
      <div class="nav-bar"><span class="nav-title">房间大厅</span></div>
       <div class="scroll" style="flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch">
        <div class="sec-body">
          <div class="room-code">
            <div class="code">${code}</div>
            <div style="color:var(--label2);margin-top:4px;">分享给好友</div>
          </div>
          ${qrImg
            ? `<div style="text-align:center;padding:8px 0;">
                <img src="${qrImg}" style="width:280px;height:280px;max-width:90vw;border-radius:12px;" />
                <div style="color:var(--label3);font-size:13px;margin-top:4px;">让好友扫此码加入</div>
              </div>`
            : ''}
           <div class="section-hdr">玩家 (${validCount}/${maxPlayers})</div>
          ${this.buildPlayerRows(players.filter(p => !p.isSpectator), true)}
          ${players.some(p => p.isSpectator) ? `<div class="section-hdr" style="margin-top:12px;">观战 (${players.filter(p => p.isSpectator).length})</div>` : ''}
          ${this.buildPlayerRows(players.filter(p => p.isSpectator), true)}
          <button id="btn-start" class="btn btn-primary btn-block" style="margin-top:16px;" ${canStart ? '' : 'disabled'}>开始游戏</button>
          <button id="btn-share" class="btn btn-secondary btn-block" style="margin-top:8px;">📤 分享房间</button>
          <button id="btn-scan-guest" class="btn btn-secondary btn-block" style="margin-top:4px;">📷 扫访客码</button>
          <button id="btn-log" class="btn btn-secondary btn-block" style="margin-top:4px;">📋 记录</button>
        </div>
      </div>`;
  }

  private buildWaitHtml(code: string, players: PlayerInfo[]): string {
    return `
      <div class="nav-bar"><span class="nav-title">等待开局</span></div>
       <div class="scroll" style="flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch">
        <div class="sec-body">
          <div class="room-code"><div class="code">${code}</div></div>
          <div class="section-hdr">玩家 (${players.filter(p => !p.isSpectator).length})</div>
          ${this.buildPlayerRows(players.filter(p => !p.isSpectator))}
          ${players.some(p => p.isSpectator) ? `<div class="section-hdr" style="margin-top:12px;">观战 (${players.filter(p => p.isSpectator).length})</div>` : ''}
          ${this.buildPlayerRows(players.filter(p => p.isSpectator))}
          <div style="text-align:center;padding:32px;color:var(--label3);">等待主持人开局...</div>
        </div>
      </div>`;
  }

  private buildGuestQrHtml(code: string, qrImg: string): string {
    return `
      <div class="nav-bar"><span class="nav-title">请主持人扫码</span></div>
      <div class="scroll" style="flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch">
        <div class="sec-body" style="text-align:center;">
          <div class="room-code"><div class="code">${code}</div></div>
          ${qrImg
            ? `<img src="${qrImg}" style="width:280px;height:280px;max-width:90vw;border-radius:12px;" />
               <div style="color:var(--label3);font-size:13px;margin-top:8px;">请让主持人扫描此码完成连接</div>`
            : `<div style="color:var(--label2);font-size:14px;padding:16px 0;">等待主持人接入...</div>`}
          <button id="btn-log-guest" class="btn btn-secondary btn-block" style="margin-top:8px;">📋 记录</button>
        </div>
      </div>`;
  }

  private buildGameDetailHtml(gameName: string, description: string, playerCount: string): string {
    return `
      <div class="nav-bar"><span class="nav-title">${gameName}</span></div>
       <div class="scroll" style="flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch">
        <div class="sec-body">
          <div class="section-hdr">游戏详情</div>
          <div class="cell">
            <div class="cell-body">
              <div class="cell-title">${gameName}</div>
              <div class="cell-subtitle">${description} · ${playerCount}人</div>
            </div>
          </div>
          <button id="btn-create" class="btn btn-primary btn-block" style="margin-top:16px;">创建房间</button>
        </div>
      </div>`;
  }

  private buildPlayerRows(players: PlayerInfo[], withActions = false): string {
    return players.map(p => {
      const tag = p.isSpectator ? ' (观战)' : p.isHost ? ' (主持人)' : '';
      let btn = `<span style="margin-left:auto;font-size:12px;color:var(--label3)">${p.status || ''}</span>`;
      if (withActions && !p.isSpectator) {
        btn = `<button data-spectate-name="${p.name}" class="btn btn-secondary" style="margin-left:auto;font-size:12px;padding:4px 10px;">观战</button>`;
      } else if (withActions && p.isSpectator) {
        btn = `<button data-unspectate-name="${p.name}" class="btn btn-secondary" style="margin-left:auto;font-size:12px;padding:4px 10px;">转回玩家</button>`;
      }
      return `<div class="player-row"><span class="dot green"></span>${p.name}${tag}${btn}</div>`;
    }).join('');
  }

  private bindLobbyButtons(): void {
    qso('#btn-start', this.el)?.addEventListener('pointerdown', (e: Event) => {
      if ((e.target as HTMLButtonElement).disabled) return;
      this.emit('ui:start_game');
    });
    qso('#btn-share', this.el)?.addEventListener('pointerdown', () => {
      this.emit('ui:share_room');
    });
    qso('#btn-scan-guest', this.el)?.addEventListener('click', () => {
      this.emit('ui:open_scanner', (data: unknown) => {
        this.emit('ui:scan_guest', JSON.stringify(data));
      });
    });
    qso('#btn-log', this.el)?.addEventListener('pointerdown', () => {
      this.emit('ui:show_log');
    });
    this.el.querySelectorAll<HTMLButtonElement>('[data-spectate-name]').forEach(btn => {
      btn.addEventListener('pointerdown', () => {
        this.emit('ui:spectate_player', btn.dataset.spectateName!);
      });
    });
    this.el.querySelectorAll<HTMLButtonElement>('[data-unspectate-name]').forEach(btn => {
      btn.addEventListener('pointerdown', () => {
        this.emit('ui:unspectate_player', btn.dataset.unspectateName!);
      });
    });
  }
}
