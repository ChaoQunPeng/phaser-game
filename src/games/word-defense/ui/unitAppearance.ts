import type { UnitDefinition } from '../core/types.js';
import { battleTheme as theme } from './theme.js';

/** 多字英雄缩小字号，保持完整名字落在单个格子或召唤卡片内。 */
export function unitGlyphSize(definition: UnitDefinition, singleSize: number): number {
  return definition.label.length === 1 ? singleSize : definition.label.length === 2 ? 21 : 14;
}

/** 材料用淡墨，英杰用赭金、神话用朱色，基础兵种沿用青色。 */
export function unitGlyphColor(definition: UnitDefinition): number {
  if (definition.category === 'fragment') return theme.colors.muted;
  if (definition.category === 'hero') return definition.heroClass === 'myth' ? theme.colors.enemy : theme.colors.gold;
  return theme.colors.ally;
}

/** 名字未集齐时明确提示待合成；完整英雄展示类别和击杀成长等级。 */
export function unitCaption(definition: UnitDefinition, level: number): string {
  if (definition.category === 'fragment') return '待合成';
  if (definition.category === 'hero') return `${definition.heroClass === 'myth' ? '神话' : '英杰'}·${level}`;
  return `${level}级`;
}
