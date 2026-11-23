import type Phaser from 'phaser';

/** 小游戏注册契约：根路由负责挂载和销毁，每个游戏拥有完整页面、布局和场景。 */
export interface GameDefinition {
  id: string;
  title: string;
  description: string;
  create: (parent: HTMLElement) => Phaser.Game;
}
