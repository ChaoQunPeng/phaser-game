import Phaser from 'phaser';
import brushFontUrl from '../assets/battle-brush.woff2?url';
import { GameHeader } from '../ui/GameHeader.js';
import { PaperButton } from '../ui/PaperButton.js';
import { battleTheme as theme, drawPaper, paperPanel, textStyle } from '../ui/theme.js';

/** 进入战场前展示标题与玩法说明，点击开始后才创建战斗。 */
export class StartScene extends Phaser.Scene {
  constructor() { super('WordDefenseStart'); }

  /** 标题首次显示前加载本地毛笔字体。 */
  preload(): void { this.load.font(theme.fonts.brush, brushFontUrl, 'woff2'); }

  /** 纸面开始页沿用战斗主题，开始按钮直接进入倒计时并自动迎敌。 */
  create(): void {
    this.syncRenderCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.syncRenderCamera, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.syncRenderCamera, this);
    });
    drawPaper(this);
    new GameHeader(this);
    const { colors } = theme;
    this.add.text(240, 193, '落字成兵', textStyle(40, colors.ally, true)).setOrigin(0.5);
    this.add.text(240, 245, '以弓枪刀骑，守一纸城池。', textStyle(16, colors.muted)).setOrigin(0.5);
    const panel = this.add.graphics();
    paperPanel(panel, 36, 304, 408, 214);
    this.add.text(60, 325, '布阵须知', textStyle(22, colors.ink, true));
    this.add.text(60, 374, '一  选择兵种，在路径旁的空地落子。\n\n二  入场倒计时三秒，随后敌军出现。\n\n三  守住三波敌军，护住城防。', textStyle(15, colors.ink));
    new PaperButton(this, 60, 565, 360, 56, '开始布阵', () => {
      this.scene.start('WordDefenseBattle');
    }, true);
    this.add.text(240, 652, '演练模式 · 自由部署 · 随时休整', textStyle(13, colors.muted)).setOrigin(0.5);
    this.add.text(240, 746, 'P1 演练 · 数值与战斗策略均为临时配置', textStyle(11, colors.muted)).setOrigin(0.5);
  }

  /** 开始页与战斗页使用相同的逻辑画布，窗口变化只调整相机倍率。 */
  private syncRenderCamera(): void {
    this.cameras.main.setZoom(this.scale.gameSize.width / theme.layout.width)
      .centerOn(theme.layout.width / 2, theme.layout.height / 2);
  }
}
