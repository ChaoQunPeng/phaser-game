import type { BattleConfig, Cell } from '../core/types.js';

/** 群攻溅射按目标周围的直线距离计算。 */
const distance = (a: Cell, b: Cell): number => Math.hypot(a.x - b.x, a.y - b.y);

/** 索敌按方形格圈计算：横纵偏移的最大值不超过射程，1 格包含四个斜角。 */
const attackDistance = (a: Cell, b: Cell): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** P1 集中测试配置；除地图尺寸、四兵种范围/攻击类型外，数值和策略均为 placeholder。 */
export const battleConfig: BattleConfig = {
  map: {
    width: 8, height: 8,
    // placeholder：单路蛇形路线；路径格暂不允许部署。
    paths: { main: [
      { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 },
      { x: 4, y: 1 }, { x: 5, y: 1 }, { x: 6, y: 1 }, { x: 6, y: 2 },
      { x: 6, y: 3 }, { x: 5, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 3 },
      { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 1, y: 4 }, { x: 1, y: 5 },
      { x: 2, y: 5 }, { x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 },
      { x: 6, y: 5 }, { x: 7, y: 5 }, { x: 7, y: 6 }, { x: 7, y: 7 },
    ] },
  },
  initialHp: 10,
  // 每局启动资金与手动刷新价格，金币不足时不允许刷新。
  initialGold: 5, refreshCost: 5,
  // 初始开放第六行的四个指定格子；其余非路径格需消耗锄头开垦。
  initialOpenCells: [{ x: 3, y: 6 }, { x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 }],
  // 每槽 20% 概率抽到锄头，五槽平均约一把，缓解开垦道具不足。
  hoeChance: 0.2,
  fixedStepMs: 50, maxCatchUpSteps: 8, preparationMs: 3000,
  units: {
    bow: { id: 'bow', label: '弓', range: 5, attackMode: 'single', attack: 9, attackIntervalMs: 700 },
    spear: { id: 'spear', label: '枪', range: 4, attackMode: 'area', attack: 7, attackIntervalMs: 1000 },
    sword: { id: 'sword', label: '刀', range: 1, attackMode: 'single', attack: 17, attackIntervalMs: 550 },
    cavalry: { id: 'cavalry', label: '骑', range: 3, attackMode: 'area', attack: 11, attackIntervalMs: 1200 },
  },
  monsters: {
    // 基础移速统一降低 25%（单位：格/秒），留出部署时间并保留各波次速度递进。
    scout: { id: 'scout', label: '卒', hp: 26, speed: 1.35, leakDamage: 1, goldReward: 1 },
    soldier: { id: 'soldier', label: '兵', hp: 46, speed: 1.5, leakDamage: 1, goldReward: 1 },
    elite: { id: 'elite', label: '将', hp: 80, speed: 1.65, leakDamage: 2, goldReward: 3 },
  },
  // placeholder：三个测试波次自动推进；正式 20 波及奖励留到 P4。
  waves: [
    { spawns: Array.from({ length: 5 }, (_, i) => ({ atMs: i * 1000, definitionId: 'scout', pathId: 'main' })) },
    { spawns: Array.from({ length: 8 }, (_, i) => ({ atMs: i * 800, definitionId: 'soldier', pathId: 'main' })) },
    { spawns: Array.from({ length: 10 }, (_, i) => ({ atMs: i * 650, definitionId: 'elite', pathId: 'main' })) },
  ],
  combat: {
    distance: attackDistance,
    // placeholder：优先攻击沿当前路径走得最远的怪物。
    priority: monster => monster.segmentIndex + monster.segmentProgress,
    // placeholder：枪与骑暂用主目标周围一格圆形溅射，无目标上限。
    inArea: (center, candidate) => distance(center, candidate) <= 1,
  },
};
