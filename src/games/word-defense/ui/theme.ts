import Phaser from 'phaser';

/** 战斗主界面的唯一视觉主题：颜色、字体、布局和动效不进入游戏规则层。 */
export const battleTheme = {
  colors: {
    paper: 0xf4eddd, panel: 0xfaf5e9, board: 0xe8dfcb, tile: 0xeee6d5,
    path: 0xd7c8ad, ink: 0x393b32, muted: 0x837b69, line: 0x9a9079,
    ally: 0x39695b, allyLight: 0xdce6d4, enemy: 0xb44f3f, enemyLight: 0xf1d7c8,
    wall: 0xc8bea9, wallLight: 0xd9d0bd, wallDark: 0xada38e,
    gold: 0xb18b47, shadow: 0x756b55, white: 0xfffcf3,
  },
  fonts: { brush: 'BattleBrush', body: '"PingFang SC", "Microsoft YaHei", sans-serif' },
  fontSizes: { title: 44, heading: 22, body: 16, small: 13, unit: 34, enemy: 29 },
  layout: {
    width: 480, height: 784, margin: 24, gap: 12,
    // 棋盘左右仅留 12px，外框再向外延伸 5px，优先把宽度用于格子。
    board: { x: 12, y: 54, size: 57 },
    buttonHeight: 44, panelRadius: 4, pieceRadius: 22, enemyRadius: 19,
    // 36px 毛笔字配 48px 方卡，四周仅保留必要留白。
    cards: { x: 12, y: 574, width: 48, height: 48, gap: 8 },
  },
  motion: { deployMs: 180, attackMs: 90, impactMs: 100, trailMs: 150, hoverScale: 1.025 },
  states: {
    normal: { fill: 0xfaf5e9, border: 0x9a9079, text: 0x393b32 },
    selected: { fill: 0xdce6d4, border: 0x39695b, text: 0x39695b },
    primary: { fill: 0x39695b, border: 0x294e43, text: 0xfffcf3 },
    disabled: { fill: 0xe6e0d2, border: 0xb7af9c, text: 0x9a9383 },
  },
} as const;

/** Phaser Text 使用 CSS 色值，图形使用数字色值，两者共用同一套色板。 */
export function cssColor(value: number): string { return `#${value.toString(16).padStart(6, '0')}`; }

/** 普通信息用清晰字体，标题和棋子用本地毛笔字体，避免正文可读性下降。 */
export function textStyle(size: number = battleTheme.fontSizes.body, color: number = battleTheme.colors.ink, brush = false): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: brush ? battleTheme.fonts.brush : battleTheme.fonts.body,
    fontSize: `${size}px`, color: cssColor(color), padding: { top: 3, bottom: 3 },
    // 文本纹理也需覆盖高清画布的相机倍率，避免画布清晰而字形纹理仍被放大。
    resolution: Math.max(2, window.devicePixelRatio * window.innerHeight / battleTheme.layout.height) };

}

/** 轻微不规则双线模拟铅笔边缘；坐标固定，重绘时不会抖动。 */
export function paperPanel(graphics: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number,
  fill: number = battleTheme.colors.panel, border: number = battleTheme.colors.line,
  radius: number = battleTheme.layout.panelRadius, shadow = true): void {
  // 兵种卡片使用独立的小圆角和平面样式，其余面板保留默认纸面投影。
  if (shadow) graphics.fillStyle(battleTheme.colors.shadow, 0.12).fillRoundedRect(x + 2, y + 3, width, height, radius);
  graphics.fillStyle(fill).fillRoundedRect(x, y, width, height, radius);
  graphics.lineStyle(1.5, border).strokeRoundedRect(x, y, width, height, radius);
  graphics.lineStyle(0.6, border, 0.25);
  graphics.beginPath().moveTo(x + 9, y + 2).lineTo(x + width - 10, y + 1)
    .moveTo(x + width - 2, y + 12).lineTo(x + width - 1, y + height - 9)
    .moveTo(x + width - 8, y + height - 2).lineTo(x + 11, y + height - 1).strokePath();
}

/** 稀疏纤维纸纹只绘制一次，不使用大图或随机动画干扰战场。 */
export function drawPaper(scene: Phaser.Scene): void {
  const { width, height } = battleTheme.layout;
  const graphics = scene.add.graphics().setDepth(-10);
  graphics.fillStyle(battleTheme.colors.paper).fillRect(0, 0, width, height);
  for (let i = 0; i < 600; i++) {
    const x = (i * 173 + 19) % width;
    const y = (i * 311 + 41) % height;
    graphics.lineStyle(0.6, battleTheme.colors.shadow, 0.05 + (i % 3) * 0.015);
    graphics.lineBetween(x, y, x + 1 + i % 4, y + (i % 2 ? 0.7 : -0.7));
  }
}
