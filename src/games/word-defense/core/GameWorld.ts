import type { BattleConfig, CommandResult, GameCommand, GameEvent, GameSnapshot, GameState } from './types.js';
import { GameClock } from './GameClock.js';
import { MapSystem } from '../modules/MapSystem.js';
import { UnitSystem } from '../modules/UnitSystem.js';
import { MonsterSystem } from '../modules/MonsterSystem.js';
import { CombatSystem } from '../modules/CombatSystem.js';
import { WaveSystem } from '../modules/WaveSystem.js';
import { heroBalance } from '../data/heroes.js';

/** 世界编排系统和胜负；外部只能通过命令或生命周期方法更改状态。 */
export class GameWorld {
  private state: GameState;
  private events: GameEvent[] = [];
  private readonly clock: GameClock;
  private readonly map: MapSystem;
  private units: UnitSystem;
  private readonly monsters: MonsterSystem;
  private readonly combat: CombatSystem;
  private waves: WaveSystem;
  /** 视图延后至上一逻辑步与当前步之间；暂停时保留，避免棋子跳动。 */
  private monsterRenderDelayMs = 0;

  constructor(private readonly config: BattleConfig) {
    this.state = this.initialState();
    this.clock = new GameClock(config.fixedStepMs, config.maxCatchUpSteps);
    this.map = new MapSystem(config.map);
    this.units = new UnitSystem(this.map, config);
    this.monsters = new MonsterSystem(config);
    this.combat = new CombatSystem(config, this.map);
    this.waves = new WaveSystem(config);
  }

  /** 每次重开都创建独立状态，测试关卡从准备阶段开始。 */
  private initialState(): GameState {
    return { status: 'ready', hp: this.config.initialHp, gold: this.config.initialGold,
      refreshCost: this.config.refreshCost, wave: 1, elapsedMs: 0, waveElapsedMs: 0,
      nextSpawnIndex: 0, preparationRemainingMs: this.config.preparationMs,
      summonPool: this.createSummonPool(), openCells: this.config.initialOpenCells.map(cell => ({ ...cell })), defenders: [], monsters: [] };
  }

  /** 每槽独立抽取锄头、单字英雄材料或基础兵种；完整英雄必须集齐名字后形成。 */
  private createSummonPool(): GameState['summonPool'] {
    const definitions = Object.values(this.config.units);
    const basics = definitions.filter(unit => !unit.category).map(unit => unit.id);
    const fragments = definitions.filter(unit => unit.category === 'fragment' && unit.label.length === 1).map(unit => unit.id);
    return Array.from({ length: this.config.summonPoolSize }, () => {
      const roll = Math.random();
      if (roll < this.config.hoeChance) return 'hoe';
      // 英雄材料概率集中在 heroBalance，基础兵种使用剩余概率。
      const candidates = roll < this.config.hoeChance + heroBalance.fragmentChance ? fragments : basics;
      return candidates[Math.floor(Math.random() * candidates.length)];
    });
  }

  /** 就绪阶段可先部署，玩家主动开始后才刷怪。 */
  start(): void { if (this.state.status === 'ready') this.state.status = 'playing'; }
  /** 暂停后命令和模拟都冻结，保留步内余量以便恢复时平滑续接。 */
  pause(): void { if (this.state.status === 'playing') this.state.status = 'paused'; }
  /** 暂停期间 update 不推进时钟，恢复只接续暂停前的余量。 */
  resume(): void { if (this.state.status === 'paused') this.state.status = 'playing'; }
  /** 重开清除实体、待消费事件、序号和时钟，不保留上一局结果。 */
  restart(): void {
    this.state = this.initialState(); this.events = []; this.clock.reset();
    this.monsterRenderDelayMs = 0;
    this.units = new UnitSystem(this.map, this.config); this.waves = new WaveSystem(this.config);
  }

  /** 渲染帧只驱动固定步长；终局与暂停不会推进时间。 */
  update(deltaMs: number): void {
    if (this.state.status !== 'playing') return;
    this.clock.advance(deltaMs, stepMs => {
      this.state.elapsedMs += stepMs;
      this.waves.spawn(this.state, stepMs, this.events);
      this.monsters.update(this.state, stepMs, this.events);
      // 失败优先于最后一波清场，避免最后一只漏怪同时触发胜败。
      if (this.state.hp === 0) this.end('defeat');
      else {
        this.combat.update(this.state, stepMs, this.events);
        if (this.waves.complete(this.state, this.events)) this.end('victory');
      }
      return this.state.status === 'playing';
    });
    this.monsterRenderDelayMs = this.state.status === 'playing'
      ? this.config.fixedStepMs - this.clock.getRemainderMs() : 0;
  }

  /** 仅供位置插值使用，不改变攻击、漏怪等战斗规则的时间。 */
  getMonsterRenderDelayMs(): number { return this.monsterRenderDelayMs; }

  /** 游戏结束事件只有世界产生一次，系统只报告事实。 */
  private end(result: 'victory' | 'defeat'): void {
    this.state.status = result;
    this.events.push({ type: 'gameEnded', result });
  }

  /** 所有部署与移除都通过命令，禁止暂停和结算期间修改战场。 */
  dispatch(command: GameCommand): CommandResult {
    if (this.state.status !== 'ready' && this.state.status !== 'playing') return { ok: false, reason: '请先继续游戏或重新开始' };
    switch (command.type) {
      case 'DROP_ON_UNIT': return this.units.dropOnUnit(this.state, command.source, command.target, this.events);
      case 'DEPLOY_UNIT': return this.units.deploy(this.state, command.slotIndex, command.cell, this.events);
      case 'MERGE_UNITS': return this.units.merge(this.state, command.sourceId, command.targetId, this.events);
      case 'MERGE_INTO_POOL': return this.units.mergeIntoPool(this.state, command.source, command.targetSlot, this.events);
      case 'RETURN_UNIT': return this.units.returnToPool(this.state, command.unitId, command.slotIndex, this.events);
      case 'REFRESH_POOL': {
        if (this.state.gold < this.state.refreshCost) return { ok: false, reason: '金币不足' };
        // 刷新替换整池，未使用的旧单位一并替换，不影响已部署棋子。
        // 调试配置为免费时始终保持零费用；付费配置仍在成功刷新后递增。
        this.state.gold -= this.state.refreshCost;
        if (this.config.refreshCost > 0) this.state.refreshCost++;
        this.state.summonPool = this.createSummonPool();
        return { ok: true };
      }
      case 'REMOVE_UNIT': return this.units.remove(this.state, command.unitId, this.events);
    }
  }

  /** 复制可变实体与坐标，视图即使持有旧快照也不会影响世界。 */
  getSnapshot(): GameSnapshot {
    return { ...this.state, summonPool: this.state.summonPool.map(entry => entry && typeof entry === 'object' ? { ...entry } : entry), openCells: this.state.openCells.map(cell => ({ ...cell })), defenders: this.state.defenders.map(unit => ({ ...unit, cell: { ...unit.cell } })),
      monsters: this.state.monsters.map(monster => ({ ...monster })) };
  }

  /** 一次性消费事件，用于渲染反馈；不参与核心计算。 */
  drainEvents(): GameEvent[] { const events = this.events; this.events = []; return events; }
}
