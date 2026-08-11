import type { GameConfig } from '../../core/types';
import holdemConfig from './config.json';
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

export const holdemTest: GameTestModule = {
  id: 'holdem',
  name: '德州扑克',
  description: '实体牌筹码管理 · 朋友局',
  playerCount: '2~99',
  ready: true,
  config: { ...holdemConfig, l3: l3Script } as GameConfig,
};
