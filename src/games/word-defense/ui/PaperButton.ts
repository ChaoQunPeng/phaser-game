import Phaser from 'phaser';
import { battleTheme as theme, paperPanel, textStyle, cssColor } from './theme.js';

/** Phaser 纸卡按钮统一处理选中、禁用和按压反馈；不承担任何业务判断。 */
export class PaperButton {
  readonly root: Phaser.GameObjects.Container;
  private readonly background: Phaser.GameObjects.Graphics;
  private readonly caption: Phaser.GameObjects.Text;
  private selected = false;
  private enabled = true;
  private hovering = false;

  constructor(scene: Phaser.Scene, x: number, y: number, private readonly width: number, private readonly height: number,
    label: string, action: () => void, private readonly primary = false, brush = false,
    private readonly appearance: { radius: number; shadow: boolean } = { radius: theme.layout.panelRadius, shadow: true }) {
    this.background = scene.add.graphics();
    this.caption = scene.add.text(width / 2, height / 2, label, textStyle(brush ? 30 : theme.fontSizes.body, theme.colors.ink, brush)).setOrigin(0.5);
    this.root = scene.add.container(x, y, [this.background, this.caption]);
    // Container 命中检测会补上半宽/半高原点；纸卡内容从左上角绘制，命中框同步补偿。
    this.root.setSize(width, height).setInteractive(new Phaser.Geom.Rectangle(width / 2, height / 2, width, height), Phaser.Geom.Rectangle.Contains);
    this.root.input!.cursor = 'pointer';
    this.root.on('pointerover', () => { this.hovering = true; this.paint(); });
    this.root.on('pointerout', () => { this.hovering = false; this.paint(); });
    this.root.on('pointerdown', () => {
      scene.tweens.add({ targets: this.caption, scale: 0.94, duration: 65, yoyo: true });
      action();
    });
    this.paint();
  }

  /** 属性变化才重绘纸卡，避免 HUD 每帧重复创建图形。 */
  setSelected(value: boolean): void { if (this.selected !== value) { this.selected = value; this.paint(); } }
  /** 真正关闭命中区域，暂停与结算时禁用的按钮不再响应输入。 */
  setEnabled(value: boolean): void {
    if (this.enabled === value) return;
    this.enabled = value; this.root.input!.enabled = value; this.hovering = false; this.paint();
  }
  /** 主按钮状态文案由 HUD 从快照派生。 */
  setLabel(label: string): void { this.caption.setText(label); }

  /** 统一状态色，选中卡用朱砂角标提示，避免依赖颜色识别。 */
  private paint(): void {
    const state = !this.enabled ? theme.states.disabled : this.primary ? theme.states.primary
      : this.selected ? theme.states.selected : theme.states.normal;
    this.background.clear();
    paperPanel(this.background, 0, 0, this.width, this.height, state.fill, state.border, this.appearance.radius, this.appearance.shadow);
    // 悬停描边向内缩进 2px，圆角同步收小以贴合外框。
    if (this.hovering && this.enabled) this.background.lineStyle(2, state.border).strokeRoundedRect(2, 2, this.width - 4, this.height - 4, this.appearance.radius - 2);
    if (this.selected) this.background.fillStyle(theme.colors.enemy).fillCircle(this.width - 10, 10, 3);
    this.caption.setColor(cssColor(state.text));
  }
}
