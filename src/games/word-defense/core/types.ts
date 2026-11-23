/** P1 的逻辑坐标与规则契约；不依赖渲染或浏览器。 */
export interface Cell { x: number; y: number }
export type BasicUnitKind = 'bow' | 'spear' | 'sword' | 'cavalry';
export type HeroKind = '赵云' | '张飞' | '关羽' | '马超' | '黄忠' | '孙悟空' | '二郎神';
export type HeroCharacter = '赵' | '云' | '张' | '飞' | '关' | '羽' | '马' | '超' | '黄' | '忠' | '孙' | '悟' | '空' | '二' | '郎' | '神';
/** 三字英雄允许任意两字先组成未激活的中间材料。 */
export type HeroFragmentKind = HeroCharacter | '孙悟' | '孙空' | '悟空' | '二郎' | '二神' | '郎神';
export type UnitKind = BasicUnitKind | HeroKind | HeroFragmentKind;
export type GameStatus = 'ready' | 'playing' | 'paused' | 'victory' | 'defeat';
export interface UnitDefinition {
  id: UnitKind;
  label: string;
  range: number;
  attackMode: 'single' | 'area';
  attack: number;
  attackIntervalMs: number;
  /** 未标记的现有兵种属于基础单位；碎字无战斗能力，英雄只能击杀成长。 */
  category?: 'fragment' | 'hero';
  heroClass?: 'legend' | 'myth';
}
export interface DefenderState {
  id: string;
  definitionId: UnitKind;
  level: number;
  cell: Cell;
  attackCooldownMs: number;
  killCount: number;
}
/** 回池单位保留身份、等级和战斗记录，仅在重新部署时赋予棋盘位置。 */
export type ReserveUnit = Omit<DefenderState, 'cell'>;
/** 拖放端点既可以是棋盘单位，也可以是召唤池卡位。 */
export type UnitLocation = { unitId: string } | { slotIndex: number };
export interface MonsterState {
  id: string;
  definitionId: string;
  hp: number;
  pathId: string;
  segmentIndex: number;
  segmentProgress: number;
}
export interface MonsterDefinition { id: string; label: string; hp: number; speed: number; leakDamage: number; goldReward: number }
export interface WaveDefinition { spawns: { atMs: number; definitionId: string; pathId: string }[] }
/** 未定的战斗规则通过纯函数替换；返回路径进度越大的目标，优先级越高。 */
export interface CombatPolicy {
  distance: (a: Cell, b: Cell) => number;
  priority: (monster: MonsterState) => number;
  inArea: (center: Cell, candidate: Cell) => boolean;
}
export interface BattleConfig {
  map: { width: number; height: number; paths: Record<string, Cell[]> };
  initialHp: number;
  initialGold: number;
  initialOpenCells: Cell[];
  hoeChance: number;
  /** 初始召唤、刷新和回池共用同一容量。 */
  summonPoolSize: number;
  refreshCost: number;
  fixedStepMs: number;
  maxCatchUpSteps: number;
  units: Record<UnitKind, UnitDefinition>;
  monsters: Record<string, MonsterDefinition>;
  waves: WaveDefinition[];
  preparationMs: number;
  combat: CombatPolicy;
}
export interface GameState {
  status: GameStatus;
  hp: number;
  gold: number;
  /** 本次刷新价格；每次成功刷新后递增，重开恢复配置初始值。 */
  refreshCost: number;
  wave: number;
  elapsedMs: number;
  waveElapsedMs: number;
  nextSpawnIndex: number;
  preparationRemainingMs: number;
  /** 字符串表示新召唤物，对象表示从棋盘放回的单位，null 表示空位。 */
  summonPool: (UnitKind | 'hoe' | ReserveUnit | null)[];
  /** 已开垦格子，移除单位后仍然保持开放。 */
  openCells: Cell[];
  defenders: DefenderState[];
  monsters: MonsterState[];
}
/** 深层只读约束防止视图误写快照；快照同时与世界状态隔离。 */
export type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export type GameSnapshot = DeepReadonly<GameState>;
export type GameCommand =
  | { type: 'DROP_ON_UNIT'; source: UnitLocation; target: UnitLocation }
  | { type: 'DEPLOY_UNIT'; slotIndex: number; cell: Cell }
  | { type: 'MERGE_UNITS'; sourceId: string; targetId: string }
  | { type: 'MERGE_INTO_POOL'; source: { unitId: string } | { slotIndex: number }; targetSlot: number }
  | { type: 'RETURN_UNIT'; unitId: string; slotIndex: number }
  | { type: 'REMOVE_UNIT'; unitId: string }
  | { type: 'REFRESH_POOL' };
export type CommandResult = { ok: true } | { ok: false; reason: string };
/** 事件只通知结果；消费方不能通过事件重复结算伤害或生命。 */
export type GameEvent =
  | { type: 'unitDeployed'; unitId: string }
  | { type: 'unitRemoved'; unitId: string }
  | { type: 'monsterSpawned'; monsterId: string }
  | { type: 'attack'; unitId: string; targets: Cell[] }
  | { type: 'monsterKilled'; monsterId: string; unitId: string }
  | { type: 'monsterEscaped'; monsterId: string; damage: number }
  | { type: 'waveCompleted'; wave: number }
  | { type: 'gameEnded'; result: 'victory' | 'defeat' };
