import Phaser from 'phaser';
import type { GameDefinition } from '../../app/types';
import { StarterScene } from './scenes/StarterScene';

/** 基础示例的独立配置；后续小游戏可以复用该目录结构。 */
export const starterGame: GameDefinition = {
  id: 'starter',
  title: '基础示例',
  description: '点击画面移动方块，体验 Phaser 场景、输入和动画。',
  create(parent) {
    return new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: 960,
      height: 540,
      backgroundColor: '#101a2b',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [StarterScene],
    });
  },
};
