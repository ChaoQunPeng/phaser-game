import './style.css';
import type Phaser from 'phaser';
import { games } from '../games';
import type { GameDefinition } from './types';

const app = document.querySelector<HTMLDivElement>('#app')!;
// 悬浮导航独立于游戏画布，切换游戏时保持入口可用。
app.innerHTML = `<aside class="game-sidebar" aria-labelledby="game-list-title"><span class="eyebrow">GAME LIBRARY</span><h2 id="game-list-title">游戏列表</h2><nav id="games" aria-label="选择游戏"></nav></aside><main><header><span class="eyebrow">MY GAME COLLECTION</span><h1>小游戏合集</h1><p>每个想法，从这里开始。</p></header><section class="toolbar"><h2 id="title"></h2><button id="restart" type="button">重新开始</button></section><p id="description"></p><div id="game" aria-label="游戏画面"></div></main>`;
const navigation = document.querySelector<HTMLElement>('#games')!;
const parent = document.querySelector<HTMLDivElement>('#game')!;
const title = document.querySelector<HTMLElement>('#title')!;
const description = document.querySelector<HTMLElement>('#description')!;
let activeGame: Phaser.Game;
let activeDefinition: GameDefinition;

/** 等 Phaser 完成销毁后再创建实例，避免快速切换时旧实例清除新画布。 */
function startGame(definition: GameDefinition): void {
  activeDefinition = definition;
  title.textContent = definition.title;
  description.textContent = definition.description;
  for (const button of navigation.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.game === definition.id));
  }
  activeGame = definition.create(parent);
  activeGame.events.once('destroy', () => {
    // Phaser 在下一帧销毁；微任务让旧实例完成资源清理后再启动新实例。
    queueMicrotask(() => startGame(activeDefinition));
  });
}

/** 切换只更新目标并请求销毁，连续点击会以最后选择的游戏为准。 */
function selectGame(definition: GameDefinition): void {
  activeDefinition = definition;
  activeGame.destroy(true);
}

for (const definition of games) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.game = definition.id;
  button.textContent = definition.title;
  button.addEventListener('click', () => selectGame(definition));
  navigation.append(button);
}

document.querySelector<HTMLButtonElement>('#restart')!.addEventListener('click', () => selectGame(activeDefinition));
startGame(games[0]);
