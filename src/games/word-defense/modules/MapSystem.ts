import type { BattleConfig, Cell, DefenderState, MonsterState } from '../core/types.js';

/** 只处理格子、配置路径和部署合法性，逻辑坐标不包含像素。 */
export class MapSystem {
  constructor(private readonly map: BattleConfig['map']) {
    // 路径是设计输入；错误配置直接报错，避免怪物沿断路或越界移动。
    for (const path of Object.values(map.paths)) {
      if (path.length < 2) throw new Error('路径至少需要两个格子');
      path.forEach((cell, index) => {
        if (!this.contains(cell)) throw new Error('路径超出地图');
        if (index > 0) {
          const previous = path[index - 1];
          if (Math.abs(cell.x - previous.x) + Math.abs(cell.y - previous.y) !== 1) {
            throw new Error('路径必须正交连续');
          }
        }
      });
    }
  }

  /** 指针转换后的部署位置必须是地图内的完整格子。 */
  contains(cell: Cell): boolean {
    return Number.isInteger(cell.x) && Number.isInteger(cell.y)
      && cell.x >= 0 && cell.y >= 0 && cell.x < this.map.width && cell.y < this.map.height;
  }

  /** 路径格属于怪物通道，P1 临时部署策略禁止在通道上放置单位。 */
  isPath(cell: Cell): boolean {
    return Object.values(this.map.paths).some(path => path.some(point => point.x === cell.x && point.y === cell.y));
  }

  /** 提供可直接显示给玩家的失败原因；失败时不修改任何状态。 */
  deploymentError(cell: Cell, defenders: readonly DefenderState[]): string | undefined {
    if (!this.contains(cell)) return '请选择地图内的格子';
    if (this.isPath(cell)) return '路径格不能部署';
    if (defenders.some(unit => unit.cell.x === cell.x && unit.cell.y === cell.y)) return '该格已有单位';
    return undefined;
  }

  /** 召唤与开垦共用落点规则，供核心命令和拖动高亮复用。 */
  placementError(cell: Cell, defenders: readonly DefenderState[], openCells: readonly Cell[], hoe: boolean): string | undefined {
    const reason = this.deploymentError(cell, defenders);
    if (reason) return reason;
    const open = openCells.some(point => point.x === cell.x && point.y === cell.y);
    if (hoe && open) return '该格已开垦';
    if (!hoe && !open) return '请先使用锄头开垦';
    return undefined;
  }

  /** 将怪物的分段进度换成连续格子坐标，供战斗与视图共享。 */
  position(monster: Readonly<MonsterState>): Cell {
    const path = this.map.paths[monster.pathId];
    const from = path[monster.segmentIndex];
    const to = path[Math.min(monster.segmentIndex + 1, path.length - 1)];
    return { x: from.x + (to.x - from.x) * monster.segmentProgress, y: from.y + (to.y - from.y) * monster.segmentProgress };
  }
}
