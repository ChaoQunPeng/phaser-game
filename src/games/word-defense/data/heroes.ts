import type { HeroFragmentKind, HeroKind, UnitDefinition } from '../core/types.js';

/** 英雄原型平衡参数，均为临时测试值，后续按实玩反馈调整。 */
export const heroBalance = {
  fragmentChance: 0.3,
  // 最后一次伤害击杀者独享成长，按累计击杀升至 2、3、4、5 级。
  killThresholds: [3, 8, 15, 25],
  attackGrowth: 0.25,
};

/** 名字即配方，形成英雄后不再参与二合一升级。 */
export const heroNames: HeroKind[] = ['赵云', '张飞', '关羽', '马超', '黄忠', '孙悟空', '二郎神'];

/** 名字材料没有攻击能力；中间组合沿原名顺序显示，拖动时不限制收集顺序。 */
function fragment(id: HeroFragmentKind): UnitDefinition {
  return { id, label: id, category: 'fragment', range: 0, attack: 0, attackMode: 'single', attackIntervalMs: 0 };
}

/** 集中配置七位英雄和所有合法碎字，战斗属性为临时测试值。 */
export const heroDefinitions: Record<HeroKind | HeroFragmentKind, UnitDefinition> = {
  赵: fragment('赵'), 云: fragment('云'), 张: fragment('张'), 飞: fragment('飞'),
  关: fragment('关'), 羽: fragment('羽'), 马: fragment('马'), 超: fragment('超'),
  黄: fragment('黄'), 忠: fragment('忠'), 孙: fragment('孙'), 悟: fragment('悟'),
  空: fragment('空'), 二: fragment('二'), 郎: fragment('郎'), 神: fragment('神'),
  孙悟: fragment('孙悟'), 孙空: fragment('孙空'), 悟空: fragment('悟空'),
  二郎: fragment('二郎'), 二神: fragment('二神'), 郎神: fragment('郎神'),
  赵云: { id: '赵云', label: '赵云', category: 'hero', heroClass: 'legend', range: 3, attackMode: 'single', attack: 28, attackIntervalMs: 600 },
  张飞: { id: '张飞', label: '张飞', category: 'hero', heroClass: 'legend', range: 2, attackMode: 'area', attack: 24, attackIntervalMs: 1000 },
  关羽: { id: '关羽', label: '关羽', category: 'hero', heroClass: 'legend', range: 2, attackMode: 'area', attack: 30, attackIntervalMs: 1100 },
  马超: { id: '马超', label: '马超', category: 'hero', heroClass: 'legend', range: 3, attackMode: 'single', attack: 24, attackIntervalMs: 500 },
  黄忠: { id: '黄忠', label: '黄忠', category: 'hero', heroClass: 'legend', range: 5, attackMode: 'single', attack: 32, attackIntervalMs: 850 },
  孙悟空: { id: '孙悟空', label: '孙悟空', category: 'hero', heroClass: 'myth', range: 3, attackMode: 'area', attack: 34, attackIntervalMs: 800 },
  二郎神: { id: '二郎神', label: '二郎神', category: 'hero', heroClass: 'myth', range: 4, attackMode: 'single', attack: 42, attackIntervalMs: 750 },
};
