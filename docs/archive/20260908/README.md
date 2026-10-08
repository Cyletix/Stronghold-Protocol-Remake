# 卫戍协议复刻

基于官方 APK、gamedata 与资源研究成果，在浏览器中独立复刻明日方舟「卫戍协议」。
项目目标是可离线运行、可重复验证的纯 Web 单机游戏；官方客户端改造、私服登录和联网房间不再属于产品路线。

> ⚠️ 合规声明：本项目仅用于学习、交流与熟人间非商业自用。游戏客户端、素材与数据版权归
> 上海鹰角网络科技有限公司（Hypergryph）所有。请勿公开分发或用于商业用途。

## 目标

- 只实现「卫戍协议」模式
- 在桌面浏览器中完成可离线游玩的单机闭环
- 以官方数据和可重复实验为依据复现地图、运营、战斗与盟约规则
- 建立能承载大量敌人、高频攻击、粒子特效和四战场同屏的性能架构

当前主线是先固化纯 Web 的状态、规则、模拟和渲染边界，建立性能基准，再按证据接入系统性玩法与视觉资产。性能预算见 [docs/architecture.md](docs/architecture.md)，可重复压力场景和整改前结果见 [docs/performance-baseline.md](docs/performance-baseline.md)。

## 玩法确认（已确认）

「卫戍协议」= 自走棋式运营 + 自动塔防 + 阵营/职业盟约羁绊 + 多回合生存战；多人（1~4 人）带「联防」协作机制。
战斗由客户端自动部署、自动结算（可信任客户端结果）。完整规则见仓库根目录 [玩法简介.txt](玩法简介.txt)。

> ✅ 已确认：日服 APK（36.7.22）含「卫戍协议」，内部代号 `autoChess`（自走棋），共 `act1autochess` / `act2autochess` 两赛季，**无需更换国服 APK**。详见 [docs/findings.md](docs/findings.md)。

## 进度

- [x] 项目初始化 + 文档
- [ ] 素材与数据提取
- [ ] 纯 Web 架构与性能基线
- [ ] 单机玩法规则闭环
- [ ] 地图、单位、特效分层渲染
- [ ] UI 与视觉还原

## 目录结构

```
.
├── README.md
├── .gitignore
├── docs/
│   ├── roadmap.md        # 完整逆向路线图（分阶段、验收标准）
│   ├── architecture.md   # 架构说明
│   └── toolchain.md      # 工具链清单
├── tools/                # 数据/资源提取、构建、检查与性能基准
├── server/               # 历史研究/调试代码，不属于产品运行链
├── client-patch/         # 历史客户端研究，不属于产品路线
├── assets-extracted/     # 提取的素材（不入库，见 .gitignore）
└── data/                 # gamedata JSON（引用外部仓库）
```

## 文档入口

- 当前任务看 [assets/task/](assets/task/)
- 研究、规则合理性与代码复现方法看 [docs/research-workflow.md](docs/research-workflow.md)
- 数据获取状态看 [docs/data-progress.md](docs/data-progress.md) 与 [docs/data-inventory.md](docs/data-inventory.md)
- 装工具看 [docs/toolchain.md](docs/toolchain.md)
- 理解原理看 [docs/architecture.md](docs/architecture.md)

## 关键外部资源

- [yuanyan3060/ArknightsGameData](https://github.com/yuanyan3060/ArknightsGameData) —— 各服 gamedata JSON
- [yuanyan3060/ArknightsGameResource](https://github.com/yuanyan3060/ArknightsGameResource) —— 素材
- 历史私服与客户端资料仅保留作研究归档，不再作为实现目标。
