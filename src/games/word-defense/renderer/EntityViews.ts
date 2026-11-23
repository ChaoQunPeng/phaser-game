import Phaser from 'phaser';
import type { BattleConfig, Cell, GameSnapshot } from '../core/types.js';
import { MapSystem } from '../modules/MapSystem.js';
import { GridView } from './GridView.js';
import { battleTheme as theme, textStyle } from '../ui/theme.js';

/** 稳定单位视图：以汉字展示兵种，容器承载位置和动画。 */
interface PieceView { root: Phaser.GameObjects.Container; glyph: Phaser.GameObjects.Text }

/** 单位仅显示兵种文字，不绘制底座、阴影或外围圆圈。 */
function createPiece(scene: Phaser.Scene, label: string, enemy: boolean): PieceView {
  const { colors, fontSizes } = theme;
  const color = enemy ? colors.enemy : colors.ally;
  const glyph = scene.add.text(0, -1, label, textStyle(enemy ? fontSizes.enemy : fontSizes.unit, color, true)).setOrigin(0.5);
  const root = scene.add.container(0, 0, [glyph]).setDepth(enemy ? 5 : 4);
  return { root, glyph };
}

/** 单位棋子以稳定 ID 复用；部署与攻击动画只影响视图。 */
export class DefenderView {
  private readonly views = new Map<string, PieceView & { levelLabel: Phaser.GameObjects.Text; level: number }>();
  private draggedId?: string;
  constructor(private readonly scene: Phaser.Scene, private readonly grid: GridView, private readonly config: BattleConfig) {}

  /** 部署采用短促落子动画，移除时销毁整个棋子容器。 */
  sync(state: GameSnapshot): void {
    if (state.status !== 'ready' && state.status !== 'playing') this.draggedId = undefined;
    const live = new Set(state.defenders.map(unit => unit.id));
    for (const [id, view] of this.views) if (!live.has(id)) { this.scene.tweens.killTweensOf(view.root); view.root.destroy(); this.views.delete(id); }
    for (const unit of state.defenders) {
      if (!this.views.has(unit.id)) {
        const point = this.grid.toPixel(unit.cell);
        const piece = createPiece(this.scene, this.config.units[unit.definitionId].label, false);
        // 等级放在棋子下缘，使用正文字体，不依赖毛笔字库是否包含数字。
        const levelLabel = this.scene.add.text(0, 19, `${unit.level}级`, textStyle(11, theme.colors.ally))
          .setOrigin(0.5).setBackgroundColor('#faf5e9');
        piece.root.add(levelLabel);
        const view = { ...piece, levelLabel, level: unit.level };
        view.root.setPosition(point.x, point.y).setScale(0.7).setAlpha(0.5);
        this.scene.tweens.add({ targets: view.root, scale: 1, alpha: 1, duration: theme.motion.deployMs, ease: 'Back.Out' });
        this.views.set(unit.id, view);
      }
      const view = this.views.get(unit.id)!;
      // 拖动仅移动显示对象；取消或放回失败时，下一次同步恢复逻辑格位置。
      if (unit.id !== this.draggedId) {
        const point = this.grid.toPixel(unit.cell);
        view.root.setPosition(point.x, point.y).setDepth(4);
      }
      if (view.level !== unit.level) {
        view.level = unit.level;
        view.levelLabel.setText(`${unit.level}级`);
        // 合并反馈只缩放棋子，升级数值由核心命令确定。
        this.scene.tweens.killTweensOf(view.root);
        view.root.setScale(1).setAlpha(1);
        this.scene.tweens.add({ targets: view.root, scale: 1.15, duration: theme.motion.deployMs, yoyo: true });
      }
    }
  }

  /** 拖动棋盘文字跟随指针，核心单位在成功放回前仍留在原格。 */
  drag(unitId: string, point: Cell): void {
    this.draggedId = unitId;
    this.views.get(unitId)!.root.setPosition(point.x, point.y).setDepth(9);
  }

  /** 松手、离开画布或暂停时结束显示拖动，由快照恢复位置。 */
  endDrag(): void { this.draggedId = undefined; }

  /** 汉字轻推向攻击方向，不改变棋盘逻辑位置。 */
  attack(unitId: string, direction: Cell): void {
    const view = this.views.get(unitId)!;
    this.scene.tweens.killTweensOf(view.glyph);
    view.glyph.setPosition(0, -1);
    this.scene.tweens.add({ targets: view.glyph, x: direction.x * 3, y: -1 + direction.y * 3,
      duration: theme.motion.attackMs, yoyo: true, ease: 'Sine.Out' });
  }
}

/** 敌方单位以朱色文字与短血条区分，不覆盖主文字。 */
export class MonsterView {
  private readonly views = new Map<string, PieceView & { bar: Phaser.GameObjects.Rectangle; hp: number }>();
  private readonly map: MapSystem;
  constructor(private readonly scene: Phaser.Scene, private readonly grid: GridView, private readonly config: BattleConfig) {
    this.map = new MapSystem(config.map);
  }

  /** 按逻辑步余量逐帧插值路径位置，真实生命减少时给汉字短促受击反馈。 */
  sync(state: GameSnapshot, renderDelayMs: number): void {
    const live = new Set(state.monsters.map(monster => monster.id));
    for (const [id, view] of this.views) if (!live.has(id)) {
      this.scene.tweens.killTweensOf(view.glyph); view.root.destroy(); this.views.delete(id);
    }
    for (const monster of state.monsters) {
      const definition = this.config.monsters[monster.definitionId];
      let view = this.views.get(monster.id);
      if (!view) {
        const piece = createPiece(this.scene, definition.label, true);
        const track = this.scene.add.rectangle(-14, -24, 28, 3, theme.colors.shadow, 0.22).setOrigin(0, 0.5);
        const bar = this.scene.add.rectangle(-14, -24, 28, 3, theme.colors.enemy).setOrigin(0, 0.5);
        piece.root.add([track, bar]);
        view = { ...piece, bar, hp: monster.hp };
        this.views.set(monster.id, view);
      }
      if (monster.hp < view.hp) {
        // 连续命中先终止上一轮反馈，重置偏移后再抖动，避免位移和旋转累积。
        this.scene.tweens.killTweensOf(view.glyph);
        const glyph = view.glyph;
        glyph.setPosition(-3, -1).setAngle(-6).setAlpha(0.65);
        // 仅抖动文字：100ms 内左右往返两次，血条和沿路径移动的位置保持稳定。
        this.scene.tweens.add({
          targets: glyph, x: 3, angle: 6, alpha: 1,
          duration: theme.motion.impactMs / 4, yoyo: true, repeat: 1, ease: 'Sine.InOut',
          onComplete: () => glyph.setPosition(0, -1).setAngle(0).setAlpha(1),
        });
      }
      view.hp = monster.hp;
      // 当前速度在逻辑步内恒定，回退不足一步的路程即得到相邻逻辑位置之间的插值。
      // 先插值路径进度再换算坐标，转弯时仍沿道路行进，不会斜穿拐角。
      // 新怪物的上一逻辑位置可能早于出生点，此时停在路径起点。
      const progress = Math.max(0, monster.segmentIndex + monster.segmentProgress - definition.speed * renderDelayMs / 1000);
      const point = this.grid.toPixel(this.map.position({
        ...monster, segmentIndex: Math.floor(progress), segmentProgress: progress % 1,
      }));
      view.root.setPosition(point.x, point.y);
      view.bar.setDisplaySize(28 * monster.hp / definition.hp, 3);
    }
  }
}
