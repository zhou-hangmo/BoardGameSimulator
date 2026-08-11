// ============================================================
// BoardGameSimulator — 德州扑克筹码管理器 圆桌视图 v2
// ============================================================
import { BaseView } from "./BaseView";
import { el, clear } from "../utils/dom";
import type { PlayerView } from "../core/types";
import type { HoldemExtra } from "../games/holdem/rules";

const PHASE_CN: Record<string, string> = {
  preflop: "Pre-flop", flop: "Flop", turn: "Turn", river: "River", showdown: "Showdown",
};

const TABLE_GRAY = "#7a7a7a";

export class HoldemView extends BaseView {
  private view: PlayerView | null = null;
  private extra: HoldemExtra | null = null;
  private configSent = false;
  private scroll!: HTMLElement;
  private statusEl!: HTMLElement;
  private connState: Record<number, string> = {};
  amHost = false;

  setConnState(map: Record<number, string>): void {
    this.connState = map;
  }

  constructor(parent: HTMLElement) {
    super(parent);
  }

  protected createEl(): HTMLElement {
    const root = el("div", { style: "height:100%;display:flex;flex-direction:column;background:var(--color-bg,#f5f5f7);" });
    const topBar = el("div", { class: "nav-bar" });
    this.statusEl = el("span", { style: "color:var(--label2);font-size:13px;flex:1;text-align:right;" });
    topBar.append(el("span", { class: "nav-title" }, ["德州扑克"]), this.statusEl);
    this.scroll = el("div", { style: "flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:8px 8px 100px;" });
    root.append(topBar, this.scroll);
    return root;
  }

  render(view: PlayerView): void {
    const extra = view.extra as HoldemExtra | undefined;
    if (!extra || !extra.players) return;
    this.view = view;
    this.extra = extra;
    this.update();
  }

  destroy(): void { super.destroy(); }
  private dispatch(type: string, payload: unknown): void { this.emit("ui:play_action", type, payload); }

  // ========== 渲染 ==========
  private update(): void {
    const view = this.view!;
    const extra = this.extra!;
    if (!extra.started && !this.configSent) {
      this.statusEl.textContent = "等待主机设置…";
      if (this.amHost && view.playerIndex === 0) { this.showConfigPanel(); }
      else { clear(this.scroll); this.scroll.appendChild(el("div", { style: "text-align:center;color:var(--label2);font-size:14px;padding:40px 0;" }, ["等待主机配置游戏参数…"])); }
      return;
    }
    if (!extra.started) return;
    clear(this.scroll);
    this.scroll.appendChild(this.buildTable(extra));
    this.renderBottom(extra);
    if (extra.undoRequest?.pending) this.showUndoRequest(extra);
  }

  // ========== 配置面板 ==========
  private showConfigPanel(): void {
    const view = this.view!;
    const mask = el("div", { style: "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;" });
    const panel = el("div", { style: "background:#fff;border-radius:14px;padding:16px;width:88vw;max-width:360px;max-height:90vh;overflow-y:auto;" });
    panel.append(el("div", { style: "font-weight:600;font-size:15px;margin-bottom:12px;" }, ["游戏配置"]));
    const fields: [string, string, string, string][] = [
      ["sb", "小盲", "number", "10"], ["bb", "大盲", "number", "20"],
      ["startingChips", "初始筹码", "number", "300"],
      ["borrowAmount", "借贷金额/次", "number", "300"], ["borrowLimit", "借贷上限(0=无限)", "number", "0"],
    ];
    const inputs: Record<string, HTMLInputElement> = {};
    for (const [key, label, type, dv] of fields) {
      const row = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:8px;" });
      row.appendChild(el("span", { style: "flex:1;font-size:13px;" }, [label]));
      const inp = el("input", { style: "width:100px;box-sizing:border-box;padding:6px 8px;border:1px solid #ddd;border-radius:8px;font-size:14px;text-align:right;" }) as HTMLInputElement;
      inp.type = type; inp.value = dv; if (type === "number") inp.inputMode = "numeric";
      row.appendChild(inp); panel.appendChild(row); inputs[key] = inp;
    }
    const toggles: [string, string, boolean][] = [
      ["blindsEnabled", "启用大小盲", true], ["borrowEnabled", "银行借贷", true], ["sidePotEnabled", "侧池", false],
    ];
    const toggleVals: Record<string, boolean> = {};
    for (const [key, label, dv] of toggles) {
      toggleVals[key] = dv;
      const row = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:8px;" });
      row.appendChild(el("span", { style: "flex:1;font-size:13px;" }, [label]));
      const sw = el("span", { style: "display:inline-block;padding:4px 14px;border-radius:12px;font-size:12px;cursor:pointer;background:" + (dv ? "#2fbf71" : "#ccc") + ";color:#fff;" }, [dv ? "ON" : "OFF"]);
      sw.addEventListener("pointerdown", () => { toggleVals[key] = !toggleVals[key]; sw.textContent = toggleVals[key] ? "ON" : "OFF"; sw.style.background = toggleVals[key] ? "#2fbf71" : "#ccc"; });
      row.appendChild(sw); panel.appendChild(row);
    }
    const playerList = el("div", { style: "font-size:12px;color:var(--label2);margin-bottom:8px;" });
    playerList.textContent = "玩家: " + (view.players.map(p => p.name).join(", ") || "无");
    panel.appendChild(playerList);
    const btn = el("button", { class: "btn btn-primary", style: "width:100%;margin-top:6px;" }, ["开始游戏"]);
    btn.addEventListener("pointerdown", () => {
      this.configSent = true; mask.remove();
      this.dispatch("holdem_init", {
        sb: parseInt(inputs["sb"].value, 10) || 10, bb: parseInt(inputs["bb"].value, 10) || 20,
        startingChips: parseInt(inputs["startingChips"].value, 10) || 300,
        borrowEnabled: toggleVals["borrowEnabled"], borrowAmount: parseInt(inputs["borrowAmount"].value, 10) || 300,
        borrowLimit: parseInt(inputs["borrowLimit"].value, 10) || 0,
        sidePotEnabled: toggleVals["sidePotEnabled"], blindsEnabled: toggleVals["blindsEnabled"],
        players: view.players.map(p => ({ index: p.index, name: p.name })),
      });
    });
    panel.appendChild(btn); mask.appendChild(panel); document.body.appendChild(mask);
  }

  // ========== 圆桌 ==========
  private buildTable(extra: HoldemExtra): HTMLElement {
    const n = extra.players.length;
    const wrap = el("div", { style: "position:relative;margin:0 auto;max-width:400px;aspect-ratio:1;" });
    const tableCircle = el("div", { style: "position:absolute;top:6%;left:6%;width:88%;height:88%;border-radius:50%;background:" + TABLE_GRAY + ";box-shadow:0 0 20px rgba(0,0,0,.25),inset 0 0 40px rgba(0,0,0,.15);" });
    wrap.appendChild(tableCircle);
    const center = el("div", { style: "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;z-index:2;" });
    center.appendChild(el("div", { style: "font-size:10px;color:rgba(255,255,255,.6);" }, ["奖池"]));
    center.appendChild(el("div", { style: "font-size:18px;font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.5);" }, ["$" + extra.pot]));
    if (extra.currentBet > 0) center.appendChild(el("div", { style: "font-size:10px;color:rgba(255,255,255,.5);" }, ["当前注 $" + extra.currentBet]));
    wrap.appendChild(center);
    const ph = PHASE_CN[extra.phase] ?? extra.phase;
    const phaseLabel = el("div", { style: "position:absolute;top:4%;left:50%;transform:translateX(-50%);font-size:10px;color:#fff;background:rgba(0,0,0,.35);border-radius:8px;padding:2px 10px;z-index:2;" }, [ph]);
    if (extra.phase !== "showdown") wrap.appendChild(phaseLabel);

    const radius = 43;
    for (let i = 0; i < n; i++) {
      const angle = (360 / n) * i - 90, rad = (angle * Math.PI) / 180;
      const x = 50 + radius * Math.cos(rad), y = 50 + radius * Math.sin(rad);
      const p = extra.players[i];
      if (p.totalBet > 0) {
        const betR = 34, bx = 50 + betR * Math.cos(rad), by = 50 + betR * Math.sin(rad);
        const betEl = el("div", { style: "position:absolute;left:" + bx + "%;top:" + by + "%;transform:translate(-50%,-50%);z-index:3;font-size:9px;font-weight:600;color:#ffd700;text-shadow:0 1px 2px rgba(0,0,0,.5);white-space:nowrap;" }, ["$" + p.totalBet + "（+$" + p.roundBet + "）"]);
        wrap.appendChild(betEl);
      }
      wrap.appendChild(this.buildPlayerCard(i, extra, x, y));
    }
    return wrap;
  }

  private buildPlayerCard(idx: number, extra: HoldemExtra, x: number, y: number): HTMLElement {
    const p = extra.players[idx], isMe = this.view?.playerIndex === idx;
    const isDealer = extra.blindsEnabled && extra.dealerIndex === idx;
    const isSB = extra.blindsEnabled && !p.folded && extra.phase === "preflop" && idx === (extra.dealerIndex + 1) % extra.players.length;
    const isBB = extra.blindsEnabled && !p.folded && extra.phase === "preflop" && idx === (extra.dealerIndex + 2) % extra.players.length;
    const isCurrent = extra.currentActor === idx;
    const dotColor = (this.connState[idx] ?? "online") === "reconnecting" ? "#e0a33c" : "#34c759";

    const card = el("div", { style: "position:absolute;left:" + x + "%;top:" + y + "%;transform:translate(-50%,-50%);z-index:3;border-radius:10px;background:rgba(255,255,255,0.92);padding:4px 10px;display:flex;align-items:center;gap:5px;box-shadow:0 1px 6px rgba(0,0,0,.18);white-space:nowrap;min-width:60px;max-width:100px;" + (isCurrent ? "border:2px solid #ffd700;" : "") + (p.folded ? "opacity:.45;" : "") });
    card.appendChild(el("span", { style: "width:6px;height:6px;border-radius:50%;background:" + dotColor + ";flex:none;" }));
    card.appendChild(el("span", { style: "font-size:10px;font-weight:600;color:var(--label1);overflow:hidden;text-overflow:ellipsis;" }, [p.name || ("P" + (idx + 1))]));
    card.appendChild(el("span", { style: "font-size:11px;font-weight:700;color:#333;margin-left:auto;" }, ["$" + p.chips]));

    const tags: string[] = [];
    if (isDealer) tags.push("庄家");
    if (isSB) tags.push("小盲");
    if (isBB) tags.push("大盲");
    if (p.folded) tags.push("弃牌");
    if (p.allIned) tags.push("ALL-IN");
    for (const t of tags) card.appendChild(el("span", { style: "font-size:7px;font-weight:700;padding:1px 3px;border-radius:3px;background:rgba(0,0,0,.45);color:#fff;white-space:nowrap;flex:none;" }, [t]));

    if (!isMe) {
      card.style.cursor = "pointer";
      card.addEventListener("pointerdown", (e) => { e.stopPropagation(); this.showGiveMoneyPanel(idx); });
    }
    return card;
  }

  // ========== 底部操作面板 ==========
  private renderBottom(extra: HoldemExtra): void {
    const old = document.getElementById("holdem-bottom"); old?.remove();
    const view = this.view!; const myIdx = view.playerIndex;
    const isMyTurn = extra.currentActor === myIdx; const p = extra.players[myIdx];

    const wrap = el("div", { id: "holdem-bottom", style: "position:fixed;bottom:0;left:50%;transform:translateX(-50%);z-index:10;width:100%;max-width:400px;" });
    const box = el("div", { style: "background:var(--color-bg2,#fff);border-top:1px solid var(--sep,#e0e0e0);padding:8px 12px 12px;padding-bottom:max(12px,env(safe-area-inset-bottom));border-radius:14px 14px 0 0;" });

    if (extra.phase === "showdown") {
      box.appendChild(this.buildShowdownSection(extra));
      if (this.amHost) box.appendChild(this.buildNewHandOrEnd(extra));
      wrap.appendChild(box); document.body.appendChild(wrap); return;
    }

    if (!isMyTurn) {
      const name = extra.currentActor >= 0 ? (extra.players[extra.currentActor]?.name ?? "?") : "?";
      box.appendChild(el("div", { style: "text-align:center;color:var(--label2);font-size:13px;padding:8px 0;" }, ["等待 " + name + " 行动…"]));
      if (p.acted && !extra.roundUndoUsed && !extra.undoRequest) box.appendChild(this.buildUndoBtn());
      if (extra.borrowEnabled) box.appendChild(this.buildBankBtn(extra));
      wrap.appendChild(box); document.body.appendChild(wrap); return;
    }

    const diff = extra.currentBet - p.roundBet;
    const hint = el("div", { style: "display:flex;align-items:center;gap:6px;margin-bottom:6px;" });
    hint.appendChild(el("span", { style: "font-size:13px;font-weight:600;" }, ["轮到你了"]));
    if (diff > 0 && diff < p.chips) hint.appendChild(el("span", { style: "font-size:11px;color:var(--label2);" }, ["需补 $" + diff]));
    box.appendChild(hint);

    const btnRow = el("div", { style: "display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;" });
    const canCheck = p.roundBet >= extra.currentBet;
    btnRow.appendChild(this.makeBtn("Fold", "#d33", () => this.confirmFold()));
    if (canCheck) {
      btnRow.appendChild(this.makeBtn("Check", "#666", () => this.dispatch("holdem_check", null)));
    } else {
      btnRow.appendChild(this.makeBtn("Call $" + Math.min(diff, p.chips), "#2fbf71", () => this.dispatch("holdem_call", null)));
    }
    btnRow.appendChild(this.makeBtn("Raise", "#4a90d9", () => this.showBetInput("raise")));
    if (extra.currentBet === 0) btnRow.appendChild(this.makeBtn("Bet", "#4a90d9", () => this.showBetInput("bet")));
    btnRow.appendChild(this.makeBtn("All-in", "#e0a33c", () => this.dispatch("holdem_all_in", null)));
    box.appendChild(btnRow);

    const inputArea = el("div", { id: "holdem-bet-input", style: "display:none;" }); box.appendChild(inputArea);
    if (extra.borrowEnabled) box.appendChild(this.buildBankBtn(extra));
    wrap.appendChild(box); document.body.appendChild(wrap);
  }

  private makeBtn(text: string, bg: string, onclick: () => void): HTMLElement {
    const btn = el("button", { style: "border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;color:#fff;background:" + bg + ";cursor:pointer;" }, [text]);
    btn.addEventListener("pointerdown", onclick); return btn;
  }

  private confirmFold(): void {
    const mask = el("div", { style: "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;" });
    const panel = el("div", { style: "background:#fff;border-radius:14px;padding:16px;width:80vw;max-width:280px;text-align:center;" });
    panel.append(el("div", { style: "font-weight:600;font-size:15px;margin-bottom:10px;" }, ["确认弃牌？"]));
    panel.append(el("div", { style: "font-size:12px;color:var(--label2);margin-bottom:12px;" }, ["弃牌后不可撤销"]));
    const confirm = el("button", { class: "btn btn-primary", style: "width:100%;margin-bottom:6px;background:#d33;" }, ["确认弃牌"]);
    confirm.addEventListener("pointerdown", () => { mask.remove(); this.dispatch("holdem_fold", null); });
    const cancel = el("button", { class: "btn btn-secondary", style: "width:100%;" }, ["取消"]);
    cancel.addEventListener("pointerdown", () => mask.remove());
    panel.append(confirm, cancel); mask.appendChild(panel); document.body.appendChild(mask);
  }

  // ========== 下注输入（空、无预设） ==========
  private showBetInput(mode: "bet" | "raise"): void {
    const area = document.getElementById("holdem-bet-input"); if (!area) return;
    const extra = this.extra!; const p = extra.players[this.view!.playerIndex];
    const minAmount = mode === "raise" ? extra.currentBet * 2 : extra.bbAmount;
    clear(area); area.style.display = "block";
    const row = el("div", { style: "display:flex;gap:6px;align-items:center;" });
    const inp = el("input", { style: "flex:1;box-sizing:border-box;padding:8px 10px;border:1px solid #ddd;border-radius:8px;font-size:16px;text-align:right;" }) as HTMLInputElement;
    inp.type = "number"; inp.inputMode = "numeric"; inp.placeholder = "输入金额"; inp.min = String(minAmount); inp.max = String(p.chips);
    row.appendChild(inp);
    const confirm = el("button", { class: "btn btn-primary", style: "font-size:13px;padding:8px 16px;white-space:nowrap;" }, ["确定"]);
    confirm.addEventListener("pointerdown", () => {
      const amt = parseInt(inp.value, 10);
      if (isNaN(amt) || amt < minAmount || amt > p.chips) { this.toast("金额不合法"); return; }
      if (mode === "raise") this.dispatch("holdem_raise", { amount: amt }); else this.dispatch("holdem_bet", { amount: amt });
    });
    row.appendChild(confirm);
    const cancel = el("button", { class: "btn btn-secondary", style: "font-size:12px;padding:6px 10px;" }, ["取消"]);
    cancel.addEventListener("pointerdown", () => { area.style.display = "none"; });
    row.appendChild(cancel); area.appendChild(row);
    setTimeout(() => inp.focus(), 0);
  }

  // ========== Showdown ==========
  private buildShowdownSection(extra: HoldemExtra): HTMLElement {
    const box = el("div", {});
    box.appendChild(el("div", { style: "text-align:center;font-size:14px;font-weight:600;margin-bottom:6px;" }, ["Showdown · 赢家取钱"]));
    const row = el("div", { style: "display:flex;gap:6px;align-items:center;" });
    const inp = el("input", { style: "flex:1;box-sizing:border-box;padding:8px 10px;border:1px solid #ddd;border-radius:8px;font-size:16px;text-align:right;" }) as HTMLInputElement;
    inp.type = "number"; inp.inputMode = "numeric"; inp.placeholder = "取款金额"; inp.max = String(extra.pot);
    row.appendChild(inp);
    const confirm = el("button", { class: "btn btn-primary", style: "font-size:13px;padding:8px 16px;white-space:nowrap;" }, ["取钱"]);
    confirm.addEventListener("pointerdown", () => {
      const amt = parseInt(inp.value, 10); if (isNaN(amt) || amt <= 0 || amt > extra.pot) { this.toast("金额不合法"); return; }
      this.dispatch("holdem_take_money", { amount: amt });
    });
    row.appendChild(confirm); box.appendChild(row);
    return box;
  }

  private buildNewHandOrEnd(extra: HoldemExtra): HTMLElement {
    const box = el("div", { style: "display:flex;gap:8px;margin-top:8px;" });
    const canNew = extra.pot === 0;
    const nxt = el("button", { class: "btn btn-primary", style: "flex:1;font-size:12px;padding:8px;" + (canNew ? "" : "opacity:.5;pointer-events:none;") }, ["新一局"]);
    if (!canNew) nxt.title = "奖池未取完";
    if (canNew) nxt.addEventListener("pointerdown", () => this.dispatch("holdem_new_hand", null));
    box.appendChild(nxt);
    const endBtn = el("button", { class: "btn btn-secondary", style: "flex:1;font-size:12px;padding:8px;color:#d33;" }, ["结束游戏"]);
    endBtn.addEventListener("pointerdown", () => this.dispatch("holdem_end_game", null));
    box.appendChild(endBtn);
    return box;
  }

  // ========== Bank ==========
  private buildBankBtn(extra: HoldemExtra): HTMLElement {
    const row = el("div", { style: "text-align:center;margin-top:6px;" });
    const btn = el("button", { class: "btn btn-secondary", style: "font-size:12px;padding:6px 16px;" }, ["Bank"]);
    btn.addEventListener("pointerdown", () => this.showBankPanel(extra));
    row.appendChild(btn); return row;
  }

  private showBankPanel(extra: HoldemExtra): void {
    const myIdx = this.view!.playerIndex; const p = extra.players[myIdx];
    const mask = el("div", { style: "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;" });
    const panel = el("div", { style: "background:#fff;border-radius:14px;padding:16px;width:88vw;max-width:320px;" });
    panel.append(el("div", { style: "font-weight:600;font-size:15px;margin-bottom:6px;" }, ["Bank"]));
    panel.append(el("div", { style: "font-size:12px;color:var(--label2);margin-bottom:10px;" }, ["已借: $" + p.borrowUsed + (extra.borrowLimit > 0 ? " / 上限 $" + extra.borrowLimit : "")]));

    const inp = el("input", { style: "width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #ddd;border-radius:8px;font-size:16px;text-align:right;margin-bottom:10px;" }) as HTMLInputElement;
    inp.type = "number"; inp.inputMode = "numeric"; inp.placeholder = "金额";
    panel.append(inp);

    const btnRow = el("div", { style: "display:flex;gap:8px;" });
    const borrowBtn = el("button", { class: "btn btn-primary", style: "flex:1;font-size:13px;padding:8px;" }, ["借款"]);
    borrowBtn.addEventListener("pointerdown", () => {
      const amt = parseInt(inp.value, 10) || extra.borrowAmount;
      if (amt <= 0) { this.toast("金额不合法"); return; }
      mask.remove(); this.dispatch("holdem_borrow", { amount: amt });
    });
    const repayBtn = el("button", { class: "btn btn-secondary", style: "flex:1;font-size:13px;padding:8px;" }, ["还款"]);
    repayBtn.addEventListener("pointerdown", () => {
      const amt = parseInt(inp.value, 10);
      if (isNaN(amt) || amt <= 0) { this.toast("金额不合法"); return; }
      mask.remove(); this.dispatch("holdem_repay", { amount: amt });
    });
    btnRow.append(borrowBtn, repayBtn); panel.append(btnRow);

    const cancel = el("button", { class: "btn btn-secondary", style: "width:100%;margin-top:8px;" }, ["关闭"]);
    cancel.addEventListener("pointerdown", () => mask.remove());
    panel.append(cancel); mask.appendChild(panel); document.body.appendChild(mask);
    setTimeout(() => inp.focus(), 0);
  }

  // ========== 撤回 ==========
  private buildUndoBtn(): HTMLElement {
    const btn = el("button", { class: "btn btn-secondary", style: "font-size:11px;padding:4px 10px;color:#e0a33c;margin-top:4px;" }, ["撤回"]);
    btn.addEventListener("pointerdown", () => this.dispatch("holdem_request_undo", null));
    return el("div", { style: "text-align:center;" }, [btn]);
  }

  private showUndoRequest(extra: HoldemExtra): void {
    if (!this.amHost || this.view?.playerIndex !== 0) return;
    const req = extra.undoRequest!;
    const mask = el("div", { style: "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;" });
    const panel = el("div", { style: "background:#fff;border-radius:14px;padding:16px;width:80vw;max-width:300px;text-align:center;" });
    panel.append(el("div", { style: "font-weight:600;font-size:15px;margin-bottom:8px;" }, ["撤回申请"]));
    panel.append(el("div", { style: "font-size:13px;color:var(--label1);margin-bottom:12px;" }, [req.fromName + " 请求撤回本轮操作"]));
    const approve = el("button", { class: "btn btn-primary", style: "flex:1;" }, ["同意"]);
    approve.addEventListener("pointerdown", () => { mask.remove(); this.dispatch("holdem_approve_undo", null); });
    const reject = el("button", { class: "btn btn-secondary", style: "flex:1;color:#d33;" }, ["拒绝"]);
    reject.addEventListener("pointerdown", () => { mask.remove(); this.dispatch("holdem_reject_undo", null); });
    const btnRow = el("div", { style: "display:flex;gap:8px;" }); btnRow.append(approve, reject); panel.append(btnRow);
    mask.appendChild(panel); document.body.appendChild(mask);
  }

  // ========== 给钱 ==========
  private showGiveMoneyPanel(toIndex: number): void {
    const extra = this.extra!; const target = extra.players[toIndex];
    const me = extra.players[this.view!.playerIndex];
    const mask = el("div", { style: "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;" });
    const panel = el("div", { style: "background:#fff;border-radius:14px;padding:16px;width:80vw;max-width:300px;text-align:center;" });
    panel.append(el("div", { style: "font-weight:600;font-size:15px;margin-bottom:6px;" }, ["转账给 " + target.name]));
    panel.append(el("div", { style: "font-size:12px;color:var(--label2);margin-bottom:10px;" }, ["你的筹码: $" + me.chips]));
    const inp = el("input", { style: "width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #ddd;border-radius:8px;font-size:16px;text-align:right;" }) as HTMLInputElement;
    inp.type = "number"; inp.inputMode = "numeric"; inp.placeholder = "金额";
    panel.append(inp);
    const cfm = el("button", { class: "btn btn-primary", style: "width:100%;margin-top:10px;" }, ["确定"]);
    cfm.addEventListener("pointerdown", () => {
      const amt = parseInt(inp.value, 10); if (isNaN(amt) || amt <= 0 || amt > me.chips) { this.toast("金额不合法"); return; }
      mask.remove(); this.dispatch("holdem_give_money", { toIndex, amount: amt });
    });
    panel.append(cfm);
    const cancel = el("button", { class: "btn btn-secondary", style: "width:100%;margin-top:6px;" }, ["取消"]);
    cancel.addEventListener("pointerdown", () => mask.remove());
    panel.append(cancel); mask.appendChild(panel); document.body.appendChild(mask);
    setTimeout(() => inp.focus(), 0);
  }
}
