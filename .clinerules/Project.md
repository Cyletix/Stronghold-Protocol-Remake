# 卫戍协议项目规则

本文件只定义本仓库特有的权威分域、证据规则和 skill 路由。通用状态机与权限边界以 `00-agent-constitution.md` 为准。

## 权威分域

- 当前任务：`assets/task/T-*.md` —— 本次目标、允许范围、验收条件和 next。
- 模式行为规格：`docs/mode-spec.md` —— 卫戍协议玩法、规则和目标行为。
- 架构：`docs/architecture.md` —— `server`、`web`、`data`、`tools` 的职责边界和技术约束。
- 已验证逆向事实：`docs/findings.md` —— 有证据支持的客户端、资源和协议行为。
- 数据资产说明：`docs/data-inventory.md` —— 数据来源、提取状态及已知边界。
- 工具链：`docs/toolchain.md` —— 提取、分析和构建工具的已确认用法。
- 研究与复现方法：`docs/research-workflow.md` —— 资料定位、可重复提取、规则合理性判断、代码复现闭环与主次取舍。
- 源码与数据：`server/`、`web/`、`tools/`、`data/` —— 当前实现事实，不自动覆盖规格或研究事实。
- tests/checkers：可执行证据，不自动覆盖明确规格。

`TASKPLAN.md` 与 `docs/HANDOFF.md` 是历史计划和交接背景，只能提供定位线索或既有验证记录；它们不是当前任务状态、产品规格或研究事实的权威，不得覆盖 `assets/task/` 与上述分域文件。

## 当前工作主线

默认按 `研究与数据主干 → 可玩闭环 → 系统规则 → 小型缺陷与表现 → 工程治理` 推进。具体方法和完成标准见 `docs/research-workflow.md`，唯一执行顺序仍由 `assets/task/T-*.md` 的状态决定。

旧工作流、旧收件箱和旧状态映射已归档至 `assets/archive/workflow-v1/`，仅供追溯，不是当前状态源或产品规格。

## 研究证据等级

- **Verified**：客户端数据、资源、代码、网络行为或可重复实验直接支持；允许写入正式 findings/spec。
- **Inferred**：多个迹象支持但无法直接确认；必须明确标记，不得无标记升级为正式行为规格。
- **Hypothesis**：研究假设；不得作为实现正确性的唯一依据。

升级路径：`Hypothesis → 新证据 → Inferred → 可重复验证 → Verified`。

不得把“截图观察 → 模型推测”直接写成事实再反过来指导代码。截图可作为界面还原参考，但精确行为和数值仍需按证据等级表述。

## Skill 路由

- 写入或升级研究结论：`research-evidence`。
- 定义或修改 `docs/mode-spec.md`：`mode-spec-review` + `research-evidence`。
- 已知故障或客户端偏差：`diagnose`。
- 公共接口、schema、跨模块行为或生成物传播：`change-impact`。
- FINAL、提交前或人工审查：`review`。
- 防止字面迎合、范围蔓延和反馈过拟合：`spec-gaming`。

## UI 还原约束

- `draft/` 中的原版截图是视觉对照资料；可用于布局和外观比对，不得据此臆造不可见的运行机制。
- 卫戍协议候选区由关卡 `tile_achand` 网格承载，不得退化为屏幕左侧或顶部的独立 DOM 手牌列表。
- 候选区角色与已部署战场单位必须在状态和交互上解耦；两者不能用纯布局挪动互相替代。
