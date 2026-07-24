// ============================================================
// BoardGameSimulator — 消息类型常量定义
// ============================================================

/** P2P 消息类型 */
export const MSG = {
  ASSIGN:   'assign',
  LOBBY:    'lobby',
  STATE:    'state',
  ERROR:    'error',
} as const;

export type MsgType = (typeof MSG)[keyof typeof MSG];

/** 游戏动作类型 */
export const ACTION = {
  START_GAME:     'start_game',
  CALL_LANDLORD:  'call_landlord',
  PLAY_CARDS:     'play_cards',
  PASS:           'pass',
} as const;

export type ActionType = (typeof ACTION)[keyof typeof ACTION];

/** 事件总线事件名 */
export const EVENTS = {
  UI_PLAY_ACTION:   'ui:play_action',
  UI_JOIN_ROOM:     'ui:join_room',
  UI_CREATE_ROOM:   'ui:create_room',
  UI_START_GAME:    'ui:start_game',
  UI_LEAVE_ROOM:    'ui:leave_room',
  UI_SHARE_ROOM:    'ui:share_room',
  UI_SAVE_GAME:     'ui:save_game',
  UI_LOAD_GAME:     'ui:load_game',
  UI_IMPORT_GAME:   'ui:import_game',
  UI_SCAN_GUEST:    'ui:scan_guest',
  GAME_STATE_SYNC:  'game:state_sync',
  GAME_ERROR:       'game:error',
  TOAST:            'app:toast',
  VIEW_CHANGE:      'app:view_change',
} as const;
