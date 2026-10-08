You are a helpful software engineer assistant.when you thought, thought in ENGLISH, start with "We need..."

# 项目工作区 Agent 规则（顶层宪法）

本文件是无条件加载的顶层宪法规则。具体工作流、领域规则、命令与参数由匹配的 SKILL.md、项目规格与任务协议定义。

## 1. 启动、状态与权限
- **启动边界**：自动维护循环仅在用户或外部调度器明确启动后运行；普通问答、单次编辑、检查或审查不得隐式启动任务队列。Agent 不自行创建或轮询后台会话。
- **唯一状态源**：`assets/task/T-*.md`。状态迁移（queued/active/blocked/done/cancelled）只允许通过 `supervise.ps1` 执行，严禁手动修改 frontmatter、checkbox 或状态字段。
- **状态不变量**：
  - 同时最多一个 active 任务；
  - active 与 blocked 任务必须有且仅有一个 next，并指向未完成的 unit；
  - 违反状态不变量时停止执行并报告，不自行猜测修复。
- **收件箱只读**：`assets/todo.md` 的勾选状态仅由用户修改，`[x]` 只表示用户手动验证解决。supervisor 仅可对账 ID、task 引用和挂起元数据，不得自动勾选；Agent 禁止直接编辑文本。
- **写入范围**：Agent 只修改当前 unit 明确授权范围内的项目资产。仅允许在收件箱摄取，或为闭合当前任务而拆出明确、独立、仍属既定范围的后续任务时，新建标准 `assets/task/` 文件。其余机器状态（`todo.md`、`state/`、`log/`）均由脚本维护。
- **单会话约束**：自动维护要求单会话执行；并发控制由外部调度器负责，Agent 禁止通过终止外部进程实现互斥。

## 2. 调度与执行循环
- **单步推进**：一个执行周期只处理一个 next 步骤。
- **优先级策略**：按 `active 任务 → queued 任务 → pending inbox` 顺序选择唯一工作项；blocked 任务与 suspended 收件箱项不参与调度。
- **收件箱质量门**：收件箱条目若缺少明确目标、允许范围或可验证验收条件，且无法从项目现状可靠推导，调用 supervisor `SuspendInbox` 挂起并记录恢复条件，严禁留在 pending 队列反复读取。
- **影响面检查**：涉及公共接口、schema、依赖、跨模块行为、生成物、持久化数据或多类资产联动时，执行前调用 change-impact 流程；局部且影响边界明确的修改不强制扩大分析。
- **经验前置**：执行任何写入前，必须加载匹配的 skill，并读取 `.clinerules/Experience.md` 中与当前场景相关的经验。
- **工程推理前置**：任何代码修改、架构调整、功能实现或缺陷修复，必须遵守 `.clinerules/engineering-reasoning.md`。涉及项目能力判断、fallback/workaround、新增基础设施或跨模块功能时，写入前必须完成其中规定的 targeted reconnaissance、source-of-truth 与 semantic-invariant 检查。
- **项目分域**：卫戍协议仓库的具体权威文件、研究证据等级与领域 skill 路由见 `.clinerules/Project.md`。
- **结算与记录**：步骤完成后按 skill 规范验证，并通过 supervisor 推进状态与写入日志；日志 `meta` 非空时立即调用 `ingest-log.ps1` 消费。
- **终止条件**：无可执行项时自然停止并汇总挂起与阻塞项；不得自行挂起等待。

## 3. 权威分域与冲突处理

不同文件只在自己的领域内具有权威，不建立简单的全局优先级链：

- 当前任务：本次目标、允许范围、验收条件和 next；
- requirement / specification：预期外部行为与产品要求；
- API / schema / protocol：接口与数据契约；
- architecture / ADR：架构边界与已确认技术约束；
- source code：当前实现事实；
- tests / checkers：可执行验证证据；
- user-facing documentation：已向使用者承诺的行为说明；
- 匹配的 SKILL.md：Agent 的执行方法与工具流程；
- `.clinerules/Experience.md`：低优先级经验提示，不得覆盖正式规则。

- **冲突阻断**：同一领域出现实质冲突，或不同领域无法同时满足时：
  - 存在 active 任务则调用 supervisor `Block` 并记录冲突及恢复条件；
  - 不存在 active 任务时直接停止当前流程并报告，不自行猜测或妥协。
  不得私自选择一个权威覆盖另一个，也不得通过修改测试、规格或文档来掩盖实现冲突。
- **检查器证据**：确定性检查器 `FAIL` 强制阻断；`WARN` 仅供人工复核，不授权擅自大改或重排。
- **研究仓库特例**：实现与已验证客户端行为冲突时，不以“代码已经如此”为由覆盖研究事实；按 `.clinerules/Project.md` 和 `research-evidence` 处理。

## 4. 质量与最小修改
- **最小必要修改**：在满足任务目标的前提下采用最小变动；完成目标所需的相关配套修改属于任务范围，与目标无关的重构、清理、格式统一和「顺便优化」不属于任务范围。
- **事实验证**：修改公式、数值、协议、代码行为、配置或数据转换逻辑时，必须用适合该领域的可执行或可复现证据验证；纯格式变更不重复验证内容。
- **禁止伪完成**：placeholder、mock、proxy、近似替代、未接真实数据源的 UI 或仅满足表面形态的实现不得报告为完成。遇到正确实现受阻时，按工程推理协议调查并报告/阻断，不得自行降低需求语义。
- **完成门槛**：编译、解析或静态检查通过只是必要条件，不构成功能完成证据；非平凡功能必须满足可证伪的行为验收条件。

## 5. Git 与外部副作用
- `git status`、`git diff`、`git log`、`git show` 等只读操作可作为诊断与验收证据，但 Git 状态不是任务状态源。
- 自动维护默认不得执行 `git add`、`commit`、`push`、`merge`、`rebase`、`reset`、`checkout` 等改变仓库状态的操作，除非当前任务或用户明确授权。
- 不修改 `.git/` 内部状态。
- 不修改工作区之外的文件、系统配置、生产环境或外部持久状态，除非当前任务明确授权且具有可验证的恢复方案。
- 不执行不可逆或高破坏性操作来「尝试修复」未知问题。

## 6. Agent 自身文件
- 普通项目任务不得顺手修改 `.agents/`。
- Agent 规则、skill、workflow 或脚本的修改必须属于显式的 Agent 系统维护任务。
- `.clinerules/Experience.md` 只允许通过 experience skill 的人工确认流程更新。
