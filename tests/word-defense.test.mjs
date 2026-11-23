import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const compiled = name => pathToFileURL(join(process.env.WORD_DEFENSE_BUILD, name)).href;
const { GameWorld } = await import(compiled('core/GameWorld.js'));
const { MapSystem } = await import(compiled('modules/MapSystem.js'));
const { GameClock } = await import(compiled('core/GameClock.js'));
const { battleConfig } = await import(compiled('data/battleConfig.js'));

/** 可控关卡：固定直路、单怪物、无准备时间；独立复制配置避免测试互相污染。 */
function config(overrides = {}) {
  return {
    ...battleConfig,
    map: { width: 8, height: 8, paths: { main: Array.from({ length: 8 }, (_, x) => ({ x, y: 1 })) } },
    initialHp: 10, preparationMs: 0,
    monsters: { test: { id: 'test', label: '怪', hp: 20, speed: 1, leakDamage: 2 } },
    units: Object.fromEntries(Object.entries(battleConfig.units).map(([id, definition]) => [id, { ...definition, attack: 5, attackIntervalMs: 1000 }])),
    waves: [{ spawns: [{ atMs: 0, definitionId: 'test', pathId: 'main' }] }],
    ...overrides,
  };
}
/** 以正常固定帧推进，不通过超大 delta 绕过最大补偿步数。 */
function advance(world, duration) { for (let elapsed = 0; elapsed < duration; elapsed += 50) world.update(50); }
/** 部署成功是每个战斗用例的前置条件。 */
function deploy(world, kind = 'bow', cell = { x: 0, y: 0 }) {
  assert.deepEqual(world.dispatch({ type: 'DEPLOY_UNIT', definitionId: kind, cell }), { ok: true });
}
/** 静止怪便于准确断言距离与攻击次数，不依赖渲染帧。 */
function combatConfig(overrides = {}) {
  const result = config(overrides);
  result.monsters.test.speed = 0;
  return result;
}

test('地图拒绝越界、非整数、路径格和占用，失败不创建单位', () => {
  const world = new GameWorld(config());
  for (const cell of [{ x: -1, y: 0 }, { x: 8, y: 0 }, { x: 0, y: 8 }, { x: 0.5, y: 0 }, { x: 0, y: 1 }]) {
    assert.equal(world.dispatch({ type: 'DEPLOY_UNIT', definitionId: 'bow', cell }).ok, false);
  }
  deploy(world);
  assert.equal(world.dispatch({ type: 'DEPLOY_UNIT', definitionId: 'sword', cell: { x: 0, y: 0 } }).ok, false);
  assert.equal(world.getSnapshot().defenders.length, 1);
});

test('地图校验断路、越界与过短路径', () => {
  for (const path of [[{ x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 2, y: 0 }], [{ x: 7, y: 0 }, { x: 8, y: 0 }]]) {
    assert.throws(() => new MapSystem({ width: 8, height: 8, paths: { main: path } }));
  }
});

test('四种兵种可部署，移除后释放格子且不会移动其他单位', () => {
  const world = new GameWorld(config());
  ['bow', 'spear', 'sword', 'cavalry'].forEach((kind, x) => deploy(world, kind, { x, y: 0 }));
  const before = world.getSnapshot();
  assert.equal(world.dispatch({ type: 'REMOVE_UNIT', unitId: before.defenders[0].id }).ok, true);
  assert.equal(world.dispatch({ type: 'REMOVE_UNIT', unitId: before.defenders[0].id }).ok, false);
  deploy(world);
  assert.deepEqual(world.getSnapshot().defenders[0].cell, before.defenders[1].cell);
});

test('快照与命令坐标不会暴露世界可变状态', () => {
  const world = new GameWorld(config());
  const cell = { x: 0, y: 0 };
  deploy(world, 'bow', cell);
  cell.x = 7;
  const snapshot = world.getSnapshot();
  snapshot.defenders[0].cell.x = 6;
  snapshot.hp = 0;
  assert.equal(world.getSnapshot().defenders[0].cell.x, 0);
  assert.equal(world.getSnapshot().hp, 10);
});

test('未开始不推进；怪物按分段模拟时间移动', () => {
  const world = new GameWorld(config());
  advance(world, 1000);
  assert.equal(world.getSnapshot().elapsedMs, 0);
  world.start(); advance(world, 1250);
  const monster = world.getSnapshot().monsters[0];
  assert.equal(monster.segmentIndex, 1);
  assert.ok(Math.abs(monster.segmentProgress - 0.25) < 1e-9);
});

test('移动支持一个步长越过多个路径段', () => {
  const options = config(); options.monsters.test.speed = 50;
  const world = new GameWorld(options); world.start(); world.update(50);
  assert.equal(world.getSnapshot().monsters[0].segmentIndex, 2);
  assert.equal(world.getSnapshot().monsters[0].segmentProgress, 0.5);
});

test('漏怪只扣血一次，从存活统计退出并完成波次', () => {
  const world = new GameWorld(config()); world.start(); advance(world, 8000);
  assert.equal(world.getSnapshot().hp, 8);
  assert.equal(world.getSnapshot().status, 'victory');
  const events = world.drainEvents();
  assert.equal(events.filter(event => event.type === 'monsterEscaped').length, 1);
  assert.equal(events.filter(event => event.type === 'waveCompleted').length, 1);
  advance(world, 1000); assert.deepEqual(world.drainEvents(), []);
});

for (const kind of ['bow', 'sword']) {
  test(`${kind} 单体攻击只伤害一个目标并遵守冷却`, () => {
    const options = combatConfig({ waves: [{ spawns: Array.from({ length: 2 }, () => ({ atMs: 0, definitionId: 'test', pathId: 'main' })) }] });
    const world = new GameWorld(options); deploy(world, kind); world.start(); world.update(50);
    assert.deepEqual(world.getSnapshot().monsters.map(monster => monster.hp), [15, 20]);
    advance(world, 950); assert.deepEqual(world.getSnapshot().monsters.map(monster => monster.hp), [15, 20]);
    world.update(50); assert.equal(world.getSnapshot().monsters[0].hp, 10);
  });
}

for (const kind of ['spear', 'cavalry']) {
  test(`${kind} 范围攻击命中范围内多个目标`, () => {
    const options = combatConfig({ waves: [{ spawns: Array.from({ length: 3 }, () => ({ atMs: 0, definitionId: 'test', pathId: 'main' })) }] });
    const world = new GameWorld(options); deploy(world, kind); world.start(); world.update(50);
    assert.deepEqual(world.getSnapshot().monsters.map(monster => monster.hp), [15, 15, 15]);
  });
}

test('索敌遵守兵种距离边界，范围外不攻击', () => {
  for (const [cell, expectedHp] of [[{ x: 0, y: 6 }, 15], [{ x: 0, y: 7 }, 20]]) {
    const world = new GameWorld(combatConfig()); deploy(world, 'bow', cell); world.start(); world.update(50);
    assert.equal(world.getSnapshot().monsters[0].hp, expectedHp);
  }
});

test('目标优先级和溅射形状可以替换', () => {
  const options = combatConfig({ waves: [{ spawns: [0, 100].map(atMs => ({ atMs, definitionId: 'test', pathId: 'main' })) }] });
  // 可替换策略改成优先攻击后生成的怪，且范围攻击只命中中心。
  options.combat = { ...options.combat, priority: monster => Number(monster.id.split('-')[1]), inArea: (a, b) => a.x === b.x && a.y === b.y };
  options.monsters.test.speed = 1;
  const world = new GameWorld(options); world.start(); advance(world, 500);
  deploy(world); world.update(50);
  assert.deepEqual(world.getSnapshot().monsters.map(monster => monster.hp), [20, 15]);
  world.dispatch({ type: 'REMOVE_UNIT', unitId: world.getSnapshot().defenders[0].id });
  deploy(world, 'spear'); world.update(50);
  assert.deepEqual(world.getSnapshot().monsters.map(monster => monster.hp), [20, 10]);
});

test('死亡移除与击杀只结算一次，后续单位不会重复击杀', () => {
  const options = combatConfig(); options.monsters.test.hp = 5;
  const world = new GameWorld(options); deploy(world); deploy(world, 'bow', { x: 1, y: 0 });
  world.start(); world.update(50);
  assert.equal(world.getSnapshot().monsters.length, 0);
  assert.equal(world.getSnapshot().defenders.reduce((sum, unit) => sum + unit.killCount, 0), 1);
  assert.equal(world.drainEvents().filter(event => event.type === 'monsterKilled').length, 1);
  advance(world, 2000); assert.deepEqual(world.drainEvents(), []);
});

test('暂停冻结位置、冷却、刷怪、准备与时间，并拒绝部署移除', () => {
  const world = new GameWorld(config()); deploy(world); world.start(); advance(world, 500); world.pause();
  const before = world.getSnapshot(); advance(world, 10000);
  assert.deepEqual(world.getSnapshot(), before);
  assert.equal(world.dispatch({ type: 'DEPLOY_UNIT', definitionId: 'bow', cell: { x: 3, y: 0 } }).ok, false);
  assert.equal(world.dispatch({ type: 'REMOVE_UNIT', unitId: before.defenders[0].id }).ok, false);
  world.resume(); world.update(50); assert.equal(world.getSnapshot().elapsedMs, before.elapsedMs + 50);
});

test('准备时间、刷怪时刻与后续波次使用模拟时间', () => {
  const options = combatConfig({ preparationMs: 100, waves: [
    { spawns: [{ atMs: 100, definitionId: 'test', pathId: 'main' }] },
    { spawns: [{ atMs: 0, definitionId: 'test', pathId: 'main' }] },
  ] });
  options.monsters.test.hp = 5;
  const world = new GameWorld(options); deploy(world); world.start(); advance(world, 150);
  assert.equal(world.getSnapshot().nextSpawnIndex, 0);
  world.update(50); assert.equal(world.getSnapshot().wave, 2);
  assert.equal(world.getSnapshot().status, 'playing');
  advance(world, 1500); assert.equal(world.getSnapshot().status, 'victory');
  assert.deepEqual(world.drainEvents().filter(event => event.type === 'waveCompleted').map(event => event.wave), [1, 2]);
});

test('最终漏怪致零生命时只失败，不同时胜利且不出现负血量', () => {
  const options = config({ initialHp: 1 }); options.monsters.test.speed = 200;
  const world = new GameWorld(options); world.start(); world.update(5000);
  assert.equal(world.getSnapshot().hp, 0); assert.equal(world.getSnapshot().status, 'defeat');
  assert.deepEqual(world.drainEvents().filter(event => event.type === 'gameEnded'), [{ type: 'gameEnded', result: 'defeat' }]);
  assert.equal(world.getSnapshot().elapsedMs, 50);
});

test('固定时钟累加小帧、限制追帧，并在暂停时清空余量', () => {
  const clock = new GameClock(50, 8); let steps = 0;
  clock.advance(30, () => { steps++; return true; }); assert.equal(steps, 0);
  clock.advance(20, () => { steps++; return true; }); assert.equal(steps, 1);
  clock.advance(60000, () => { steps++; return true; }); assert.equal(steps, 9);
  const world = new GameWorld(config()); world.start(); world.update(30); world.pause(); world.resume(); world.update(20);
  assert.equal(world.getSnapshot().elapsedMs, 0);
});

test('重开恢复就绪状态、清空实体事件和计时，允许重新部署', () => {
  const world = new GameWorld(config()); deploy(world); world.start(); advance(world, 1000); world.pause(); world.restart();
  assert.equal(world.getSnapshot().status, 'ready'); assert.equal(world.getSnapshot().hp, 10);
  assert.deepEqual(world.getSnapshot().defenders, []); assert.deepEqual(world.getSnapshot().monsters, []);
  assert.equal(world.getSnapshot().elapsedMs, 0); assert.deepEqual(world.drainEvents(), []);
  deploy(world); assert.equal(world.getSnapshot().defenders[0].id, 'unit-1');
});

test('实际 P1 配置可部署阵容打通，也可因无防守失败', () => {
  const defended = new GameWorld(battleConfig);
  for (const [x, y, kind] of [[1, 0, 'bow'], [3, 2, 'spear'], [5, 4, 'cavalry'], [2, 4, 'sword'],
    [3, 0, 'bow'], [5, 2, 'spear'], [3, 4, 'cavalry'], [5, 6, 'bow']]) deploy(defended, kind, { x, y });
  defended.start(); advance(defended, 180000); assert.equal(defended.getSnapshot().status, 'victory');
  const empty = new GameWorld(battleConfig); empty.start(); advance(empty, 180000);
  assert.equal(empty.getSnapshot().status, 'defeat');
});

test('默认策略优先攻击前方怪物，圆形溅射不波及远处目标', () => {
  const options = config({ waves: [{ spawns: [0, 2000].map(atMs => ({ atMs, definitionId: 'test', pathId: 'main' })) }] });
  const world = new GameWorld(options); world.start(); advance(world, 2500);
  deploy(world, 'spear', { x: 2, y: 0 }); world.update(50);
  assert.deepEqual(world.getSnapshot().monsters.map(monster => monster.hp), [15, 20]);
});

test('准备阶段暂停不会提前刷怪，恢复只推进本次帧时间', () => {
  const world = new GameWorld(config({ preparationMs: 1000 })); world.start(); advance(world, 200); world.pause();
  advance(world, 5000); assert.equal(world.getSnapshot().preparationRemainingMs, 800);
  world.resume(); world.update(50); assert.equal(world.getSnapshot().preparationRemainingMs, 750);
  assert.equal(world.getSnapshot().monsters.length, 0);
});
