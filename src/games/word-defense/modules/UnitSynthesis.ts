import type { BattleConfig, UnitKind } from '../core/types.js';
import { heroNames } from '../data/heroes.js';

/** 核心与悬停高亮共用配方，避免界面提示和实际合成规则不一致。 */
export function resolveUnitSynthesis(config: BattleConfig, sourceId: UnitKind, sourceLevel: number,
  targetId: UnitKind, targetLevel: number): { definitionId: UnitKind; level: number } | undefined {
  const source = config.units[sourceId];
  const target = config.units[targetId];
  if (source.category === 'fragment' && target.category === 'fragment') {
    const letters = [...source.label, ...target.label];
    // 重复字和跨英雄的字不组成配方，也不会被当作基础单位升级。
    if (new Set(letters).size !== letters.length) return undefined;
    const name = heroNames.find(candidate => letters.every(letter => candidate.includes(letter)));
    if (!name) return undefined;
    const label = [...name].filter(letter => letters.includes(letter)).join('');
    const result = Object.values(config.units).find(definition => definition.label === label && definition.category);
    return result ? { definitionId: result.id, level: 1 } : undefined;
  }
  // 完整英雄不能通过重复制备升级，只允许基础单位同名同级二合一。
  if (source.category || target.category || sourceId !== targetId || sourceLevel !== targetLevel || targetLevel >= 5) return undefined;
  return { definitionId: targetId, level: targetLevel + 1 };
}
