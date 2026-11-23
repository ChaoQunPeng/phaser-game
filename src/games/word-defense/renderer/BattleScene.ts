import Phaser from 'phaser';
import { GameController } from '../application/GameController.js';
import { battleConfig } from '../data/battleConfig.js';
import type { GameEvent, GameSnapshot } from '../core/types.js';
import { MapSystem } from '../modules/MapSystem.js';
import { GridView } from './GridView.js';
import { DefenderView, MonsterView } from './EntityViews.js';
import { BattleHud } from '../ui/BattleHud.js';
import { battleTheme as theme, drawPaper } from '../ui/theme.js';
import brushFontUrl from '../assets/battle-brush.woff2?url';

/** 场景只驱动控制器、转换输入和同步视图，不计算战斗规则。 */
export class BattleScene extends Phaser.Scene {
  private readonly placementMap = new MapSystem(battleConfig.map);
  private controller!: GameController;
  private grid!: GridView;
  private defenders!: DefenderView;
  private monsters!: MonsterView;
  private hud!: BattleHud;
  private selectedSlot: number | undefined;
  private selectedId?: string;
  /** 按下棋盘单位后先等待拖动阈值，轻点仍走原来的选中和合并逻辑。 */
  private boardDrag?: { unitId: string; x: number; y: number; dragging: boolean };

  constructor() { super('WordDefenseBattle'); }

  /** 本地字体随 Phaser 资源加载完再创建棋子，避免首帧字体闪烁。 */
  preload(): void { this.load.font(theme.fonts.brush, brushFontUrl, 'woff2'); }

  /** 创建游戏内全部 Phaser UI，无 DOM 游戏面板和外部素材依赖。 */
  create(): void {
    // 高分辨率画布通过相机映射回 480 × 784 逻辑坐标，布局和 worldX/worldY 输入保持一致。
    this.syncRenderCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.syncRenderCamera, this);
    drawPaper(this);
    this.controller = new GameController(battleConfig);
    this.grid = new GridView(this, battleConfig);
    this.defenders = new DefenderView(this, this.grid, battleConfig);
    this.monsters = new MonsterView(this, this.grid, battleConfig);
    this.hud = new BattleHud(this, battleConfig, {
      toggle: () => this.controller.toggle(),
      restart: () => {
        this.controller.restart();
        this.selectedId = undefined;
        this.selectedSlot = undefined;
        this.controller.toggle();
        
      },
      choose: slotIndex => {
        // 点击池中已有单位用于部署，回池统一通过拖入召唤池区域完成。
        this.selectedSlot = slotIndex; this.selectedId = undefined;
      },
      refresh: () => {
        const result = this.controller.dispatch({ type: 'REFRESH_POOL' });
        if (result.ok) { this.selectedSlot = undefined; this.grid.previewPlacement(); }
        this.sync(this.controller.getSnapshot());
      },
      hover: (x, y) => this.previewPlacement(x, y),
      clearHover: () => { this.grid.previewPlacement(); this.hud.previewMerge(); },
      drop: (slotIndex, x, y) => {
        // 拖到已有单位统一按先合并、否则互换处理，空格仍走部署规则。
        if (this.hud.isModalOpen()) return;
        const targetSlot = this.hud.summonSlotAt(x, y);
        const cell = this.grid.toCell(x, y);
        const targetUnit = this.controller.getSnapshot().defenders.find(unit => unit.cell.x === cell.x && unit.cell.y === cell.y);
        const result = targetSlot !== undefined
          ? this.controller.dispatch({ type: 'DROP_ON_UNIT', source: { slotIndex }, target: { slotIndex: targetSlot } })
          : targetUnit
            ? this.controller.dispatch({ type: 'DROP_ON_UNIT', source: { slotIndex }, target: { unitId: targetUnit.id } })
            : this.controller.dispatch({ type: 'DEPLOY_UNIT', slotIndex, cell });
        if (result.ok) { this.selectedSlot = undefined; this.grid.previewPlacement(); }
        this.sync(this.controller.getSnapshot());
      },
    });
    // 从开始页进入后立即启动模拟时钟，复用波次准备时间驱动倒计时与出怪。
    this.controller.toggle();
    
    this.input.on('pointerdown', this.onBoardPress, this);
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const drag = this.boardDrag;
      if (drag) {
        if (!drag.dragging && Math.hypot(pointer.x - drag.x, pointer.y - drag.y) >= this.input.dragDistanceThreshold) {
          drag.dragging = true;
          this.selectedId = drag.unitId;
          this.selectedSlot = undefined;
          this.grid.previewPlacement();
        }
        if (drag.dragging) {
          this.defenders.drag(drag.unitId, point);
          this.previewPlacement(point.x, point.y);
          return;
        }
      }
      this.previewPlacement(point.x, point.y);
    });
    this.input.on('pointerup', this.onBoardRelease, this);
    this.input.on('gameout', () => this.cancelBoardDrag());
    // 页面失焦或隐藏会自动暂停；回到游戏后由玩家手动继续。
    this.game.events.on(Phaser.Core.Events.BLUR, this.onInactive, this);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.onInactive, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.syncRenderCamera, this);
      this.game.events.off(Phaser.Core.Events.BLUR, this.onInactive, this);
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.onInactive, this);
    });
    this.sync(this.controller.getSnapshot());
  }

  /** 单位上的按下延迟到松手处理，避免拖回操作误触发合并。 */
  private onBoardPress(pointer: Phaser.Input.Pointer): void {
    if (this.hud.isModalOpen()) return;
    const state = this.controller.getSnapshot();
    if (state.status !== 'ready' && state.status !== 'playing') return;
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const cell = this.grid.toCell(point.x, point.y);
    const unit = state.defenders.find(candidate => candidate.cell.x === cell.x && candidate.cell.y === cell.y);
    if (unit) this.boardDrag = { unitId: unit.id, x: pointer.x, y: pointer.y, dragging: false };
    else this.onBoardPointer(pointer);
  }

  /** 落点有单位时先合并、否则互换；拖入池中空白区域仍自动收回。 */
  private onBoardRelease(pointer: Phaser.Input.Pointer): void {
    const drag = this.boardDrag;
    if (!drag) return;
    this.cancelBoardDrag();
    if (this.hud.isModalOpen()) return;
    if (!drag.dragging) { this.onBoardPointer(pointer); return; }
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const state = this.controller.getSnapshot();
    const targetSlot = this.hud.summonSlotAt(point.x, point.y);
    const cell = this.grid.toCell(point.x, point.y);
    const target = state.defenders.find(unit => unit.cell.x === cell.x && unit.cell.y === cell.y);
    const slotIndex = state.summonPool.findIndex(entry => entry === null);
    // 已有目标单位优先处理合并或互换，不转移到其他空槽。
    if (targetSlot !== undefined && state.summonPool[targetSlot] !== null) {
      const result = this.controller.dispatch({ type: 'DROP_ON_UNIT', source: { unitId: drag.unitId }, target: { slotIndex: targetSlot } });
      if (result.ok) { this.selectedId = undefined; this.selectedSlot = targetSlot; }
    } else if (target) {
      const result = this.controller.dispatch({ type: 'DROP_ON_UNIT', source: { unitId: drag.unitId }, target: { unitId: target.id } });
      if (result.ok) this.selectedId = target.id;
    }
    // 整个召唤池面板都可接收，包含卡片间隙和留白。
    else if (slotIndex >= 0 && this.hud.containsSummonPool(point.x, point.y)) {
      const result = this.controller.dispatch({ type: 'RETURN_UNIT', unitId: drag.unitId, slotIndex });
      if (result.ok) { this.selectedId = undefined; this.selectedSlot = slotIndex; }
    }
    this.sync(this.controller.getSnapshot());
  }

  /** 取消指针手势，视图在下一次快照同步时回到原位。 */
  private cancelBoardDrag(): void {
    this.boardDrag = undefined;
    this.defenders.endDrag();
    this.grid.previewPlacement();
    this.hud.previewMerge();
  }

  /** 画布像素变化只调整相机倍率，不改变玩法使用的逻辑尺寸。 */
  private syncRenderCamera(): void {
    this.cameras.main.setZoom(this.scale.gameSize.width / theme.layout.width)
      .centerOn(theme.layout.width / 2, theme.layout.height / 2);
  }

  /** 只处理棋盘内的指针，按钮区域由 HUD 自己接收。 */
  private onBoardPointer(pointer: Phaser.Input.Pointer): void {
    // 弹窗按钮的点击不能同时触发底层棋盘部署。
    if (this.hud.isModalOpen()) return;
    const cell = this.grid.toCell(pointer.worldX, pointer.worldY);
    if (cell.x < 0 || cell.y < 0 || cell.x >= battleConfig.map.width || cell.y >= battleConfig.map.height) return;
    const state = this.controller.getSnapshot();
    if (state.status !== 'ready' && state.status !== 'playing') return;
    const unit = state.defenders.find(candidate => candidate.cell.x === cell.x && candidate.cell.y === cell.y);
    if (unit) {
      // 召唤池落子优先于棋盘选择，允许将一级材料直接放在同名一级单位上。
      if (this.selectedSlot !== undefined) {
        const result = this.controller.dispatch({ type: 'DEPLOY_UNIT', slotIndex: this.selectedSlot, cell });
        if (result.ok) { this.selectedSlot = undefined; this.selectedId = unit.id; this.grid.previewPlacement(); }
      } else if (this.selectedId && this.selectedId !== unit.id) {
        const result = this.controller.dispatch({ type: 'MERGE_UNITS', sourceId: this.selectedId, targetId: unit.id });
        // 不匹配时仅切换选择，不消耗任一单位；可继续选择其他同级材料。
        this.selectedId = unit.id;
        if (result.ok) this.grid.previewPlacement();
      } else this.selectedId = unit.id;
      this.sync(this.controller.getSnapshot());
      return;
    }
    // 落子成功后清空待召唤选择；必须再从池中选择其他单位才能继续部署。
    if (this.selectedSlot === undefined) return;
    const result = this.controller.dispatch({ type: 'DEPLOY_UNIT', slotIndex: this.selectedSlot, cell });
    if (result.ok) { this.selectedSlot = undefined; this.grid.previewPlacement(); }
    
  }

  /** 预览复用核心地图规则，路径、占用格及棋盘外不显示可放置高亮。 */
  private previewPlacement(x: number, y: number): void {
    const state = this.controller.getSnapshot();
    const cell = this.grid.toCell(x, y);
    const target = state.defenders.find(unit => unit.cell.x === cell.x && unit.cell.y === cell.y);
    const source = state.defenders.find(unit => unit.id === this.selectedId);
    // 悬停时按材料实际等级提示棋盘和召唤池中的合法合并目标。
    const entry = this.selectedSlot !== undefined ? state.summonPool[this.selectedSlot] : null;
    const materialKind = this.selectedSlot !== undefined
      ? (typeof entry === 'object' ? entry?.definitionId : entry) : source?.definitionId;
    const materialLevel = this.selectedSlot !== undefined
      ? (typeof entry === 'object' ? entry?.level : 1) : source?.level;
    const canMerge = target && target.id !== source?.id && target.definitionId === materialKind
      && target.level === materialLevel && target.level < 5;
    const active = state.status === 'ready' || state.status === 'playing';
    const poolSlot = this.hud.summonSlotAt(x, y);
    const poolEntry = poolSlot !== undefined ? state.summonPool[poolSlot] : null;
    const poolKind = poolEntry && typeof poolEntry === 'object' ? poolEntry.definitionId : poolEntry;
    const poolLevel = poolEntry && typeof poolEntry === 'object' ? poolEntry.level : 1;
    // 棋盘与池内使用相同的同名同级规则，仅合法目标显示高亮。
    const canMergeIntoPool = active && poolEntry && poolKind !== 'hoe' && poolKind === materialKind
      && poolLevel === materialLevel && poolLevel < 5 && poolSlot !== this.selectedSlot;
    this.hud.previewMerge(canMergeIntoPool ? poolSlot : undefined);
    const valid = active && this.selectedSlot !== undefined
      && state.summonPool[this.selectedSlot] !== null
      && !this.placementMap.placementError(cell, state.defenders, state.openCells, state.summonPool[this.selectedSlot] === 'hoe');
    this.grid.previewPlacement((active && canMerge) || valid ? cell : undefined);
  }

  /** 生命周期适配在渲染层处理，核心无需接触浏览器事件。 */
  private onInactive(): void { this.cancelBoardDrag(); this.controller.pause(); }

  /** 每帧同步稳定对象；攻击线是短期视觉效果，不参与伤害或时间计算。 */
  update(_time: number, deltaMs: number): void {
    this.controller.update(deltaMs);
    const state = this.controller.getSnapshot();
    this.sync(state);
    for (const event of this.controller.drainEvents()) this.feedback(event, state);
  }

  /** 视图和 HUD 读取同一帧快照。 */
  private sync(state: GameSnapshot): void {
    if (state.status !== 'ready' && state.status !== 'playing') this.cancelBoardDrag();
    this.grid.syncOpenCells(state.openCells);
    this.defenders.sync(state); this.monsters.sync(state, this.controller.getMonsterRenderDelayMs());
    this.grid.select(state.defenders.find(unit => unit.id === this.selectedId)?.cell);
    this.hud.sync(state, this.selectedSlot);
  }

  /** 攻击显示弹道与受击圈；城防变化由 HUD 同步。 */
  private feedback(event: GameEvent, state: GameSnapshot): void {
    if (event.type !== 'attack') return;
    // 事件与同帧快照来自同一世界；攻击事件中的单位必然仍在场。
    const unit = state.defenders.find(candidate => candidate.id === event.unitId)!;
    const from = this.grid.toPixel(unit.cell);
    const first = this.grid.toPixel(event.targets[0]);
    const angle = Math.atan2(first.y - from.y, first.x - from.x);
    this.defenders.attack(event.unitId, { x: Math.cos(angle), y: Math.sin(angle) });
    const effect = this.add.graphics().setDepth(6).lineStyle(1.7, theme.colors.ink, 0.65);
    for (const target of event.targets) {
      const to = this.grid.toPixel(target);
      // 短墨痕在棋子边缘终止，避免穿过毛笔字遮挡文字。
      const direction = Math.atan2(to.y - from.y, to.x - from.x);
      effect.lineBetween(from.x + Math.cos(direction) * 22, from.y + Math.sin(direction) * 22,
        to.x - Math.cos(direction) * 17, to.y - Math.sin(direction) * 17);
      effect.lineStyle(2, theme.colors.enemy, 0.65);
      effect.lineBetween(to.x - 8, to.y - 13, to.x - 13, to.y - 18);
      effect.lineBetween(to.x + 8, to.y - 13, to.x + 12, to.y - 18);
      effect.lineStyle(1.7, theme.colors.ink, 0.65);
    }
    this.tweens.add({ targets: effect, alpha: 0, duration: theme.motion.trailMs, onComplete: () => effect.destroy() });
  }
}
