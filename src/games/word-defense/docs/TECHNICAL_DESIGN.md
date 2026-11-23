# 文字合成塔防 — 技术设计说明（TDD）

> 对应 `GAME_DESIGN.md` v0.1。目标：让 Codex 在**已有 Phaser + TypeScript 项目**中实际编码，而不是只输出设计或重建项目。

## 1. 技术目标与边界

- 当前平台：Web；未来目标：**微信小游戏**。
- 渲染与游戏内 UI：Phaser（使用项目现有版本，先检查）。
- 游戏规则：**纯 TypeScript、数据驱动、独立 System**；核心禁止 import Phaser、访问 DOM/window/document/localStorage/wx。
- 不强制 ECS、不使用无必要的依赖注入或状态库。
- 先审查项目结构、构建命令、已有代码、测试框架，再决定文件迁移；**禁止机械重建工程**。
- 微信小游戏不是浏览器，Phaser 的兼容性需要独立验证；平台适配层不意味着开箱即用。

## 2. 依赖方向

`Phaser Scene / Phaser UI → Application(GameController) → GameWorld → Systems → Data/Types`

`PlatformAdapter` 由启动层注入需要平台能力的服务。GameWorld 和 Systems 不依赖 Scene、UI 或平台具体实现。

- **Core**：游戏状态、统一时钟、固定步长更新、事件与命令入口。
- **Systems**：地图、单位、怪物、战斗、合成、英雄经验、经济、召唤、波次、装备、技能。
- **Data**：静态配置、配方、掉落、波次定义、临时测试数值。
- **Renderer**：Phaser Scene、文字实体视图、战斗特效、摄像机与布局。
- **UI**：Phaser 交互控件和面板，转发命令，订阅状态。
- **Platform**：输入/存储/音频/生命周期等确实需要的适配接口，按需添加。

## 3. 推荐目录（按现有工程调整）

```text
src/
  core/
    GameWorld.ts
    GameState.ts
    GameClock.ts
    GameEvents.ts
  modules/
    map/          # 格子、路径、部署合法性
    unit/         # 基础单位/英雄的运行时实体
    monster/      # 怪物移动和生命周期
    combat/       # 索敌、攻击、伤害、死亡
    synthesis/    # 二合一升级与英雄配方
    hero/         # 英杰/神话元数据、击杀经验
    economy/      # 金币收入和支出
    summon/       # 六槽池、手动刷新、购买
    wave/         # 生成与通关判定
    equipment/    # 装备、碎片、掉落
    skill/        # 主动/被动技能与效果
  data/           # 静态定义与平衡参数
  renderer/
    scenes/
    views/
    effects/
  ui/             # Phaser HUD、召唤池、单位详情
  platform/       # Adapter 接口、Web 实现、未来微信实现
  shared/         # 通用类型和纯函数
```

只创建当前阶段实际需要的文件；未来模块保留在设计中，不要创建空壳文件。

## 4. 核心数据模型（示意接口，允许依据现有工程调整）

```ts
export type UnitKind = 'bow' | 'spear' | 'sword' | 'cavalry';
export type HeroCategory = 'historical' | 'mythological'; // 英杰 / 神话
export type GameStatus = 'ready' | 'playing' | 'paused' | 'victory' | 'defeat';
export interface Cell { x: number; y: number }

export interface BasicUnitDefinition {
  id: UnitKind;
  label: '弓' | '枪' | '刀' | '骑';
  range: number; // 弓5、枪4、刀1、骑3；距离算法待定
  attackMode: 'single' | 'area';
  attack: number;        // placeholder
  attackIntervalMs: number; // placeholder
}

export interface HeroDefinition {
  id: string;
  name: string;
  category: HeroCategory;
  recipeId?: string;
  maxLevel: 5;
}

export interface DefenderState {
  id: string;
  definitionId: string;
  kind: 'basic' | 'hero';
  level: number;
  cell: Cell;
  attackCooldownMs: number;
  killCount: number;
  exp: number;
}

export interface MonsterState {
  id: string;
  definitionId: string;
  hp: number;
  pathId: string;
  segmentIndex: number;
  segmentProgress: number;
}

export interface GameState {
  status: GameStatus;
  hp: number;
  gold: number;
  wave: number;
  defenders: DefenderState[];
  monsters: MonsterState[];
}
```

静态定义和运行时状态分离；不要在实体上复制一整套可变配置。坐标用**格子/逻辑坐标**，由渲染层换算像素。

## 5. 游戏更新与命令边界

```ts
interface GameWorld {
  start(): void;
  pause(): void;
  resume(): void;
  restart(): void;
  update(deltaMs: number): void;
  getSnapshot(): Readonly<GameState>;
  dispatch(command: GameCommand): CommandResult;
}

type GameCommand =
  | { type: 'DEPLOY_UNIT'; definitionId: string; cell: Cell }
  | { type: 'REMOVE_UNIT'; unitId: string }
  | { type: 'SYNTHESIZE'; sourceIds: [string, string] }
  | { type: 'REFRESH_POOL' }
  | { type: 'BUY_POOL_SLOT'; slotIndex: number };

type CommandResult = { ok: true } | { ok: false; reason: string };
```

- UI 只发命令，不直接修改状态。
- 每个 System 只处理自己的职责，状态变更由 GameWorld 编排。
- 使用固定步长更新（例如 50ms **技术测试值**）；累计 delta，限制每帧最大补偿步数；暂停不推进模拟时间。
- 不用 setTimeout/setInterval 计算战斗、金币、召唤池和波次逻辑。
- 对渲染提供只读快照或事件；高频实体位置可按快照同步，避免每帧重建文字对象。
- 事件示例：`monsterSpawned`、`monsterKilled`、`monsterEscaped`、`unitDeployed`、`unitSynthesized`、`waveCompleted`、`gameEnded`。事件用于通知，避免相互递归调用造成重复结算。

## 6. 各 System 的职责与规则

### MapSystem
- 8×8 地图；支持配置多条 `pathId -> Cell[]` 路径，首版一条。
- 校验路径连续性、地图边界、可部署格和占用；不负责绘制。
- 部署后不能移动；移除后释放占用。

### UnitSystem
- 创建、部署、移除、查询基础单位和英雄实例；静态数据来自 `data`。
- 基础单位最多 5 级；英雄最多 5 级，升级来源由不同系统负责。
- 不直接计算战斗伤害或操作 Scene。

### MonsterSystem
- 按 `pathId` 沿路径分段移动，使用模拟时间推进；死亡/抵达终点只结算一次。
- 怪物到达目标后触发漏怪扣血，由 GameWorld 统一执行胜负判断。

### CombatSystem
- 负责目标筛选、攻击间隔、伤害与击杀事件。
- 弓/刀为单体；枪/骑为范围伤害。攻击距离算法、范围形状、索敌优先级**待设计**；第一阶段使用可替换策略和集中测试参数，不得宣称为正式规则。
- DamageCalculator 用纯函数实现；预留装备、Buff、技能效果接入点，但不预先实现复杂效果框架。

### SynthesisSystem
- 基础单位两个合成一个、升一级、消耗材料，最高 5 级；合成需要事务式校验与提交，失败不能消耗单位。
- 英雄按配置配方合成**一次**，后续不通过合成升级。
- 基础合成仅允许同名同级单位；材料消耗，目标保留位置并升一级。支持棋盘内、召唤池内及两者之间双向拖动合并；池内新召唤物为一级，升级或回池的实例按实际等级合并。失败不消耗材料，由 UnitSystem 统一校验。
- 拖到已有单位通过 `DROP_ON_UNIT` 统一处理：先尝试合并，不满足合并规则则互换位置；原有点击合并命令仍只尝试合并。跨区互换保留完整单位状态，池中的新召唤物首次上场时创建实例，锄头不允许进入棋盘单位位置。
- 当前 `UnitSynthesis.resolveUnitSynthesis` 是实际合成与界面高亮的共享纯函数：基础兵种同名同级升级，英雄字按姓名配方组合，完整英雄禁止重复合成。`category: fragment` 的单字与中间名只作材料；拼齐名字后转为 `category: hero`，以一级激活。`data/heroes.ts` 集中保存七位英雄、合法中间名和临时平衡参数。

### HeroProgressionSystem
- `historical` 仅对应真实历史人物；`mythological` 对应神话人物。
- 英雄击杀成长，最高 5 级；当前 CombatSystem 排除名字材料的攻击，英雄获得最后一击时增加累计击杀。临时阈值 3、8、15、25，英雄每级增加基础攻击的 25%，均取自 `heroBalance`，后续可调整；不通过重复合成升级。

### EconomySystem
- 统一处理周期产金、刷新花费、购买花费和奖励，防止余额为负。
- 金币产生频率与数值配置化。

### SummonSystem
- 固定六槽，**仅手动刷新**；刷新扣金币。
- 池内容类型：基础单位、英雄、装备、回血和其他道具。
- 槽位生成采用可注入随机数源，便于复现测试；概率与购买行为配置化。

### WaveSystem
- 配置化波次与刷怪序列；常规模式 20 波，后续强度递增。
- 负责生成调度、清场判断、胜利判定；漏怪与死亡怪都要从存活统计中正确退出。

### EquipmentSystem / SkillSystem
- 普通装备直接使用，专属武器需碎片合成；掉落表与背包、装备栏解耦。
- 主动技能通过命令触发，被动技能通过事件/效果参与计算；具体规则尚未确定，先设计边界，暂不实现空框架。

## 7. Phaser 层实现约束

- `BattleScene` 初始化并驱动 GameWorld；只负责渲染、输入转换和生命周期。
- `GridView` 显示 8×8 地图与路径；`DefenderView`、`MonsterView` 通过稳定 ID 复用显示对象。
- 文字优先使用 Phaser Text；移动端需考虑字体可用性、缩放与点击区域。
- Phaser UI：金币、生命、波次、召唤池、单位选择、技能按钮、结算面板；首版可只做必要 HUD 与调试部署。
- 不在 Scene 中写伤害、金币扣减、升级和波次判定。
- 输入以指针/触摸为主，适配竖屏安全区域；桌面浏览器支持点击调试。

## 8. 微信小游戏兼容策略

- 首版 Web 开发，但核心不引用浏览器全局对象。
- 按需定义 `PlatformAdapter`（存档、音频、生命周期等）；不为尚不存在的需求添加空接口。
- Phaser 运行层需要单独验证微信小游戏的 Canvas、文本、输入、资源、音频、包体及性能限制。
- **尽早做最小兼容性 Spike**：启动 Phaser、绘制 8×8 和中文文字、处理触摸、加载资源；若不兼容，先确定可维护的适配方案再扩展。
- 不把“微信小游戏”误写成“微信小程序 WebView”。

## 9. 分阶段编码任务与验收

### P1 战斗闭环
实现地图、单路径、四种基础单位、部署/移除、怪物移动、索敌攻击、扣血、测试波次、暂停、胜负、Phaser 文字界面。允许通过**调试部署栏**直接部署，不实现正式召唤。验收：可在 Web 上实际游玩并完成胜负结算。

### P2 经营与基础合成
金币、六槽池、手动刷新、购买部署、同类同级二合一、等级上限与费用验证。验收：可通过金币循环构筑阵容，不依赖调试部署。

### P3 英雄
英杰/神话配置、配方合成、召唤池英雄、击杀成长、等级上限。验收：两条获得英雄路径可用，升级来源正确。

### P4 装备、技能与完整关卡
普通装备、专武碎片、掉落、主动/被动技能、20 波与大奖励。验收：完整单局循环可通关或失败。

### P5 微信小游戏适配
通过实际小游戏环境验证并处理兼容问题、触摸布局、性能、资源和发布约束。

## 10. 测试规范

- 核心测试不依赖 Phaser 或浏览器。
- 必测：地图边界、路径格部署限制、格子占用、部署移除、移动与漏怪、索敌范围、单体/范围伤害、死亡只结算一次、暂停不推进、波次完成、胜负判定。
- P2 增补：金币不足、刷新扣费、六槽容量、二合一材料消耗、等级上限、合成失败原子性。
- P3 增补：英杰/神话分类、英雄生成一次、击杀经验、5 级封顶。
- 使用可控随机数和模拟时钟，确保测试可复现。

## 11. Codex 执行指令

1. 阅读 `GAME_DESIGN.md` 和本文件。
2. 检查现有 `package.json`、`tsconfig`、`src`、Phaser 版本、构建/测试脚本。
3. 列出实际计划新增/修改的文件与理由，**随后直接编码 P1**；除非遇到阻塞问题，不必等待确认。
4. 只实现 P1 的真实可运行功能，不要生成 P2–P5 的空壳类。
5. 未定的玩法规则若不阻塞 P1，保持待定；若阻塞，用可替换、集中标注的临时策略，并在交付报告中列出。
6. 运行项目已有的类型检查、测试、构建；若缺少测试工具，选择轻量且与项目兼容的方案。
7. 交付：变更文件清单、运行命令、已实现内容、测试结果、未定事项和下一阶段建议。

**验收重点：实际修改项目代码并得到可运行的 Web 战斗原型，而不是只产出目录、接口、伪代码或文档。**
