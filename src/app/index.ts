import './style.css';
import type Phaser from 'phaser';
import { games } from '../games';

const app = document.querySelector<HTMLDivElement>('#app')!;
// 根布局只保留固定导航和路由出口，具体页面交给对应游戏创建。
app.innerHTML = '<nav class="app-navigation" tabindex="0" aria-label="游戏导航"><a href="/">游戏列表</a></nav><div id="route-outlet"></div>';
const navigation = app.querySelector<HTMLElement>('.app-navigation')!;
const outlet = app.querySelector<HTMLDivElement>('#route-outlet')!;
let activeGame: Phaser.Game | undefined;
let isDestroying = false;

for (const game of games) {
  const link = document.createElement('a');
  link.href = `/games/${game.id}`;
  link.textContent = game.title;
  navigation.append(link);
}

/** 根据当前地址渲染页面；游戏拥有出口内的全部内容及样式。 */
function renderRoute(): void {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const definition = games.find((game) => `/games/${game.id}` === path);
  for (const link of navigation.querySelectorAll('a')) {
    if (link.pathname === path) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  outlet.replaceChildren();
  if (definition) {
    document.title = `${definition.title} · 小游戏合集`;
    activeGame = definition.create(outlet);
    return;
  }
  document.title = '小游戏合集';
  const page = document.createElement('main');
  page.className = 'library-page';
  page.innerHTML = path === '/'
    ? '<h1>小游戏合集</h1><p>从导航中选择游戏开始。</p>'
    : '<h1>页面不存在</h1><p>请从导航中选择游戏。</p>';
  outlet.append(page);
}

/** Phaser 延迟销毁，完成清理后再更新出口，连续导航以最新地址为准。 */
function updateRoute(): void {
  if (activeGame) {
    const previousGame = activeGame;
    // 销毁期间保留实例标记，避免重复注册销毁回调。
    if (isDestroying) return;
    isDestroying = true;
    previousGame.events.once('destroy', () => {
      queueMicrotask(() => {
        activeGame = undefined;
        isDestroying = false;
        renderRoute();
      });
    });
    previousGame.destroy(true);
    return;
  }
  renderRoute();
}

// 普通点击使用浏览器历史切换路由，保留修饰键和新标签页的原生链接行为。
navigation.addEventListener('click', (event) => {
  const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a');
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (window.location.pathname === link.pathname) return;
  window.history.pushState(null, '', link.pathname);
  updateRoute();
});
window.addEventListener('popstate', updateRoute);
renderRoute();
