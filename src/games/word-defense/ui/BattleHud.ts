import Phaser from 'phaser';
import type { BattleConfig, GameSnapshot } from '../core/types.js';
import { battleTheme as theme, paperPanel, textStyle, cssColor } from './theme.js';
import { PaperButton } from './PaperButton.js';
import { unitCaption, unitGlyphColor, unitGlyphSize } from './unitAppearance.js';

/** 纸面战棋主界面：上方军情、中间战场、下方布阵，交互仍转交控制器。 */
export class BattleHud {
  private readonly gold: Phaser.GameObjects.Text;
  private readonly refreshButton: PaperButton;
  private readonly hp: Phaser.GameObjects.Text;
  private readonly hpBar: Phaser.GameObjects.Rectangle;
  private readonly wave: Phaser.GameObjects.Text;
  private readonly progress: Phaser.GameObjects.Text;
  private readonly toggleButton: PaperButton;
  private readonly menuButton: PaperButton;
  private readonly choices = new Map<number, PaperButton>();
  private readonly choiceGlyphs: Phaser.GameObjects.Text[] = [];
  private readonly choiceLevels: Phaser.GameObjects.Text[] = [];
  private readonly overlay: Phaser.GameObjects.Container;
  private readonly result: Phaser.GameObjects.Text;
  private readonly resultHint: Phaser.GameObjects.Text;
  private readonly countdown: Phaser.GameObjects.Container;
  private readonly countdownNumber: Phaser.GameObjects.Text;
  private dragging = false;
  private mergeSlot?: number;
  private readonly displayedLevels = new Map<number, number>();
  private readonly displayedKinds = new Map<number, string>();
  private clearPlacementPreview: () => void = () => {};

  constructor(private readonly scene: Phaser.Scene, private readonly config: BattleConfig,
    callbacks: { toggle: () => void; restart: () => void; choose: (slotIndex: number) => void; refresh: () => void;
      drop: (slotIndex: number, x: number, y: number) => void;
      hover: (x: number, y: number) => void; clearHover: () => void }) {
    const { colors, layout } = theme;
    this.clearPlacementPreview = callbacks.clearHover;
    const panels = scene.add.graphics();
    // 轻点仍可选择，移动超过阈值才开始拖动，避免触屏轻微抖动误触。
    scene.input.dragDistanceThreshold = 8;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clearDragPreview());
    this.hp = scene.add.text(12, 4, '', textStyle(18, colors.ink));
    scene.add.rectangle(13, 37, 104, 4, colors.shadow, 0.16).setOrigin(0, 0.5);
    this.hpBar = scene.add.rectangle(13, 37, 104, 4, colors.ally).setOrigin(0, 0.5);
    this.wave = scene.add.text(468, 4, '', textStyle(18, colors.ink)).setOrigin(1, 0);
    this.progress = scene.add.text(468, 29, '', textStyle(12, colors.muted)).setOrigin(1, 0);
    // 菜单放在顶部军情之间，复用现有高度；打开菜单即暂停战斗。
    this.menuButton = new PaperButton(scene, 198, 7, 84, 36, '菜单', callbacks.toggle);

    // 金币和刷新状态读取同一份世界快照，UI 不自行扣费。
    this.gold = scene.add.text(12, 532, '', textStyle(18, colors.gold));
    this.refreshButton = new PaperButton(scene, 360, 523, 108, 36, `刷新 · ${config.refreshCost}金`, callbacks.refresh);
    // 面板按实际槽数计算宽度，包含卡片间隔与两侧留白，拖回区域共用此尺寸。
    const pool = this.summonPoolBounds();
    paperPanel(panels, pool.x, pool.y, pool.width, pool.height, colors.panel, colors.line);
    Array.from({ length: config.summonPoolSize }, (_, index) => index).forEach(index => {
      const { cards } = layout;
      const x = cards.x + index * (cards.width + cards.gap);
      // 常规兵种卡只展示居中的毛笔字，使用 2px 圆角且不绘制阴影。
      const button = new PaperButton(scene, x, cards.y, cards.width, cards.height, '',
        () => callbacks.choose(index), false, false, { radius: 2, shadow: false });
      const glyph = scene.add.text(cards.width / 2, cards.height / 2, '',
        textStyle(36, colors.ally, true)).setOrigin(0.5);
      button.root.add(glyph);
      this.choiceGlyphs.push(glyph);
      // 回池单位展示原有等级。
      const levelLabel = scene.add.text(cards.width / 2, cards.height - 6, '', textStyle(10, colors.ally)).setOrigin(0.5);
      button.root.add(levelLabel);
      this.choiceLevels.push(levelLabel);
      // 拖动仅反馈目标格，不再创建跟随指针的文字副本。
      scene.input.setDraggable(button.root);
      button.root.on('dragstart', () => { this.dragging = true; });
      button.root.on('drag', (pointer: Phaser.Input.Pointer) => {
        if (!this.dragging) return;
        const point = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
        callbacks.hover(point.x, point.y);
      });
      button.root.on('dragend', (pointer: Phaser.Input.Pointer) => {
        if (!this.dragging) return;
        this.clearDragPreview();
        const point = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
        callbacks.drop(index, point.x, point.y);
      });
      this.choices.set(index, button);
    });

    // 在池下展示本期英雄名单和拼字规则，玩家可直接辨认单字材料的用途。
    scene.add.text(12, 644, '英杰  赵云 · 张飞 · 关羽 · 马超 · 黄忠', textStyle(13, colors.gold));
    scene.add.text(12, 668, '神话  孙悟空 · 二郎神', textStyle(13, colors.enemy));
    scene.add.text(12, 696, '拖动拼齐姓名才生效，未集齐的名字不攻击', textStyle(12, colors.muted));

    // 倒计时不拦截输入，玩家在敌军出现前仍可选择兵种并落子。
    // 深墨色投影加大偏移，突出倒计时毛笔字与棋盘背景的层次。
    this.countdownNumber = scene.add.text(240, 259, '', textStyle(52, colors.ally, true))
      .setOrigin(0.5).setShadow(5, 6, cssColor(colors.ink), 8, true, true);
    const countdownHint = scene.add.text(240, 333, '敌军将至 · 即刻布阵', textStyle(15, colors.ink)).setOrigin(0.5);
    this.countdown = scene.add.container(0, 0, [this.countdownNumber, countdownHint])
      .setDepth(15).setVisible(false);

    // 全屏模态遮罩阻止操作底层棋盘与布阵卡，暂停及结算共用此弹窗。
    const veil = scene.add.rectangle(240, layout.height / 2, layout.width, layout.height, colors.ink, 0.4).setInteractive();
    const sheet = scene.add.graphics();
    paperPanel(sheet, 54, 220, 372, 330, colors.panel, colors.ink);
    sheet.lineStyle(1, colors.line, 0.4).lineBetween(90, 300, 390, 300);
    this.result = scene.add.text(240, 263, '', textStyle(40, colors.ally, true)).setOrigin(0.5);
    this.resultHint = scene.add.text(240, 344, '', { ...textStyle(15, colors.ink), align: 'center', lineSpacing: 8 }).setOrigin(0.5);
    this.toggleButton = new PaperButton(scene, 90, 406, 300, layout.buttonHeight, '继续战斗', callbacks.toggle, true);
    const restartButton = new PaperButton(scene, 90, 470, 300, layout.buttonHeight, '重开', callbacks.restart);
    this.overlay = scene.add.container(0, 0, [veil, sheet, this.result, this.resultHint,
      this.toggleButton.root, restartButton.root]).setDepth(20).setVisible(false);
  }

  /** 暂停、结算和退出时取消拖动，召唤池仍由成功部署命令决定是否消耗。 */
  private clearDragPreview(): void {
    this.dragging = false;
    this.clearPlacementPreview();
  }

  /** 模态打开期间禁止场景级指针事件落到棋盘，包括点击重开的当前帧。 */
  isModalOpen(): boolean { return this.overlay.visible; }

  /** 回池拖放覆盖整个召唤池面板，边界取自实际绘制的面板布局。 */
  containsSummonPool(x: number, y: number): boolean {
    const pool = this.summonPoolBounds();
    return x >= pool.x && x <= pool.x + pool.width && y >= pool.y && y <= pool.y + pool.height;
  }

  /** N 张卡片只有 N-1 个间隔，两侧各加 6px，上下各加 7px 留白。 */
  private summonPoolBounds(): { x: number; y: number; width: number; height: number } {
    const { cards } = theme.layout;
    return { x: cards.x - 6, y: cards.y - 7,
      width: this.config.summonPoolSize * cards.width + (this.config.summonPoolSize - 1) * cards.gap + 12,
      height: cards.height + 14 };
  }

  /** 根据固定卡位布局查找拖放目标，卡片间隙不算作合并目标。 */
  summonSlotAt(x: number, y: number): number | undefined {
    const { cards } = theme.layout;
    const index = Math.floor((x - cards.x) / (cards.width + cards.gap));
    const offset = x - cards.x - index * (cards.width + cards.gap);
    if (index >= 0 && index < this.config.summonPoolSize && offset >= 0 && offset < cards.width && y >= cards.y && y < cards.y + cards.height) return index;
    return undefined;
  }

  /** 合法池内合并目标复用卡片描边高亮。 */
  previewMerge(slotIndex?: number): void { this.mergeSlot = slotIndex; }


  /** 所有可操作状态从快照派生，不在 UI 中修改生命、波次或单位。 */
  sync(state: GameSnapshot, selectedSlot: number | undefined): void {
    const active = state.status === 'ready' || state.status === 'playing';
    const finished = state.status === 'victory' || state.status === 'defeat';
    if (!active) { this.clearDragPreview(); this.mergeSlot = undefined; }
    this.gold.setText(`金币 ${state.gold}`);
    this.refreshButton.setLabel(`刷新 · ${state.refreshCost}金`);
    this.refreshButton.setEnabled(active && state.gold >= state.refreshCost);
    // 与刷怪共用模拟时钟，暂停时隐藏数字，恢复后接着倒数，避免画面与出怪不同步。
    this.countdown.setVisible(state.status === 'playing' && state.preparationRemainingMs > 0);
    // 倒计时使用本地毛笔字形，与标题及棋子的古风视觉保持一致。
    this.countdownNumber.setText(['', '一', '二', '三'][Math.ceil(state.preparationRemainingMs / 1000)]);
    this.hp.setText(`城防  ${state.hp} / ${this.config.initialHp}`);
    this.hpBar.setDisplaySize(104 * state.hp / this.config.initialHp, 4);
    this.wave.setText(`第 ${state.wave} / ${this.config.waves.length} 波`);
    const status = { ready: '落子布阵，准备出征', playing: `敌军 ${state.monsters.length} 名`, paused: '休整中', victory: '演练完成', defeat: '城防已破' };
    this.progress.setText(state.status === 'playing' && state.preparationRemainingMs > 0
      ? `敌军将至 · ${Math.ceil(state.preparationRemainingMs / 1000)}秒` : status[state.status]);
    this.toggleButton.setLabel({ ready: '出征 · 开始战斗', playing: '休整 · 暂停', paused: '继续战斗', victory: '演练完成', defeat: '城防失守' }[state.status]);
    this.toggleButton.setEnabled(!finished);
    this.menuButton.setEnabled(state.status === 'playing');
    // 空槽始终隐藏；拖入整个召唤池即可回池，不额外展示放回按钮。
    for (const [index, button] of this.choices) {
      const entry = state.summonPool[index];
      const kind = entry && typeof entry === 'object' ? entry.definitionId : entry;
      const available = entry !== null;
      const definition = kind && kind !== 'hoe' ? this.config.units[kind] : undefined;
      // 锄头与兵种统一使用相同毛笔字体和字号，所需字形随本地字体一并提供。
      this.choiceGlyphs[index].setText(kind === 'hoe' ? '锄' : kind ? this.config.units[kind].label : '')
        .setFontFamily(theme.fonts.brush).setFontSize(definition ? unitGlyphSize(definition, 36) : 36)
        .setColor(cssColor(definition ? unitGlyphColor(definition) : theme.colors.ally));
      const level = entry && typeof entry === 'object' ? entry.level : 1;
      // 单字与中间名字也标记待合成，完整英雄则展示英杰/神话及等级。
      this.choiceLevels[index].setText(definition && (definition.category || typeof entry === 'object') ? unitCaption(definition, level) : '');
      const previousLevel = this.displayedLevels.get(index);
      const previousKind = this.displayedKinds.get(index);
      if (available && previousLevel !== undefined && (level > previousLevel || kind !== previousKind)) {
        // 池内合并也提供升级反馈，动画只作用于文字，卡片命中框保持不变。
        this.scene.tweens.killTweensOf(this.choiceGlyphs[index]);
        this.choiceGlyphs[index].setScale(1);
        this.scene.tweens.add({ targets: this.choiceGlyphs[index], scale: 1.15,
          duration: theme.motion.deployMs, yoyo: true });
      }
      if (available) { this.displayedLevels.set(index, level); this.displayedKinds.set(index, kind!); }
      else { this.displayedLevels.delete(index); this.displayedKinds.delete(index); }
      button.root.setVisible(available);
      button.setSelected(index === selectedSlot || index === this.mergeSlot);
      button.setEnabled(active && available);
    }
    this.overlay.setVisible(state.status === 'paused' || finished);
    this.result.setText(state.status === 'paused' ? '休整' : state.status === 'victory' ? '捷报' : '失守');
    this.result.setColor(cssColor(state.status === 'defeat' ? theme.colors.enemy : theme.colors.ally));
    this.resultHint.setText(state.status === 'paused' ? '落子暂歇，静待军令。\n点击「继续战斗」'
      : state.status === 'victory' ? `守住了 ${this.config.waves.length} 波敌军\n点击「重开」再演练一局` : '胜败乃兵家常事\n点击「重开」重新布阵');
  }
}
