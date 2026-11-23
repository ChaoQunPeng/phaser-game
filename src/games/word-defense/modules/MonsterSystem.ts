import type { BattleConfig, GameEvent, GameState } from '../core/types.js';

/** 怪物按格/秒推进路径，抵达后从存活列表移除，保证只漏怪一次。 */
export class MonsterSystem {
  constructor(private readonly config: BattleConfig) {}

  /** 先统一移动并结算漏怪；本步抵达终点的怪物不再参与攻击。 */
  update(state: GameState, deltaMs: number, events: GameEvent[]): void {
    state.monsters = state.monsters.filter(monster => {
      const definition = this.config.monsters[monster.definitionId];
      const progress = monster.segmentProgress + definition.speed * deltaMs / 1000;
      monster.segmentIndex += Math.floor(progress);
      monster.segmentProgress = progress % 1;
      if (monster.segmentIndex < this.config.map.paths[monster.pathId].length - 1) return true;
      state.hp = Math.max(0, state.hp - definition.leakDamage);
      events.push({ type: 'monsterEscaped', monsterId: monster.id, damage: definition.leakDamage });
      return false;
    });
  }
}
