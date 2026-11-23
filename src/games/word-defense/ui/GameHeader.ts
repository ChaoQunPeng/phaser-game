import Phaser from 'phaser';
import { battleTheme as theme, textStyle } from './theme.js';

/** 开始页标题组件：保留毛笔题字、副标题和朱印，可整体定位与复用。 */
export class GameHeader {
  readonly root: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, x = 0, y = 0) {
    const { colors, fontSizes } = theme;
    const title = scene.add.text(24, 19, '文字守城', textStyle(fontSizes.title, colors.ink, true));
    const subtitle = scene.add.text(27, 72, '一纸战场，落字成兵。', textStyle(fontSizes.small, colors.muted));
    const lines = scene.add.graphics();
    // 朱印与分隔线共同保留原有纸面标题的视觉识别。
    lines.lineStyle(1.5, colors.enemy).strokeRoundedRect(408, 26, 44, 44, 3);
    lines.lineStyle(1, colors.line, 0.65).lineBetween(24, 103, 456, 103);
    const seal = scene.add.text(430, 48, '演', textStyle(29, colors.enemy, true)).setOrigin(0.5).setAngle(-6);
    this.root = scene.add.container(x, y, [title, subtitle, lines, seal]);
  }
}
