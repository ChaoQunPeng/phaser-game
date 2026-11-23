import { wordDefenseGame } from './word-defense';
import { starterGame } from './starter';
import type { GameDefinition } from '../app/types';

/** 在此登记新游戏，首页会自动生成独立页面的入口链接。 */
export const games: GameDefinition[] = [wordDefenseGame, starterGame];
