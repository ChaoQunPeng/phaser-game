import type { BattleConfig, GameEvent, GameState } from '../core/types.js';
import { MapSystem } from './MapSystem.js';
import { heroBalance } from '../data/heroes.js';

/** P1 伤害纯函数；当前只有基础攻击，后续可在此传入已确定的属性修正。 */
export function calculateDamage(attack: number): number { return attack; }

/** 负责索敌、冷却、单体/范围伤害；所有未定规则来自可替换配置。 */
export class CombatSystem {
  constructor(private readonly config: BattleConfig, private readonly map: MapSystem) {}

  /** 每次攻击立即移除死亡目标，后续单位不会重复击杀同一个怪物。 */
  update(state: GameState, deltaMs: number, events: GameEvent[]): void {
    const policy = this.config.combat;
    for (const unit of state.defenders) {
      const definition = this.config.units[unit.definitionId];
      // 单字及三字名字的中间材料都不生效，只有完整英雄才能攻击和获得击杀。
      if (definition.category === 'fragment') continue;
      unit.attackCooldownMs = Math.max(0, unit.attackCooldownMs - deltaMs);
      if (unit.attackCooldownMs > 0) continue;
      const candidates = state.monsters.filter(monster => policy.distance(unit.cell, this.map.position(monster)) <= definition.range);
      candidates.sort((a, b) => policy.priority(b) - policy.priority(a));
      const target = candidates[0];
      // 没有目标是正常战斗状态，保留就绪攻击直到敌人进入范围。
      if (!target) continue;
      const center = this.map.position(target);
      const targets = definition.attackMode === 'single' ? [target]
        : state.monsters.filter(monster => policy.inArea(center, this.map.position(monster)));
      unit.attackCooldownMs = definition.attackIntervalMs;
      events.push({ type: 'attack', unitId: unit.id, targets: targets.map(monster => this.map.position(monster)) });
      // 英雄伤害随等级成长，当前成长系数为集中配置的临时测试值。
      const attack = definition.attack * (definition.category === 'hero' ? 1 + (unit.level - 1) * heroBalance.attackGrowth : 1);
      for (const monster of targets) {
        monster.hp = Math.max(0, monster.hp - calculateDamage(attack));
        if (monster.hp === 0) {
          unit.killCount++;
          if (definition.category === 'hero') {
            unit.level = 1 + heroBalance.killThresholds.filter(threshold => unit.killCount >= threshold).length;
          }
          // 死亡目标立即移除，击杀金币只结算一次；漏怪不产生奖励。
          state.gold += this.config.monsters[monster.definitionId].goldReward;
          events.push({ type: 'monsterKilled', monsterId: monster.id, unitId: unit.id });
        }
      }
      state.monsters = state.monsters.filter(monster => monster.hp > 0);
    }
  }
}
