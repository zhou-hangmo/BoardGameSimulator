// ============================================================
// BoardGameSimulator — 大厅协议类型（服务器 ↔ 客户端）
// 常驻大厅：N 玩家在线；主机发起游戏；游戏结束自动回大厅
// ============================================================

/** 游戏库条目（服务器注册表，广播给所有玩家） */
export interface GameMeta {
  id: string;
  name: string;
  description: string;
  minPlayers: number;   // 允许游戏位数量下限
  maxPlayers: number;   // 允许游戏位数量上限（可与 min 相同）
  ready: boolean;
}

/** 大厅玩家 */
export interface LobbyPlayer {
  id: string;          // 'player-0' / 'player-1' ...
  name: string;
  isHost: boolean;
  wantPlay: boolean;   // 座位声明：我想玩 / 我观战
}

/** 大厅状态（服务器广播） */
export interface LobbyState {
  status: 'lobby' | 'playing';
  players: LobbyPlayer[];
  games: GameMeta[];
  currentGame: string | null;   // 进行中的游戏 id（playing 时）
  you: string;                  // 本机 player id
  notice?: string;              // 提示（如"游戏结束"）
}

/** 主机发起游戏时的座位分配 */
export interface SeatAssign {
  playerId: string;
  seat: 'player' | 'spectator';
}

/** 游戏开始（服务器广播） */
export interface GameStarted {
  gameId: string;
  seats: Record<string, number>;  // 游戏位玩家 id -> 游戏内位置 (0..n-1)
  spectators: string[];           // 观战玩家 id 列表
}

/** 客户端 → 服务器消息 */
export type ClientMsg =
  | { type: 'register'; name?: string; playerId?: string }
  | { type: 'rename'; name: string }
  | { type: 'set_seat'; wantPlay: boolean }
  | { type: 'start_game'; gameId: string; seats: SeatAssign[] }
  | { type: 'action'; payload: unknown }
  | { type: 'back_to_lobby' };   // 主机中止游戏

/** 服务器 → 客户端消息 */
export type ServerMsg =
  | { type: 'lobby_state'; payload: LobbyState }
  | { type: 'game_started'; payload: GameStarted }
  | { type: 'game_state'; payload: unknown }        // PlayerView（已按座位过滤）
  | { type: 'spectate'; payload: unknown }          // SpectateData（观战）
  | { type: 'back_to_lobby'; payload?: { notice?: string } }
  | { type: 'error'; payload: { message: string } };
