import Phaser from 'phaser';
import type { BattleConfig, Cell } from '../core/types.js';
import { battleTheme as theme, paperPanel, textStyle } from '../ui/theme.js';

/** 棋盘尺寸和坐标统一取自主题，供输入、棋子和反馈共用。 */
export const board = theme.layout.board;

/** 米色纸面上的规则战棋网格；路径使用沙色连线与方向箭头。 */
export class GridView {
  private readonly openTiles: Phaser.GameObjects.Graphics;
  private openKey = '';
  private readonly selection: Phaser.GameObjects.Graphics;
  private readonly placement: Phaser.GameObjects.Graphics;
  private selectedKey = '';
  constructor(scene: Phaser.Scene, private readonly config: BattleConfig) {
    const graphics = scene.add.graphics();
    const width = config.map.width * board.size;
    const height = config.map.height * board.size;
    paperPanel(graphics, board.x - 5, board.y - 5, width + 10, height + 10, theme.colors.board, theme.colors.ink);
    const paths = Object.values(config.map.paths);
    for (let y = 0; y < config.map.height; y++) {
      for (let x = 0; x < config.map.width; x++) {
        const isPath = paths.some(points => points.some(cell => cell.x === x && cell.y === y));
        graphics.fillStyle(isPath ? theme.colors.path : theme.colors.tile, isPath ? 0.95 : 0.7);
        graphics.fillRect(board.x + x * board.size + 1, board.y + y * board.size + 1, board.size - 2, board.size - 2);
        // 开发模式显示零起点坐标，便于指定开放格，左上角标签避开中心棋子。
        if (import.meta.env.DEV) {
          scene.add.text(board.x + x * board.size + 4, board.y + y * board.size + 2,
            `(${x},${y})`, {
              ...textStyle(10, theme.colors.ink), backgroundColor: '#faf5e9',
              padding: { left: 2, right: 2, top: 1, bottom: 1 },
            }).setAlpha(0.85).setDepth(8);
        }
      }
    }
    // 保持网格严格对齐，细小副线只提供纸笔触感，不改变部署格子。
    graphics.lineStyle(1, theme.colors.line, 0.55);
    for (let i = 0; i <= config.map.width; i++) graphics.lineBetween(board.x + i * board.size, board.y, board.x + i * board.size, board.y + height);
    for (let i = 0; i <= config.map.height; i++) graphics.lineBetween(board.x, board.y + i * board.size, board.x + width, board.y + i * board.size);
    for (const path of paths) {
      graphics.lineStyle(1.5, theme.colors.muted, 0.24);
      for (let index = 1; index < path.length; index++) {
        const from = this.toPixel(path[index - 1]); const to = this.toPixel(path[index]);
        graphics.lineBetween(from.x, from.y, to.x, to.y);
        if (index % 3 === 0 && index < path.length - 1) {
          const dx = Math.sign(to.x - from.x); const dy = Math.sign(to.y - from.y);
          graphics.lineStyle(2, theme.colors.muted, 0.4);
          graphics.lineBetween(to.x - dx * 4 - dy * 4, to.y - dy * 4 + dx * 4, to.x + dx * 2, to.y + dy * 2);
          graphics.lineBetween(to.x - dx * 4 + dy * 4, to.y - dy * 4 - dx * 4, to.x + dx * 2, to.y + dy * 2);
          graphics.lineStyle(1.5, theme.colors.muted, 0.24);
        }
      }
      for (const [index, label] of [[0, '入'], [path.length - 1, '守']] as const) {
        const point = this.toPixel(path[index]);
        graphics.fillStyle(theme.colors.panel, 0.8).fillCircle(point.x, point.y, 19);
        scene.add.text(point.x, point.y, label, textStyle(27, theme.colors.muted, true)).setOrigin(0.5);
      }
    }
    this.openTiles = scene.add.graphics().setDepth(1);
    this.placement = scene.add.graphics().setDepth(2);
    this.selection = scene.add.graphics().setDepth(3);
  }

  /** 连续格子坐标转画布像素，同时用于移动怪物与攻击反馈。 */
  toPixel(cell: Cell): Cell { return { x: board.x + (cell.x + 0.5) * board.size, y: board.y + (cell.y + 0.5) * board.size }; }
  /** 画布指针转格子，像素尺寸变化不会进入业务命令。 */
  toCell(x: number, y: number): Cell { return { x: Math.floor((x - board.x) / board.size), y: Math.floor((y - board.y) / board.size) }; }

  /** 可部署地使用米白色，未开荒地用深灰褐墙块表现，路径保持原有沙色。 */
  syncOpenCells(cells: readonly Cell[]): void {
    const key = cells.map(cell => `${cell.x},${cell.y}`).join(';');
    if (key === this.openKey) return;
    this.openKey = key;
    const graphics = this.openTiles.clear();
    const paths = Object.values(this.config.map.paths);
    for (let row = 0; row < this.config.map.height; row++) {
      for (let col = 0; col < this.config.map.width; col++) {
        if (paths.some(path => path.some(cell => cell.x === col && cell.y === row))) continue;
        const open = cells.some(cell => cell.x === col && cell.y === row);
        // 每侧只留 0.5px，格子之间保持 1px 细缝，减少墙块分离感。
        const x = board.x + col * board.size + 0.5;
        const y = board.y + row * board.size + 0.5;
        const side = board.size - 1;
        graphics.fillStyle(open ? theme.colors.panel : theme.colors.wall)
          .fillRect(x, y, side, side);
        if (open) continue;
        // 仅用明暗边缘表现实心墙块，不绘制条纹；开垦后整格恢复米白色。
        graphics.lineStyle(1, theme.colors.wallLight)
          .lineBetween(x + 1, y + side - 1, x + 1, y + 1)
          .lineBetween(x + 1, y + 1, x + side - 1, y + 1);
        graphics.lineStyle(1, theme.colors.wallDark)
          .lineBetween(x + side - 1, y + 1, x + side - 1, y + side - 1)
          .lineBetween(x + side - 1, y + side - 1, x + 1, y + side - 1);
      }
    }
  }

  /** 只高亮当前可落子的格子，清除时不影响已有棋子的选中标记。 */
  previewPlacement(cell?: Cell): void {
    this.placement.clear();
    if (!cell) return;
    this.placement.fillStyle(theme.colors.ally, 0.22)
      .fillRect(board.x + cell.x * board.size + 1, board.y + cell.y * board.size + 1, board.size - 2, board.size - 2);
    this.placement.lineStyle(2, theme.colors.ally)
      .strokeRect(board.x + cell.x * board.size + 2, board.y + cell.y * board.size + 2, board.size - 4, board.size - 4);
  }

  /** 只在选择变化时绘制四角墨线，不遮挡棋子主体。 */
  select(cell?: Cell): void {
    const key = cell ? `${cell.x},${cell.y}` : '';
    if (key === this.selectedKey) return;
    this.selectedKey = key; this.selection.clear();
    if (!cell) return;
    const x = board.x + cell.x * board.size + 3; const y = board.y + cell.y * board.size + 3;
    const side = board.size - 6;
    this.selection.lineStyle(2.5, theme.colors.ally);
    for (const [dx, dy, sx, sy] of [[0, 0, 1, 1], [side, 0, -1, 1], [0, side, 1, -1], [side, side, -1, -1]]) {
      this.selection.lineBetween(x + dx, y + dy, x + dx + sx * 9, y + dy);
      this.selection.lineBetween(x + dx, y + dy, x + dx, y + dy + sy * 9);
    }
  }
}
