# 战斗界面字体

`battle-brush.woff2` 为 Ma Shan Zheng 毛笔字体的局部字形版本，包含兵种、「锄」及七位英雄姓名所需字形。仅用于标题、印章、兵种卡与棋子；军情、数值和说明使用易读的系统字体。

- 来源：https://github.com/google/fonts/tree/main/ofl/mashanzheng
- 原始文件：`MaShanZheng-Regular.ttf`
- 授权：SIL Open Font License 1.1，完整版权声明及许可证见本目录 `OFL.txt`。
- 修改：用 fontTools 保留 `brush-glyphs.txt` 中的字形，输出 WOFF2；家族名改为 `BattleBrush`。
- 工具仅在临时目录使用，没有增加项目运行时或 npm 依赖。

新增毛笔字文案或怪物文字时，要同步扩展字形清单并重新裁剪字体。不要仅修改系统字体回退来替代棋子形象。普通说明文字不必加入该子集。

本地资源由 `BattleScene.preload` 通过 Phaser 字体加载器加载，运行时不访问第三方字体服务。微信小游戏的字体加载与 Canvas 文字能力仍按 P5 单独验证，核心逻辑不参与字体加载。
