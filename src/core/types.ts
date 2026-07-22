// ============================================================
// BoardGameSimulator — 全局类型定义
// ============================================================

// ---------- 卡牌 ----------
export type Suit = 'spade' | 'heart' | 'club' | 'diamond' | 'joker';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'small_joker' | 'big_joker';

export interface Card {
  id: string;           // 唯一标识，如 "sA" (黑桃A), "jS" (小王)
  suit: Suit;
  rank: Rank;
  name: string;         // 显示名称
  value: number;        // 点数排序值
  extra?: Record<string, unknown>; // 扩展属性
}

// ---------- 玩家 ----------
export interface PlayerState {
  index: number;
  name: string;
  hand: Card[];
  handCount: number;    // 冗余字段（便于PlayerView中不暴露手牌时仍显示数量）
  isHost: boolean;
  isDisconnected: boolean;
  extra?: Record<string, number | string>; // 如HP、金币等
}

export interface PlayerViewData {
  index: number;
  name: string;
  hand: Card[] | { count: number };  // 按visibility配置返回完整手牌或仅数量
  handCount: number;
  isDisconnected: boolean;
  extra?: Record<string, number | string>;
}

// ---------- 游戏状态 ----------
export type GamePhase = 'idle' | 'calling' | 'playing' | 'ended';

export interface PlayInfo {
  playerIndex: number;
  cards: Card[];
  pattern: string | null;  // 牌型名称，如 "straight", "bomb"
}

export interface GameState {
  version: number;
  players: PlayerState[];
  deck: Card[];
  discard: Card[];
  bottomCards: Card[];
  landlordIndex: number;
  currentTurn: number;
  phase: GamePhase;
  lastPlay: PlayInfo | null;
  passCount: number;
  winner: number | null;
}

// ---------- 玩家视图（过滤后发送给各玩家） ----------
export interface PublicState {
  currentTurn: number;
  phase: GamePhase;
  landlordIndex: number;
  lastPlay: PlayInfo | null;
  passCount: number;
  winner: number | null;
  discard: Card[];
  bottomCards: Card[] | { count: number };
}

export interface PlayerView {
  version: number;
  playerIndex: number;
  phase: GamePhase;
  currentTurn: number;
  winner: number | null;
  players: PlayerViewData[];
  publicState: PublicState;
}

// ---------- 动作 ----------
export interface GameAction {
  type: string;
  playerIndex: number;
  payload?: unknown;
  timestamp: number;
}

// ---------- 信息可见性配置 ----------
export type VisibilityMode = 'full' | 'count' | 'hidden' | 'owner_only';

export interface VisibilityRule {
  mode: VisibilityMode;
  description: string;
}

export interface VisibilityConfig {
  [fieldPath: string]: VisibilityRule;
}

// ---------- UI布局 ----------
export interface UISlotConfig {
  component: string;
  params?: Record<string, unknown>;
}

export interface UILayout {
  slots: Record<string, UISlotConfig>;
  presetSlots: string[];
}

// ---------- 编辑器内容上下文 ----------
export interface ActionContext {
  trigger: string;
  playerIndex: number;
}

// ---------- 校验 ----------
export type ValidationLevel = 'error' | 'warning';

export interface ValidationError {
  level: ValidationLevel;
  path: string;
  message: string;
}

// ---------- 错误响应 ----------
export interface ErrorResponse {
  code: string;
  message: string;
}

// ---------- 游戏配置（L1 + L2 + L3） ----------
export interface GameConfig {
  meta: { name: string; version: string; maxPlayers: number };
  l1: GameDataLayer;
  l2: GameBehaviorLayer;
  l3: string | null;  // JavaScript源码字符串
}

export interface GameDataLayer {
  cards: Card[];
  players: { count: number; initialResources?: Record<string, number> };
  uiLayout: UILayout;
  visibility: VisibilityConfig;
}

export interface GameBehaviorLayer {
  rules: BehaviorRule[];
}

export interface BehaviorRule {
  trigger: string;
  condition?: { type: string; params?: unknown };
  actions: BehaviorAction[];
}

export interface BehaviorAction {
  type: string;
  params?: unknown;
}
