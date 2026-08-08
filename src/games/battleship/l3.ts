// ============================================================
// BoardGameSimulator — 海战棋 L3 沙箱脚本（与 rules.ts 呼应）
// 在受限 Worker 中执行：无 DOM / localStorage / fetch
// ============================================================

export const l3Script = `
// ---------- 常量 ----------
var COLS = 'ABCDEFGHIJ';

function parseCell(cell) {
  if (typeof cell !== 'string') return null;
  var m = /^([A-J])(10|[1-9])$/.exec(cell);
  if (!m) return null;
  return { r: m[2] === '10' ? 9 : Number(m[2]) - 1, c: COLS.indexOf(m[1]) };
}

function boardOf(state, idx) {
  var extra = state && state.extra;
  return extra && Array.isArray(extra.boards) ? extra.boards[idx] : null;
}

function shipOf(board, shipId) {
  return board.ships.find(function (s) { return s.id === shipId; });
}

function validShape(cells) {
  if (!cells || cells.length === 0) return false;
  var pts = cells.map(parseCell);
  if (pts.some(function (p) { return !p; })) return false;
  if (new Set(cells).size !== cells.length) return false;
  var rows = pts.map(function (p) { return p.r; });
  var cols = pts.map(function (p) { return p.c; });
  var vertical = rows.every(function (r) { return r === rows[0]; });
  var horizontal = cols.every(function (c) { return c === cols[0]; });
  if (!vertical && !horizontal) return false;
  var line = (vertical ? cols : rows).slice().sort(function (a, b) { return a - b; });
  for (var i = 1; i < line.length; i++) {
    if (line[i] !== line[i - 1] + 1) return false;
  }
  return true;
}

// ---------- 布阵校验 ----------

function placeShip(state, playerIndex, shipId, cells) {
  var extra = state.extra;
  if (!extra || extra.stage !== 'placement') return { ok: false, error: '当前不在布阵阶段' };
  var board = boardOf(state, playerIndex);
  if (!board) return { ok: false, error: '棋盘未初始化' };
  var ship = shipOf(board, shipId);
  if (!ship) return { ok: false, error: '未知舰船' };
  if (!cells || cells.length !== ship.size) return { ok: false, error: '长度不符' };
  if (!validShape(cells)) return { ok: false, error: '必须横/竖一条直线且连续' };
  var selfCells = ship.cells || [];
  var otherCells = board.ships
    .filter(function (s) { return s.id !== shipId; })
    .reduce(function (acc, s) { return acc.concat(s.cells); }, []);
  var conflict = cells.some(function (c) { return otherCells.indexOf(c) >= 0; });
  if (conflict) return { ok: false, error: '与已有舰船重叠' };
  return { ok: true };
}

function removeShip(state, playerIndex, shipId) {
  var extra = state.extra;
  if (!extra || extra.stage !== 'placement') return { ok: false, error: '当前不在布阵阶段' };
  var board = boardOf(state, playerIndex);
  if (!board) return { ok: false, error: '棋盘未初始化' };
  var ship = shipOf(board, shipId);
  if (!ship) return { ok: false, error: '未知舰船' };
  if (!ship.cells || ship.cells.length === 0) return { ok: false, error: '该舰未部署' };
  return { ok: true };
}

function randomPlace(state, playerIndex) {
  var extra = state.extra;
  if (!extra || extra.stage !== 'placement') return { ok: false, error: '当前不在布阵阶段' };
  var board = boardOf(state, playerIndex);
  if (!board) return { ok: false, error: '棋盘未初始化' };
  if (board.placed && board.confirmed) return { ok: false, error: '该玩家已确认布阵' };
  return { ok: true };
}

function confirmBoard(state, playerIndex) {
  var extra = state.extra;
  if (!extra || extra.stage !== 'placement') return { ok: false, error: '当前不在布阵阶段' };
  var board = boardOf(state, playerIndex);
  if (!board) return { ok: false, error: '棋盘未初始化' };
  if (!board.placed) return { ok: false, error: '请先部署全部舰船' };
  if (board.confirmed) return { ok: false, error: '已确认布阵' };
  return { ok: true };
}

// ---------- 开火校验 ----------

function fire(state, playerIndex, cell) {
  var extra = state.extra;
  if (!extra || extra.stage !== 'battle') return { ok: false, error: '当前不在战斗阶段' };
  if (playerIndex !== state.currentTurn) return { ok: false, error: '未轮到你' };
  var board = boardOf(state, playerIndex);
  if (!board) return { ok: false, error: '棋盘未初始化' };
  if (!parseCell(cell)) return { ok: false, error: '非法坐标' };
  if (board.shots[cell]) return { ok: false, error: '该格已开火' };
  return { ok: true };
}

// ---------- 引擎自动调用的动作校验 ----------

function validateAction(oldState, _newState, action) {
  if (!action || typeof action !== 'object') return false;
  switch (action.type) {
    case 'start_game':
      return oldState.phase === 'idle';
    case 'battleship_place': {
      var p = action.payload || {};
      return placeShip(oldState, action.playerIndex, p.shipId, p.cells).ok;
    }
    case 'battleship_random':
      return randomPlace(oldState, action.playerIndex).ok;
    case 'battleship_remove': {
      var p = action.payload || {};
      return removeShip(oldState, action.playerIndex, p.shipId).ok;
    }
    case 'battleship_confirm':
      return confirmBoard(oldState, action.playerIndex).ok;
    case 'battleship_fire': {
      var p = action.payload || {};
      return fire(oldState, action.playerIndex, p.cell).ok;
    }
    default:
      return true;
  }
}

// ---------- 钩子 ----------

game.on('before_action', function (state, action) {
  console.log('[L3] before_action: ' + action.type + ' by ' + action.playerIndex);
});

game.on('after_state_update', function (state) {
  var stage = state.extra ? state.extra.stage : '?';
  console.log('[L3] after_state_update: phase=' + state.phase + ' turn=' + state.currentTurn + ' stage=' + stage);
});

// ---------- 注册 ----------

registerFunction('validate_action', validateAction);
registerFunction('place_ship', placeShip);
registerFunction('random_place', randomPlace);
registerFunction('remove_ship', removeShip);
registerFunction('confirm_board', confirmBoard);
registerFunction('fire', fire);
`;
