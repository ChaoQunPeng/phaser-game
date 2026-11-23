import './page.css';
import Phaser from 'phaser';
import type { GameDefinition } from '../../app/types';
import { StarterScene } from './scenes/StarterScene';

/** 基础示例的独立配置；后续小游戏可以复用该目录结构。 */
export const starterGame: GameDefinition = {
  id: 'starter',
  title: '基础示例',
  description: '点击画面移动方块，体验 Phaser 场景、输入和动画。',
  create(parent) {
    // 游戏自行创建完整页面，根路由只提供挂载出口。
    const page = document.createElement('div');
    page.className = 'starter-page';
    const canvasHost = document.createElement('div');
    canvasHost.className = 'starter-canvas';
    page.append(canvasHost);
    parent.append(page);
    return new Phaser.Game({
      type: Phaser.AUTO,
      parent: canvasHost,
      width: 960,
      height: 540,
      backgroundColor: '#101a2b',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [StarterScene],
    });
  },
};
