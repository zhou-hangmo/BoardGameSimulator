// ============================================================
// BoardGameSimulator — 海战棋测试模块
// 与发布版本使用同一份 config / L3 / 规则
// ============================================================

import type { GameConfig } from '../../core/types';
import battleshipConfig from './config.json';
import { l3Script } from './l3';

export interface GameTestModule {
  id: string;
  name: string;
  description: string;
  playerCount: string;
  tags?: string[];
  ready: boolean;
  config: GameConfig;
}

export const battleshipTest: GameTestModule = {
  id: 'battleship',
  name: '海战棋',
  description: '双人策略海战',
  playerCount: '2',
  ready: true,
  config: { ...battleshipConfig, l3: l3Script } as GameConfig,
};
