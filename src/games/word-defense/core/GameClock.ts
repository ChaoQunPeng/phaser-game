/** 固定步长时钟；恢复标签页时丢弃超额时间，避免一次补算整场战斗。 */
export class GameClock {
  private accumulatedMs = 0;
  constructor(private readonly stepMs: number, private readonly maxSteps: number) {}

  /** 累加渲染帧时间，回调返回 false 时立即停止（例如本步已经结束游戏）。 */
  advance(deltaMs: number, step: (deltaMs: number) => boolean): void {
    this.accumulatedMs = Math.min(this.accumulatedMs + deltaMs, this.stepMs * this.maxSteps);
    while (this.accumulatedMs >= this.stepMs) {
      this.accumulatedMs -= this.stepMs;
      if (!step(this.stepMs)) {
        this.reset();
        break;
      }
    }
  }

  /** 重开或终局时清除余量，不让前一局时间影响新阶段。 */
  reset(): void { this.accumulatedMs = 0; }

  /** 渲染使用未满一个逻辑步的余量，在相邻逻辑位置之间插值。 */
  getRemainderMs(): number { return this.accumulatedMs; }
}
