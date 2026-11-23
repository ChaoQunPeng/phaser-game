import type { BattleConfig, GameEvent, GameState } from '../core/types.js';

/** 由配置序列生成怪物；只在全部生成并清场后完成本波。 */
export class WaveSystem {
  private nextMonsterId = 1;
  constructor(private readonly config: BattleConfig) {}

  /** 准备倒计时和刷怪都只使用模拟时钟；首波和后续波使用相同流程。 */
  spawn(state: GameState, deltaMs: number, events: GameEvent[]): void {
    if (state.preparationRemainingMs > 0) {
      state.preparationRemainingMs = Math.max(0, state.preparationRemainingMs - deltaMs);
      return;
    }
    state.waveElapsedMs += deltaMs;
    const wave = this.config.waves[state.wave - 1];
    while (state.nextSpawnIndex < wave.spawns.length && wave.spawns[state.nextSpawnIndex].atMs <= state.waveElapsedMs) {
      const spawn = wave.spawns[state.nextSpawnIndex++];
      const id = `monster-${this.nextMonsterId++}`;
      state.monsters.push({ id, definitionId: spawn.definitionId, hp: this.config.monsters[spawn.definitionId].hp,
        pathId: spawn.pathId, segmentIndex: 0, segmentProgress: 0 });
      events.push({ type: 'monsterSpawned', monsterId: id });
    }
  }

  /** 返回是否已完成所有测试波次；不在系统内结算胜负。 */
  complete(state: GameState, events: GameEvent[]): boolean {
    const wave = this.config.waves[state.wave - 1];
    if (state.preparationRemainingMs > 0 || state.nextSpawnIndex < wave.spawns.length || state.monsters.length > 0) return false;
    events.push({ type: 'waveCompleted', wave: state.wave });
    if (state.wave === this.config.waves.length) return true;
    state.wave++;
    state.waveElapsedMs = 0;
    state.nextSpawnIndex = 0;
    state.preparationRemainingMs = this.config.preparationMs;
    return false;
  }
}
