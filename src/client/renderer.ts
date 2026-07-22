// ============================================================
// BoardGameSimulator — Renderer v3 (merged scroll, floating home, iOS colors)
// ============================================================
/// <reference types="vite/client" />
import { animate } from 'motion';
import type { PlayerView } from '../core/types';

const ARROW_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="#0088ff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4l6 6-6 6"/></svg>`;

export interface GameMeta {
  id: string; name: string; description: string;
  playerCount: string; cardCount?: number; tags: string[]; ready: boolean; config?: unknown;
}
export interface AppCallbacks {
  onImportGame: () => void; onCreateRoom: (gameId: string) => Promise<string>;
  onJoinRoom: (code: string) => Promise<void>; onStartGame: () => void;
  onPlayAction: (type: string, payload: unknown) => void; onLeaveRoom: () => void;
  onShareRoom: () => void; onSaveGame: () => Promise<string>;
  onLoadGame: (data: string) => void;
  installedGames: GameMeta[];
}

export class Renderer {
  private el: HTMLElement;
  private cb!: AppCallbacks;
  private gameBuilt = false;
  private top!: HTMLElement; private main!: HTMLElement; private hand!: HTMLElement;
  private btnPlay!: HTMLButtonElement; private btnPass!: HTMLButtonElement;

  constructor(el: HTMLElement) {
    this.el = el;
    // Global home button — always on body, never removed
    const btn = document.createElement('div');
    btn.id = 'global-home';
    btn.innerHTML = '⌂';
    btn.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);width:48px;height:48px;border-radius:50%;background:#fff;border:1px solid rgba(0,0,0,.1);box-shadow:0 2px 12px rgba(0,0,0,.08);display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;z-index:99999;color:#333;';
    btn.addEventListener('click', () => this.showHomeLibrary());
    document.body.appendChild(btn);
  }
  init(cb: AppCallbacks) { this.cb = cb; this.showHomeLibrary(); }

  // ========== HOME + LIBRARY (merged scroll) ==========
  showHomeLibrary(): void {
    this.gameBuilt = false;
    const games = this.cb.installedGames;
    this.el.innerHTML = `
      <div class="scroll-host" id="scroll-host">
        <section class="home-sec">
          <input type="file" id="load-input" accept=".json,image/*" style="display:none"><button id="btn-load" class="btn btn-secondary" style="position:absolute;top:12px;right:12px;font-size:13px;padding:6px 12px;z-index:10;">📂</button><div class="home-logo"><img src="${import.meta.env.BASE_URL}assets/icons/app-logo.svg" alt="logo" /></div>

          <div class="input-wrap" id="wrap">
            <input class="input-box" id="code-input" maxlength="6" autocomplete="off" inputmode="text" />
            <div class="input-arrow" id="arrow">${ARROW_SVG}</div>
          </div>
        </section>
        <section class="lib-sec" id="lib-section">
          <div class="nav-bar"><span class="nav-title">游戏库</span></div>
          ${games.map(g => `<div class="cell" data-gid="${g.id}"><div class="cell-icon game">🃏</div><div class="cell-body"><div class="cell-title">${g.name}</div><div class="cell-subtitle">${g.description} · ${g.playerCount}人</div></div></div>`).join('')}
          <div class="cell" id="cell-import"><div class="cell-icon import">+</div><div class="cell-body"><div class="cell-title">导入 game.json</div></div></div>
          <div style="height:60px;"></div>
        </section>
      </div>
      `;
// Load QR button
    const loadInput = document.getElementById('load-input') as HTMLInputElement;
    loadInput?.addEventListener('change', async () => {
      const f = loadInput.files?.[0]; if (!f) return;
      this.showToast('加载中...');
      try {
        const text = await f.text();
        const data = JSON.parse(text);
        // Check if it is a game state directly
        if (data.players) { this.cb.onLoadGame(text); return; }
        // Try QR decode
        const { decodeQR } = await import('../core/qrcode');
        const sd = decodeQR(text);
        if (sd?.sdp) { this.cb.onLoadGame(sd.sdp); return; }
        this.showToast('无法识别');
      } catch { this.showToast('文件无效'); }
    });
    document.getElementById('btn-load')?.addEventListener('pointerdown', () => loadInput?.click());
    // Input
    const input = document.getElementById('code-input') as HTMLInputElement;
    const arrow = document.getElementById('arrow')!;
    input.addEventListener('input', () => {
      const v = input.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase(); input.value = v;
      v.length === 6 ? arrow.classList.add('on') : arrow.classList.remove('on');
    });
    arrow.addEventListener('pointerdown', async () => {
      if (input.value.length !== 6) return; input.blur();
      try { await this.cb.onJoinRoom(input.value); } catch { this.showToast('加入失败'); }
    });
    // iOS-style drag + snap (scrollTop, overflow:auto)
    const host = document.getElementById('scroll-host')!;
    const homeBtn = document.getElementById('global-home')!;
    let atHome = true; let dragging = false; let dragStart = 0; let offset = 0;

    const snapTo = (toHome: boolean) => {
      atHome = toHome;
      offset = toHome ? 0 : -host.clientHeight;
      host.style.transition = "transform 0.4s cubic-bezier(0.23, 1, 0.32, 1)";
      host.style.transform = "translateY(" + offset + "px)";
      animate(homeBtn, { transform: 'translateX(-50%) scale(0)', opacity: 0 }, { duration: 0.1 });
      setTimeout(() => animate(homeBtn, { transform: 'translateX(-50%) scale(1)', opacity: 1 }, { type: 'spring', bounce: 0.3, duration: 0.3 }), 250);
    };
    const isInteractive = (el: any) => { while(el){ if(["INPUT","BUTTON","TEXTAREA","SELECT"].includes(el.tagName)) return true; el=el.parentElement; } return false; };
    const onDown = (y: number) => { if(isInteractive((window.event as any)?.target)) return;
      dragging = true; dragStart = y;
      animate(homeBtn, { transform: 'translateX(-50%) scale(0)', opacity: 0 }, { duration: 0.1 });
    };
    const onMove = (y: number) => {
      if (!dragging) return;
      const dy = dragStart - y; const base = atHome ? 0 : -host.clientHeight;
      offset = Math.max(-host.clientHeight, Math.min(0, base + dy));
      host.style.transition = "none";
      host.style.transform = "translateY(" + offset + "px)";
    };
    const onUp = () => {
      if (!dragging) return; dragging = false;
      host.style.transition = "transform 0.35s cubic-bezier(0.23, 1, 0.32, 1)";
      snapTo(Math.abs(offset + (atHome ? 0 : host.clientHeight)) < host.clientHeight * 0.3 ? atHome : !atHome);
    };

    host.addEventListener('touchstart', e => onDown(e.touches[0].clientY), { passive: true });
    host.addEventListener('touchmove', e => onMove(e.touches[0].clientY), { passive: true });
    host.addEventListener('touchend', () => onUp());
    host.addEventListener('mousedown', e => { e.preventDefault(); onDown(e.clientY); });
    window.addEventListener('mousemove', e => onMove(e.clientY));
    window.addEventListener('mouseup', () => onUp());
    host.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.deltaY > 0 && atHome) snapTo(false);
      else if (e.deltaY < 0 && !atHome) snapTo(true);
    }, { passive: false });
    // Home button + Library clicks
    this.el.querySelectorAll('.cell[data-gid]').forEach(c => c.addEventListener('click', () => this.showGameDetail((c as HTMLElement).dataset.gid!)));
    document.getElementById('cell-import')?.addEventListener('click', () => this.cb.onImportGame());
  }

  // ========== SECONDARY SCREENS ==========
  private renderSecondary(title: string, body: string): void {
    this.gameBuilt = false;
    this.el.innerHTML = `<div class="nav-bar"><span class="nav-title">${title}</span></div><div class="scroll">${body}</div>`;
    this.addSwipeBack();
  }

  // Left-edge swipe to go back
  private addSwipeBack(): void {
    let sx = 0; let sy = 0; let swiping = false;
    const EDGE = 32; const THRESHOLD = 80;
    document.addEventListener('touchstart', (e: TouchEvent) => {
      const t = e.touches[0];
      if (t.clientX < EDGE) { swiping = true; sx = t.clientX; sy = t.clientY; }
    }, { passive: true });
    document.addEventListener('touchmove', (e: TouchEvent) => {
      if (!swiping) return;
      const dx = e.touches[0].clientX - sx;
      const dy = Math.abs(e.touches[0].clientY - sy);
      if (dy > dx && dy > 20) { swiping = false; return; } // vertical, cancel
      if (dx > 10) this.el.style.transform = `translateX(${Math.min(dx * 0.6, 120)}px)`;
    }, { passive: true });
    document.addEventListener('touchend', (e: TouchEvent) => {
      if (!swiping) return; swiping = false;
      const dx = e.changedTouches[0].clientX - sx;
      this.el.style.transform = '';
      if (dx > THRESHOLD) this.showHomeLibrary();
    });
  }

  showGameDetail(gameId: string): void {
    const g = this.cb.installedGames.find(x => x.id === gameId); if (!g) return;
    this.renderSecondary(g.name, `<div class="sec-body"><div class="section-hdr">游戏详情</div><div class="cell"><div class="cell-body"><div class="cell-title">${g.name}</div><div class="cell-subtitle">${g.description} · ${g.playerCount}人</div></div></div><button id="btn-create" class="btn btn-primary btn-block" style="margin-top:16px;">创建房间</button></div>`);
    document.getElementById('btn-create')?.addEventListener('pointerdown', () => this.cb.onCreateRoom(g.id));
  }
  showLobby(code: string, ps: { name: string; isHost: boolean }[]): void {
    this.renderSecondary('房间大厅', `<div class="sec-body"><div class="room-code"><div class="code">${code}</div><div style="color:var(--label2);margin-top:4px;">分享给好友</div></div><div class="section-hdr">玩家 (${ps.length})</div>${ps.map(p=>`<div class="player-row"><span class="dot g"></span>${p.name}${p.isHost?' (主持人)':''}</div>`).join('')}<button id="btn-start" class="btn btn-primary btn-block" style="margin-top:16px;" ${ps.length<2?'disabled':''}>开始游戏</button><button id="btn-share" class="btn btn-secondary btn-block" style="margin-top:8px;">📤 分享房间</button></div>`);
    document.getElementById('btn-start')?.addEventListener('pointerdown', (e: any) => { if((e.target as HTMLButtonElement).disabled) return; this.cb.onStartGame(); });
    document.getElementById('btn-share')?.addEventListener('pointerdown', () => this.cb.onShareRoom());
  }
  showWaitRoom(code: string, ps: { name: string; isHost: boolean }[]): void {
    this.renderSecondary('等待开局', `<div class="sec-body"><div class="room-code"><div class="code">${code}</div></div><div class="section-hdr">已加入玩家</div>${ps.map(p=>`<div class="player-row"><span class="dot g"></span>${p.name}${p.isHost?' (主持人)':''}</div>`).join('')}<div style="text-align:center;padding:32px;color:var(--label3);">等待主持人开局...</div></div>`);
  }

  // ========== GAME SCREEN ==========
  private buildGame(): void {
    if (this.gameBuilt) return; this.gameBuilt = true;
    this.el.innerHTML = `<div class="game-top" id="gtop"></div><div class="game-main" id="gmain"></div><div class="game-bar-bot"><div class="hand-row" id="ghand"></div><div class="action-row"><button id="btn-play" class="btn btn-primary" disabled>出牌</button><button id="btn-pass" class="btn btn-secondary" disabled>不出</button><button id="btn-save" class="btn btn-secondary" style="margin-left:4px;">💾</button></div></div>`;
    this.top=document.getElementById('gtop')!;this.main=document.getElementById('gmain')!;this.hand=document.getElementById('ghand')!;
    this.btnPlay=document.getElementById('btn-play') as HTMLButtonElement;this.btnPass=document.getElementById('btn-pass') as HTMLButtonElement;
    this.btnPlay.addEventListener('pointerdown',()=>{const ids=Array.from(this.hand.querySelectorAll('.card-hand.sel')).map(e=>(e as HTMLElement).dataset.cardId!);if(ids.length)this.cb.onPlayAction('play_cards',{cards:ids});});
    this.btnPass.addEventListener('pointerdown',()=>this.cb.onPlayAction('pass',null));document.getElementById('btn-save')?.addEventListener('pointerdown',async()=>{const u=await this.cb.onSaveGame();if(u){const a=document.createElement('a');a.href=u;a.download='game.png';a.click();}});
  }

  showGame(v: PlayerView): void {
    this.buildGame();
    const {players,publicState,playerIndex}=v;
    const isCalling=v.phase==='calling',isPlaying=v.phase==='playing',isEnded=v.phase==='ended';
    const my=publicState.currentTurn===playerIndex;
    const ld=publicState.landlordIndex>=0?players[publicState.landlordIndex]:null;
    this.top.textContent=`${isCalling?'叫地主':isPlaying?'游戏中':isEnded?'结束':''}${ld?' · 地主:'+ld.name:''}${isPlaying?' · 轮到:'+players[publicState.currentTurn].name:''}`;
    let m='';
    for(const o of players.filter((_,i)=>i!==playerIndex)){
      m+=`<div class="opp-row">${'<div class="card-back"></div>'.repeat(Math.min(o.handCount,10))}</div><div class="opp-name">${o.name} (${o.handCount}张)</div>`;
    }
    m+='<div class="play-zone">';
    if(publicState.lastPlay){const lp=publicState.lastPlay;m+=lp.cards.map(c=>`<div class="play-card">${c.name}</div>`).join('');m+=`<div class="play-info">${players[lp.playerIndex].name} 出了 ${lp.cards.length} 张</div>`;}
    else if(isPlaying)m+='<span class="wait-text">等待出牌...</span>';
    m+='</div>';
    if(isCalling&&my)m+='<div class="call-btns"><button id="btn-call" class="btn btn-primary">叫地主</button><button id="btn-nocall" class="btn btn-secondary">不叫</button></div>';
    if(isEnded&&publicState.winner!==null){const won=publicState.winner===playerIndex||(ld&&publicState.winner!==publicState.landlordIndex&&playerIndex!==publicState.landlordIndex);m+=`<div class="game-over-overlay"><div class="go-text" style="color:${won?'var(--green)':'var(--red)'}">${won?'你赢了！':'游戏结束'}</div><button id="btn-back-game" class="btn btn-primary">返回</button></div>`;}
    this.main.innerHTML=m;
    const hand=Array.isArray(players[playerIndex].hand)?players[playerIndex].hand:[];
    this.hand.innerHTML=hand.map(c=>`<div class="card-hand" data-card-id="${c.id}" data-suit="${c.suit}">${c.name}</div>`).join('');
    this.hand.querySelectorAll('.card-hand').forEach(el=>el.addEventListener('pointerdown',e=>{e.preventDefault();el.classList.toggle('sel');}));
    if(isCalling&&my){this.btnPlay.style.display='none';this.btnPass.style.display='none';document.getElementById('btn-call')?.addEventListener('pointerdown',()=>this.cb.onPlayAction('call_landlord',{call:true}));document.getElementById('btn-nocall')?.addEventListener('pointerdown',()=>this.cb.onPlayAction('call_landlord',{call:false}));}
    else{this.btnPlay.style.display='';this.btnPass.style.display='';this.btnPlay.disabled=!my||!isPlaying;this.btnPass.disabled=!my||!isPlaying;}
    document.getElementById('btn-back-game')?.addEventListener('click',()=>{this.cb.onLeaveRoom();this.showHomeLibrary();});
  }

  showToast(msg: string): void {
    const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);
    animate(t,{opacity:[0,1],y:[8,0]},{type:'spring',bounce:.3,duration:.3});
    setTimeout(()=>{animate(t,{opacity:0,y:-4},{type:'spring',bounce:0,duration:.2}).finished.then(()=>t.remove());},2000);
  }
}
