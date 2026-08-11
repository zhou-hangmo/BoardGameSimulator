import type { HoldemExtra } from './rules';

/** 按玩家视角过滤：所有筹码信息公开可见，无需裁剪 */
export function filterExtra(extra: HoldemExtra, _viewerIndex: number): HoldemExtra {
  return extra;
}
