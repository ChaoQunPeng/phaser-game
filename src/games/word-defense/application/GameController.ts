import { GameWorld } from '../core/GameWorld.js';
import type { BattleConfig, CommandResult, GameCommand, GameEvent, GameSnapshot } from '../core/types.js';

/** 应用入口隔离 Scene 与世界；未来其他渲染端可直接复用。 */
export class GameController {
  private readonly world: GameWorld;
  constructor(config: BattleConfig) { this.world = new GameWorld(config); }
  /** 将渲染帧时间交给独立的固定时钟。 */
  update(deltaMs: number): void { this.world.update(deltaMs); }
  /** 玩家命令统一进入世界，不向视图暴露可变状态。 */
  dispatch(command: GameCommand): CommandResult { return this.world.dispatch(command); }
  /** 主按钮按状态执行开始、暂停或恢复；终局只允许重开。 */
  toggle(): void {
    switch (this.world.getSnapshot().status) {
      case 'ready': this.world.start(); break;
      case 'playing': this.world.pause(); break;
      case 'paused': this.world.resume(); break;
    }
  }
  /** 切回标签页后保持暂停，避免玩家离开期间战斗继续。 */
  pause(): void { this.world.pause(); }
  /** 游戏内重开不需要销毁整个 Phaser 实例。 */
  restart(): void { this.world.restart(); }
  /** 提供视图快照与一次性反馈事件。 */
  getSnapshot(): GameSnapshot { return this.world.getSnapshot(); }
  /** 将固定时钟的渲染延迟传给视图，暂停期间保持原有显示位置。 */
  getMonsterRenderDelayMs(): number { return this.world.getMonsterRenderDelayMs(); }
  drainEvents(): GameEvent[] { return this.world.drainEvents(); }
}
