// ============================================================
// BoardGameSimulator — 游戏测试模块注册表（抽象层，无 UI）
// 每个游戏一个 test.ts 模块，在此登记；测试入口用 ?test=<id> 直达
// ============================================================

import type { GameConfig } from '../core/types';
import { battleshipTest } from '../games/battleship/test';

export interface GameTestModule {
  id: string;
  name: string;
  config: GameConfig;
}

export const testModules: GameTestModule[] = [battleshipTest];

export function findTestModule(id: string): GameTestModule | undefined {
  return testModules.find(m => m.id === id);
}
