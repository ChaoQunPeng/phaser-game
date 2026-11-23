import './page.css';
import Phaser from 'phaser';
import type { GameDefinition } from '../../app/types';
import { StartScene } from './renderer/StartScene';
import { BattleScene } from './renderer/BattleScene';
import { battleTheme } from './ui/theme';

/** 独立游戏页面入口，自行管理纸面布局和移动竖屏画布。 */
export const wordDefenseGame: GameDefinition = {
  id: 'word-defense',
  title: '文字合成塔防',
  description: 'P1 战斗原型：免费部署弓、枪、刀、骑，守住三个测试波次。数值与未定策略均为临时测试规则。',
  create(parent) {
    // 游戏自行创建完整页面，根路由只提供挂载出口。
    const page = document.createElement('div');
    page.className = 'word-defense-page';
    const canvasHost = document.createElement('div');
    canvasHost.className = 'word-defense-canvas';
    page.append(canvasHost);
    parent.append(page);
    // CSS 尺寸决定显示大小，实际画布按设备像素密度渲染，避免手机高清屏放大低分辨率画面。
    const renderSize = () => ({
      width: Math.round(canvasHost.clientWidth * window.devicePixelRatio),
      height: Math.round(canvasHost.clientWidth * battleTheme.layout.height / battleTheme.layout.width * window.devicePixelRatio),
    });
    const size = renderSize();
    const game = new Phaser.Game({
      type: Phaser.AUTO, parent: canvasHost, width: size.width, height: size.height,
      backgroundColor: battleTheme.colors.paper,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [StartScene, BattleScene],
    });
    // 旋转手机或调整窗口时同步像素尺寸；退出游戏时释放页面观察器。
    const observer = new ResizeObserver(() => {
      const nextSize = renderSize();
      game.scale.setGameSize(nextSize.width, nextSize.height);
    });
    game.events.once(Phaser.Core.Events.READY, () => observer.observe(canvasHost));
    game.events.once(Phaser.Core.Events.DESTROY, () => observer.disconnect());
    return game;
  },
};
