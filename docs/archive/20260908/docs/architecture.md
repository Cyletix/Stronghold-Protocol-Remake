# 架构说明

## 产品边界

自 2026-09-05 起，本项目是**纯 Web 单机复刻**。浏览器直接加载提取后的静态数据和本地资源，执行运营规则、战斗模拟与渲染。

不属于产品范围：

- 官方 Unity 客户端改造；
- 登录、账号、私服协议与战斗报告；
- 网络房间和公网部署。

`server/` 与 `client-patch/` 仅保留为历史研究资料，不得成为 Web 运行依赖。整改前历史可从 Git 标签 `pre-web-refactor-20260905` 恢复。

## 生产与运行主链

```text
gamedata / OBB / 客户端证据
        ↓ tools 可重复提取
web/*.json + web 资源
        ↓ DataCatalog 校验
GameState → Command/Rules → BattleWorld → FrameSnapshot → Renderer / UI
     ↑              └────── DomainEvent ──────┘
  Save/Load
```

- **DataCatalog**：只读生成数据与资源索引；负责 schema/version 校验，不保存一局状态。
- **GameState**：一局唯一权威状态，包含回合、玩家、商店、候选区、装备、盟约和各战场引用。
- **Command/Rules**：购买、刷新、部署、撤回、装备、准备和结算；校验后原子修改状态并产生领域事件。
- **BattleWorld**：固定 tick 战斗模拟。四人模式持有四个 `BoardWorld`，共享只读配置与资源。
- **FrameSnapshot**：模拟向表现层发布的只读快照。
- **Renderer/UI**：只读快照并派发命令，不直接修改 `GameState` 或 `BattleWorld`。

依赖必须单向。迁移期间允许旧 `G`、`B`、`BDATA` 适配器存在，但新增规则不得继续增加无边界 `window.*` 双向回调。

## 运行循环

- 模拟固定 30Hz；渲染目标 60fps，低档质量允许自适应 30fps。
- 每帧限制追赶 tick 数；标签页恢复后不得无限补算。
- 一局使用固定随机种子；热路径禁止直接调用 `Math.random()`。
- DOM 只在 view model 变化时更新，不参与逐帧战斗循环。
- 非焦点战场可以降低动画采样率，但模拟频率和规则结果保持一致。

## 热路径与数据结构

- 运营态使用普通对象与 `Map`，优先可读性和可验证性。
- 敌人、弹道和粒子使用稳定实体 ID、紧凑数组/TypedArray 和 free-list 或 swap-remove。
- 索敌、大范围攻击和碰撞使用地图格空间桶，禁止每个攻击者逐帧扫描全部敌人。
- 粒子与视觉弹道设硬预算并池化；超预算只降低装饰表现，不丢失伤害事件。
- 四战场共享纹理、图集、字体和静态关卡数据，不复制资源。

## 渲染分层

```text
背景/地形 → 地块语义 → 单位 → 弹道 → 粒子 → 交互反馈 → DOM HUD
```

- 各层独立裁剪、批量绘制和质量降级。
- 相机只负责 viewport、投影和坐标转换，不改变游戏状态。
- 单位头像与特效不能再依赖整张地图低分辨率位图获得最终清晰度。
- 当前以 Canvas2D 为基线；先完成分层、可见性、空间索引、批绘和对象池。
- 只有标准压力场景证明 Canvas2D 无法达标时，才迁移单位/粒子层到 WebGL2。

## 性能预算

基准环境：Chromium 桌面浏览器、1920×1080、设备像素比 1。

标准压力场景：

- 四块战场同屏；
- 64 名干员；
- 320 个活跃敌人；
- 1500 个活跃弹道；
- 4000 个可见粒子；
- 每模拟秒 200 次范围查询/伤害事件。

| 指标 | 目标 | 降级线 |
|---|---:|---:|
| 模拟 tick p95 | ≤ 6 ms | 10 ms |
| 单帧总耗时 p95 | ≤ 16.7 ms | 25 ms |
| 长任务 | 0 次 > 50 ms | 必须定位 |
| 活跃战斗内存 | ≤ 512 MB | 768 MB |
| 一分钟持续压测 | 无持续增长 | 不允许泄漏 |

这些数字是工程验收预算，不是当前实现已经达到的结论。是否采用 WebGL2、Worker 或更激进的数据结构必须由压力基准决定。

固定种子场景、运行方法和每轮测量结果记录在 [performance-baseline.md](performance-baseline.md)。

## 候选区与战场契约

- 关卡 `mapData.tiles[].tileKey` 提供 `tile_achand`；生成器必须原样保存为 `level.grid`。
- 候选格的唯一判定是 `level.grid[row][col] === 'tile_achand'`，不得以最后一行或颜色推断。
- 候选实体与已部署单位在状态和交互上解耦；候选实体不参与索敌、受击或盟约战斗效果。
- DOM `#bench/#handbar` 仅供普通模式；卫戍协议候选实体由场景渲染器绘制。
- 迁移状态模型时必须保持候选排序、交换、部署、撤回和装备目标的现有契约。

## 数据与证据

- 数据管线：`data/ArknightsGameData/**` → `tools/**` → `web/*.json`。
- 资源管线：OBB/AssetBundle → `tools/**` → `web` 资源目录。
- `web/*.json` 是生成物；重构 consumer 时不得静默修改 schema 或用手写常量覆盖源数据。
- 规则证据等级仍遵循 `docs/findings.md` 与 `docs/research-workflow.md`；浏览器实现不能把 Inferred/Hypothesis 冒充 Verified。

## 模块迁移

目标目录与迁移顺序见 `docs/mode-architecture.md`。每次只迁移一个完整行为切片，保留兼容适配器并执行固定种子、smoke、浏览器和性能验证；消费者清零后才删除旧全局入口。
