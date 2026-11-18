本游戏的图片、音频等素材放在此目录，使用 TypeScript import 获取 Vite 处理后的 URL，再交给 Phaser 加载。

例如：import towerUrl from './assets/tower.png'; 然后在场景 preload 中调用 this.load.image('tower', towerUrl)。按文件实际位置调整相对路径。
