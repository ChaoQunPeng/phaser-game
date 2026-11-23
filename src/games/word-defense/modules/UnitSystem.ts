import type { BattleConfig, Cell, CommandResult, GameEvent, GameState, UnitLocation } from '../core/types.js';
import { MapSystem } from './MapSystem.js';
import { resolveUnitSynthesis } from './UnitSynthesis.js';

/** 负责部署、基础升级、英雄拼名及互换，所有合成校验通过后才消耗材料。 */
export class UnitSystem {
  private nextId = 1;
  constructor(private readonly map: MapSystem, private readonly config: BattleConfig) {}

  /** 拖到已有单位时优先合并；不能合并则交换，点击操作仍沿用原有合并契约。 */
  dropOnUnit(state: GameState, source: UnitLocation, target: UnitLocation, events: GameEvent[]): CommandResult {
    let result: CommandResult;
    if ('slotIndex' in target) result = this.mergeIntoPool(state, source, target.slotIndex, events);
    else if ('unitId' in source) result = this.merge(state, source.unitId, target.unitId, events);
    else {
      const targetUnit = state.defenders.find(unit => unit.id === target.unitId);
      if (!targetUnit) return { ok: false, reason: '单位已不存在' };
      result = this.deploy(state, source.slotIndex, targetUnit.cell, events);
    }
    return result.ok ? result : this.swap(state, source, target, events);
  }

  /** 互换保留单位身份、等级、冷却和击杀记录；跨区交换不额外消耗召唤物。 */
  private swap(state: GameState, source: UnitLocation, target: UnitLocation, events: GameEvent[]): CommandResult {
    if ('slotIndex' in source && 'slotIndex' in target) {
      [state.summonPool[source.slotIndex], state.summonPool[target.slotIndex]]
        = [state.summonPool[target.slotIndex], state.summonPool[source.slotIndex]];
      return { ok: true };
    }
    if ('unitId' in source && 'unitId' in target) {
      const first = state.defenders.find(unit => unit.id === source.unitId);
      const second = state.defenders.find(unit => unit.id === target.unitId);
      if (!first || !second) return { ok: false, reason: '单位已不存在' };
      [first.cell, second.cell] = [second.cell, first.cell];
      return { ok: true };
    }
    if ('unitId' in source && 'slotIndex' in target) return this.swapWithPool(state, source.unitId, target.slotIndex, events);
    if ('slotIndex' in source && 'unitId' in target) return this.swapWithPool(state, target.unitId, source.slotIndex, events);
    return { ok: false, reason: '请选择单位互换' };
  }

  /** 基础单位、名字材料和完整英雄都可跨区互换；锄头不能占用单位位置。 */
  private swapWithPool(state: GameState, unitId: string, slotIndex: number, events: GameEvent[]): CommandResult {
    const boardUnit = state.defenders.find(unit => unit.id === unitId);
    const entry = state.summonPool[slotIndex];
    if (!boardUnit || !entry || entry === 'hoe') return { ok: false, reason: '请选择单位互换' };
    const storedUnit = typeof entry === 'string'
      ? { id: `unit-${this.nextId++}`, definitionId: entry, level: 1, attackCooldownMs: 0, killCount: 0 } : entry;
    state.summonPool[slotIndex] = { id: boardUnit.id, definitionId: boardUnit.definitionId,
      level: boardUnit.level, attackCooldownMs: boardUnit.attackCooldownMs, killCount: boardUnit.killCount };
    state.defenders = state.defenders.filter(unit => unit.id !== boardUnit.id);
    state.defenders.push({ ...storedUnit, cell: { ...boardUnit.cell } });
    events.push({ type: 'unitRemoved', unitId: boardUnit.id });
    events.push({ type: 'unitDeployed', unitId: storedUnit.id });
    return { ok: true };
  }

  /** 新召唤物以一级部署，回池单位保留原有等级和战斗记录，成功后才消耗槽位。 */
  deploy(state: GameState, slotIndex: number, cell: Cell, events: GameEvent[]): CommandResult {
    const entry = state.summonPool[slotIndex];
    // 空槽表示已消耗，非法槽位也不允许创建棋子。
    if (!entry) return { ok: false, reason: '该召唤单位已消耗' };
    const storedUnit = typeof entry === 'object' ? entry : undefined;
    const definitionId = typeof entry === 'object' ? entry.definitionId : entry;
    const level = storedUnit?.level ?? 1;
    const target = state.defenders.find(unit => unit.cell.x === cell.x && unit.cell.y === cell.y);
    // 池到棋盘同时支持基础升级和英雄名字拼合，成功后才消耗材料。
    if (target && definitionId !== 'hoe') {
      const result = resolveUnitSynthesis(this.config, definitionId, level, target.definitionId, target.level);
      if (!result) return { ok: false, reason: '这两个单位无法合成' };
      state.summonPool[slotIndex] = null;
      Object.assign(target, result);
      return { ok: true };
    }
    const reason = this.map.placementError(cell, state.defenders, state.openCells, definitionId === 'hoe');
    if (reason) return { ok: false, reason };
    // 只有合法落子才消耗召唤池；移除棋子不会重新获得召唤次数。
    state.summonPool[slotIndex] = null;
    // 锄头只解锁土地，不创建防守单位；合法开垦才消耗道具。
    if (definitionId === 'hoe') {
      state.openCells.push({ ...cell });
      return { ok: true };
    }
    const id = storedUnit?.id ?? `unit-${this.nextId++}`;
    state.defenders.push({ id, definitionId, level, cell: { ...cell },
      attackCooldownMs: storedUnit?.attackCooldownMs ?? 0, killCount: storedUnit?.killCount ?? 0 });
    events.push({ type: 'unitDeployed', unitId: id });
    return { ok: true };
  }

  /** 指定空槽才能放回，不覆盖召唤物；保留冷却以免反复收放重置攻击。 */
  returnToPool(state: GameState, unitId: string, slotIndex: number, events: GameEvent[]): CommandResult {
    if (state.summonPool[slotIndex] !== null) return { ok: false, reason: '请选择召唤池空位' };
    const unit = state.defenders.find(candidate => candidate.id === unitId);
    if (!unit) return { ok: false, reason: '单位已不存在' };
    state.summonPool[slotIndex] = { id: unit.id, definitionId: unit.definitionId, level: unit.level,
      attackCooldownMs: unit.attackCooldownMs, killCount: unit.killCount };
    state.defenders = state.defenders.filter(candidate => candidate.id !== unitId);
    events.push({ type: 'unitRemoved', unitId });
    return { ok: true };
  }

  /** 池内目标可以基础升级或拼合名字；合成后继续占据目标槽位。 */
  mergeIntoPool(state: GameState, source: { unitId: string } | { slotIndex: number }, targetSlot: number, events: GameEvent[]): CommandResult {
    if ('slotIndex' in source && source.slotIndex === targetSlot) return { ok: false, reason: '请选择另一个单位合并' };
    const material = 'unitId' in source
      ? state.defenders.find(unit => unit.id === source.unitId) : state.summonPool[source.slotIndex];
    const target = state.summonPool[targetSlot];
    // 空槽及锄头都不是合并材料；校验失败不修改棋盘和召唤池。
    if (!material || material === 'hoe' || !target || target === 'hoe') return { ok: false, reason: '请选择单位合成' };
    const definitionId = typeof material === 'string' ? material : material.definitionId;
    const level = typeof material === 'string' ? 1 : material.level;
    const targetDefinition = typeof target === 'string' ? { definitionId: target, level: 1 } : target;
    const result = resolveUnitSynthesis(this.config, definitionId, level, targetDefinition.definitionId, targetDefinition.level);
    if (!result) return { ok: false, reason: '这两个单位无法合成' };
    // 名字拼合沿用目标身份，形成英雄时仍为一级，后续只按击杀成长。
    state.summonPool[targetSlot] = typeof target === 'string'
      ? { id: `unit-${this.nextId++}`, ...result, attackCooldownMs: 0, killCount: 0 }
      : { ...target, ...result };
    if ('unitId' in source) {
      state.defenders = state.defenders.filter(unit => unit.id !== source.unitId);
      events.push({ type: 'unitRemoved', unitId: source.unitId });
    } else state.summonPool[source.slotIndex] = null;
    return { ok: true };
  }

  /** 源单位作为材料消耗，目标单位原地升级并保留攻击冷却与击杀记录。 */
  merge(state: GameState, sourceId: string, targetId: string, events: GameEvent[]): CommandResult {
    if (sourceId === targetId) return { ok: false, reason: '请选择另一个单位合并' };
    const source = state.defenders.find(unit => unit.id === sourceId);
    const target = state.defenders.find(unit => unit.id === targetId);
    if (!source || !target) return { ok: false, reason: '单位已不存在' };
    const result = resolveUnitSynthesis(this.config, source.definitionId, source.level, target.definitionId, target.level);
    if (!result) return { ok: false, reason: '这两个单位无法合成' };
    Object.assign(target, result);
    state.defenders = state.defenders.filter(unit => unit.id !== sourceId);
    events.push({ type: 'unitRemoved', unitId: sourceId });
    return { ok: true };
  }

  /** 移除释放格子；无经济系统，因此不产生出售收入。 */
  remove(state: GameState, unitId: string, events: GameEvent[]): CommandResult {
    const index = state.defenders.findIndex(unit => unit.id === unitId);
    if (index < 0) return { ok: false, reason: '单位已不存在' };
    state.defenders.splice(index, 1);
    events.push({ type: 'unitRemoved', unitId });
    return { ok: true };
  }
}
