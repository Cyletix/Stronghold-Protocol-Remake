---
name: automaintain
description: "用户要求启动、恢复或推进自动维护时使用；按任务状态机持续处理可执行事项。"
---
# AutoMaintain

## 权威与状态

* 项目入口与读取边界：`AGENTS.md`；Cline 专属文件仅供 Cline 读取。
* 任务格式和状态机：`assets/task/README.md`。
* 当前任务：`assets/task/T-*.md` 中唯一 `status: active` 的文件。
* 状态转移与日志：`scripts/supervise.ps1`。
* 项目行为与接口要求：当前项目 requirement、spec、schema、architecture 等对应权威。
* 领域操作方法：匹配的 skill。
* 经验处理：experience skill。
* 运行与故障恢复：`RUNBOOK.md`。

任务文件是执行状态源。

`assets/todo.md` 的 `[x]` 是用户手动验收结果，不是任务导入状态。Agent 和 supervisor 不得自动勾选；已建任务仅在未勾选条目后记录 task 引用。

Git diff、日志、draft、对话不是任务断点，但可作为诊断与验收证据。

## 自动维护原则

自动维护的目标是持续完成可执行工作，而不是等待用户逐项介入。
仅在用户要求自动维护时运行此循环；普通任务沿用当前请求的范围。

* 一次循环只执行一个 unit。
* 一个 unit 完成后立即进入下一循环。
* active 任务优先；无 active 时激活 queued；无 queued 时摄取 pending inbox / todo。
* blocked 和 suspended 只跳过，不阻止其他可执行任务继续。
* 某个任务 blocked 后，只要还有其他 queued 或可摄取事项，就继续维护。
* 不因“还能进一步研究”“资料不够精确”“无法完全复刻原始实现”而停止整个维护过程。
* 只有真实权限限制、明确外部依赖、不可解决的权威冲突或当前验收条件客观无法满足时，才允许 Block。

## 自动循环

1. 运行 `Validate`；失败时停止并报告契约错误。
2. 运行 `SyncInbox`，随后读取 `Status`。
3. 有 active 时，只执行其 `next`。
4. 无 active 且有 queued 时，激活第一项并执行其 `next`。
5. 无 active / queued 但有 pending inbox 时，依据任务协议摄取并生成 queued 任务。
6. inbox 缺少明确目标、范围或验收方式时，可 `SuspendInbox`，然后继续处理其他可执行事项。
7. 每个 unit 只加载实施当前步骤所需的规范、代码、skill、经验和直接上下文。
8. 如涉及公共接口、schema、跨模块依赖、生成物、数据迁移等真实传播关系，使用 change-impact 检查影响面。
9. 实施当前 unit，并使用与资产类型匹配的证据验证。
10. 验证通过调用 `Complete`；可重试失败调用 `Fail`；满足 Block 条件时调用 `Block`。
11. 调用 `WriteLog`。需要沉淀经验时按 experience skill 处理。
12. 回到第 1 步。
13. 直到 active、queued、pending inbox 都为空，才自然停止。

不得因为一个任务 blocked 而终止整个自动维护会话，只要仍存在其他可执行工作。

## 实施优先

当前 requirement 已足够支持合理实现时，应进入实施，不得持续重复分析。

缺少更精确的上游事实，不自动构成当前 unit 的阻塞条件。

只有以下条件同时成立时，才允许因为资料不足 Block：

1. 缺失事实是当前验收条件成立所必需；
2. 无法依据现有 requirement、contract 和项目行为实现一个可验证结果；
3. 继续实施将必然导致臆造关键事实、违反权威或造成不可接受风险。

不得把以下事项自行升级为当前 unit 的前置条件：

* 更精确复刻原始实现；
* 获取更高保真数据；
* 进一步逆向研究；
* 更完整视觉参考；
* 可选优化；
* 尚未要求的真实性还原。

如果任务只要求实现某种行为，而没有要求精确复刻未知原始实现，应完成符合当前项目 contract 的最小可验证实现，并把尚未确认的差异保留为后续研究事项。

## 执行收敛

* 当前 unit 的目标、修改点和验证方式明确后，停止重复解释需求并开始实施。
* 已读取足够定位修改点的代码后，不继续读取与当前决策无直接价值的上下文。
* 同一事实不得因为措辞不同反复验证。
* 只有出现新证据、冲突或验证失败时才重新打开分析。
* 多个已知局部文件需要一起修改，不自动等于需要 change-impact。
* 基线通过且实施路径明确时，开始最小实现，不得把设计推演本身当作进展。
* 迁移任务开始时先检查当前实现和既有可执行证据是否已满足该 unit；若已满足，重验后直接结算，不得重复实现。
* 当目标、修改点和验证方式已有足够证据时开始实施；继续搜索应针对会改变实现或验收选择的具体未知项。
* 目标检查通过后，仅在新改动、失败或未解决风险需要时扩大或重复验证。项目协议明确要求的最终检查仍需完成。

## 普通 unit

普通 unit 的目标是完成一个可独立验证的局部变更。

验证方式按资产类型选择，例如：

* source code：目标测试、类型检查、lint、运行结果或可复现实验；
* schema/API：schema validation、contract test、consumer 检查；
* configuration：解析、dry-run 或目标程序读取验证；
* documentation：项目规则、链接/checker、与实现或 spec 的一致性检查；
* generated artifacts：重新生成并确认来源与产物一致；
* data/migration：安全测试环境、fixture、dry-run 或明确迁移验证；
* UI/视觉：自动化 smoke 可证明行为时使用自动化证据；必须依赖视觉判断且当前能力无法验证时，应明确记录尚缺的视觉证据，不得把代码推理冒充视觉验证。

不得仅以“文件已修改”“命令未报错”或“看起来正确”作为完成证据。

## FINAL

当 `next = FINAL` 时，验收整个变更；不新增范围外功能。既定范围内、可直接修复的遗漏应当修复并重新验证，不必仅因处于 FINAL 就另建任务。

FINAL 验收步骤：

1. 重新读取任务目标、范围、验收条件和依赖约束。
2. 确认所有普通 unit 已完成。
3. 对每条验收条件找到实际证据。
4. 检查变更是否超出任务范围。
5. 检查 change-impact 中识别的接口、调用点、测试、生成物、文档等是否闭合。
6. 运行项目要求的最终 test/build/lint/checker。
7. 若为 Git worktree，检查 `git status` 和 relevant diff，确认不存在意外文件、范围外修改、半完成生成物、调试残留或临时文件。
8. FINAL 发现遗漏时，按 `assets/task/README.md` 处理：

   * 既定范围内、能在验收阶段完成：修复后重验受影响的验收条件，保留实际证据。
   * 既定范围内、无法在验收阶段直接完成：可 Block 当前任务并创建 `source: null`、正文引用原 task ID 的 queued 后续任务；完成后 Resume 原任务并重新执行 FINAL。
   * 权威冲突、权限或外部依赖使验收无法成立：Block 并记录恢复条件。范围外的可选改进不阻塞原任务验收。
   * 不得重新打开已完成 unit 或手工修改 task checkbox 绕过状态机。
9. 所有验收条件成立后才 Complete `FINAL`。

FINAL 的作用是证明整个变更闭合，不是形式上通过最后一个 checkbox。

## 现场已有修改

若 worktree 已存在其他未完成修改，不得为了“纯化当前 unit”机械回滚。

先判断：

* 当前 unit 可在保留现有修改的情况下独立实施和验证：继续，只结算当前 unit；
* 现场修改确实导致当前 unit 无法可靠验证：才允许 Block，并说明具体阻塞关系。

不得提前 Complete 尚未轮到的 unit。

## 日志协议

日志由 supervisor 生成。

`meta` 只记录可能跨任务复用的：

* 工具或运行环境行为；
* 可复现执行异常；
* 稳定失败模式；
* 可跨任务复用的处理策略。

不得写入：

* 当前任务自身的业务事实；
* 普通实现理由；
* 当前任务专属要求；
* 已由正式规则或程序固化的行为。

无法确定是否值得沉淀时保持 `meta` 为空。

`outcome` 只使用：

* `resolved`
* `improved`
* `avoided`
* `failed`
* `worse`
* `invalid`
* `observed`

## 停止条件

自动维护只有在以下情况停止：

* active、queued 和 pending inbox 都为空；
* `Validate` 失败；
* 当前工作区状态不确定，继续写入存在风险；
* 所有剩余事项均为 blocked / suspended，且不存在其他可执行工作；
* 用户明确中断维护。

单个任务 blocked 不是整个维护会话的停止条件。

自然停止前查询 experience 中待用户审查的候选；如存在 `promotion_ready` 或 `review_required`，只汇总，不自动修改 `.clinerules/Experience.md`。

## 写入边界

* 不提交、不暂存、不发布、不修改仓库外文件或全局配置，除非当前任务或用户明确授权。
* automaintain 不直接手改任务状态字段、完成勾选、日志或经验依据；必须调用对应脚本。
* 不执行范围外重构、清理、格式统一或“顺便优化”。
