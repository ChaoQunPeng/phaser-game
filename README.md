# Phaser Games

使用 TypeScript + Vite + Phaser 的小游戏合集。每个游戏一个文件夹，代码、配置和素材一起维护。

## 启动

需要 Node.js 20.19+（20 系列）或 22.12+。

```sh
npm install
npm run dev
```

## 目录约定

```text
src/
  main.ts                     # 应用启动
  app/                        # 合集公共功能，不放具体游戏玩法
    index.ts                  # 悬浮导航、切换、重启与实例管理
    style.css                 # 合集界面样式
    types.ts                  # 游戏注册契约 GameDefinition
  games/
    index.ts                  # 游戏注册列表
    starter/                  # 一个文件夹对应一个游戏
      index.ts                # 游戏入口与 Phaser 配置
      scenes/                 # 本游戏的场景
        StarterScene.ts
      assets/                 # 本游戏的图片、音频等素材
        README.md
```

每个游戏的场景、玩法逻辑、数值配置、类型和素材都归属自己的文件夹，不引用其他游戏的内部文件。游戏内容增加时，再按需要在游戏文件夹中添加 systems/（玩法系统）、objects/（游戏对象）、config/（数值配置）等目录，不提前创建空目录。

app/ 只负责合集界面和实例生命周期；games/index.ts 只负责登记游戏。确实被多个游戏复用的能力再提取为公共模块。

## 新增游戏

1. 复制 src/games/starter/，重命名为游戏目录，例如 tower-defense/。
2. 修改 index.ts 中的导出名称、唯一 id、标题、介绍和场景配置。
3. 在该目录的 scenes/ 中开发场景，素材放在自己的 assets/ 下。
4. 在 src/games/index.ts 中导入该游戏定义并加入 games 数组，悬浮栏自动显示入口。

素材通过 TypeScript import 获取 URL，再传给 Phaser 的加载方法，路径随游戏目录一起维护。public/ 仅用于需要保持原始 URL 的站点公共文件。

每次切换游戏会销毁旧 Phaser 实例，再启动所选游戏。

## 命令

- npm run dev：启动开发服务器。
- npm run typecheck：检查 TypeScript 类型。
- npm run build：类型检查并构建到 dist。
- npm run preview：预览构建产物。
