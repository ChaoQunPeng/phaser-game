import Phaser from 'phaser';

/** 无需外部素材的起始场景，演示点击交互和补间动画。 */
export class StarterScene extends Phaser.Scene {
  constructor() {
    super('StarterScene');
  }

  /** 场景启动时创建画面，并绑定该场景的点击行为。 */
  create(): void {
    this.add.text(40, 36, 'PHASER GAMES', { fontSize: '32px', color: '#e5edf9' });
    this.add.text(40, 84, '点击画面，让方块移动到目标位置', { fontSize: '20px', color: '#a7b7d0' });
    const player = this.add.rectangle(480, 290, 48, 48, 0x55d6be);

    // 连续点击时替换之前的移动动画，保证方块始终朝最新目标移动。
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.tweens.killTweensOf(player);
      this.tweens.add({ targets: player, x: pointer.worldX, y: pointer.worldY, duration: 450, ease: 'Sine.easeOut' });
    });
  }
}
