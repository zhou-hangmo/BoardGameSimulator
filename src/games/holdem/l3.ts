export const l3Script = `
// ---------- 前置校验 ----------

function validateAction(oldState, _newState, action) {
  if (!action || typeof action !== 'object') return false;
  var extra = oldState && oldState.extra;

  switch (action.type) {
    case 'holdem_init':
      return oldState.phase === 'idle' && (!extra || !extra.started);

    case 'holdem_bet': {
      if (!extra || !extra.started) return false;
      if (extra.currentActor !== action.playerIndex) return false;
      var amount = (action.payload && action.payload.amount) || 0;
      if (amount <= 0) return false;
      if (extra.currentBet !== 0) return false;
      if (extra.players[action.playerIndex].chips < amount) return false;
      return true;
    }

    case 'holdem_call': {
      if (!extra || !extra.started) return false;
      if (extra.currentActor !== action.playerIndex) return false;
      return true;
    }

    case 'holdem_raise': {
      if (!extra || !extra.started) return false;
      if (extra.currentActor !== action.playerIndex) return false;
      var amount = (action.payload && action.payload.amount) || 0;
      var player = extra.players[action.playerIndex];
      if (amount <= player.roundBet) return false;
      if (extra.currentBet === 0) return false;
      if (amount <= extra.currentBet) return false;
      if (amount - player.roundBet > player.chips) return false;
      return true;
    }

    case 'holdem_check': {
      if (!extra || !extra.started) return false;
      if (extra.currentActor !== action.playerIndex) return false;
      var player = extra.players[action.playerIndex];
      if (player.roundBet < extra.currentBet) return false;
      return true;
    }

    case 'holdem_fold': {
      if (!extra || !extra.started) return false;
      if (extra.currentActor !== action.playerIndex) return false;
      return true;
    }

    case 'holdem_all_in': {
      if (!extra || !extra.started) return false;
      if (extra.currentActor !== action.playerIndex) return false;
      if (extra.players[action.playerIndex].chips <= 0) return false;
      return true;
    }

    case 'holdem_take_money': {
      if (!extra || extra.phase !== 'showdown') return false;
      var amount = (action.payload && action.payload.amount) || 0;
      if (amount <= 0 || amount > extra.pot) return false;
      return true;
    }

    case 'holdem_borrow': {
      if (!extra || !extra.borrowEnabled) return false;
      return true;
    }

    case 'holdem_repay': {
      if (!extra) return false;
      var amount = (action.payload && action.payload.amount) || 0;
      if (amount <= 0) return false;
      if (amount > extra.players[action.playerIndex].borrowUsed) return false;
      if (amount > extra.players[action.playerIndex].chips) return false;
      return true;
    }

    case 'holdem_give_money': {
      var amount = (action.payload && action.payload.amount) || 0;
      var toIndex = (action.payload && action.payload.toIndex);
      if (amount <= 0) return false;
      if (toIndex === undefined || toIndex === action.playerIndex) return false;
      if (!extra || !extra.players[action.playerIndex]) return false;
      if (extra.players[action.playerIndex].chips < amount) return false;
      return true;
    }

    case 'holdem_request_undo': {
      if (!extra || !extra.started) return false;
      if (extra.roundUndoUsed) return false;
      if (extra.undoRequest) return false;
      if (!extra.players[action.playerIndex].acted) return false;
      return true;
    }

    case 'holdem_approve_undo':
    case 'holdem_reject_undo':
      return true;

    case 'holdem_new_hand': {
      if (extra && extra.pot > 0) return false;
      return true;
    }
    case 'holdem_end_game':
      return true;

    default:
      return true;
  }
}

// ---------- 钩子 ----------

game.on('before_action', function (state, action) {
  console.log('[Holdem L3] before_action: ' + action.type + ' by ' + action.playerIndex);
});

game.on('after_state_update', function (state) {
  var extra = state.extra;
  var phase = extra ? extra.phase : '?';
  var actor = extra ? extra.currentActor : -1;
  console.log('[Holdem L3] after_state_update: phase=' + phase + ' actor=' + actor);
});

// ---------- 注册 ----------

registerFunction('validate_action', validateAction);
`;
