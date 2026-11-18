import type Phaser from 'phaser';

/** 小游戏注册契约：入口统一负责启动和销毁，每个游戏维护自己的场景。 */
export interface GameDefinition {
  id: string;
  title: string;
  description: string;
  create: (parent: HTMLElement) => Phaser.Game;
}
