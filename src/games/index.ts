import { starterGame } from './starter';
import type { GameDefinition } from '../app/types';

/** 在此登记新游戏，首页会自动生成入口按钮。 */
export const games: GameDefinition[] = [starterGame];
