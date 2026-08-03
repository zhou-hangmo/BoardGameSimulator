// ============================================================
// BoardGameSimulator — 海战棋测试模块
// 与发布版本使用同一份 config / L3 / 规则
// ============================================================

import type { GameConfig } from '../../core/types';
import type { GameTestModule } from '../../test/registry';
import battleshipConfig from './config.json';
import { l3Script } from './l3';

export const battleshipTest: GameTestModule = {
  id: 'battleship',
  name: '海战棋',
  config: { ...battleshipConfig, l3: l3Script } as GameConfig,
};
