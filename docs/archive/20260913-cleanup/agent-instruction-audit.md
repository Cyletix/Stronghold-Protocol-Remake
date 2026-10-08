# 本地 Agent 指令调整记录

> 历史材料：保留当时的观察和审计结论。当前实现状态与工作顺序请看[推进计划](../../plan.md)，不沿用下文旧版待办。

2026-09-08。范围为本项目 `AGENTS.md`、本地 skill 与相关持久指令；全局规则不在本轮修改范围。

## 依据与读取范围

- [OpenAI：GPT-6 Astra 模型指南](https://developers.openai.com/api/docs/guides/latest-model)，读取官方 Markdown 正文：`https://developers.openai.com/api/docs/guides/latest-model.md`。
- [Eric Provencher：Rethinking skills and prompts for GPT-6 Astra](https://x.com/pvncher/status/2095991462416490862)。X 页面直读失败，通过公开 FxTwitter 转换接口取得作者、原文链接与完整正文，并在浏览器中读取两张原文示例图。配图分别演示精确限定 skill 触发场景和按任务选择 AGENTS 中的上下文入口。

采用两份材料中关于指令敏感度、短触发描述、按需加载、清晰完成边界和适度验证的建议，结合项目现有契约修改；没有直接粘贴整段通用 prompt，也没有更改模型或推理参数配置。

读取了本项目 AGENTS、9 个本地 SKILL、automaintain RUNBOOK、任务协议及与本轮判断相关的脚本片段。遵循用户限定，本轮没有读取三份 Cline 专属文件：`00-agent-constitution.md`、`Project.md`、`Experience.md`。因此不能声称审查了 Cline 专属指令的全部内容。

## 修改及保留的边界

| 位置 | 调整 |
| --- | --- |
| `AGENTS.md` | 移除面向所有 agent 的 Cline 专属入口；改为按任务加载项目文档与 skill，保留用户添加的 Cline 读取边界 |
| `automaintain/SKILL.md` | 明确仅在用户要求自动维护时启动；FINAL 中可修复既定范围内的遗漏，与任务协议一致；删除固定“两轮读取”限制，保留证据与收敛要求 |
| `automaintain/RUNBOOK.md` | 缩短启动 prompt，移除强制英文思考及固定开头；模型与推理强度沿用配置 |
| `review/SKILL.md` | 区分独立只读审查与实施中的自检，后者继续原请求已授权的修复；按变更选择领域检查 |
| `diagnose/SKILL.md` | 以能区分故障假设的证据替代固定证据数量；等待有超时，报告不强制套模板 |
| `research-evidence/SKILL.md` | 统一等级标注要求，明确客户端事实与仿真实现约定的区别，保留来源和不确定性约束 |
| `change-impact/SKILL.md` | 沿实际依赖选择检查类别，普通请求不被自动升级为维护任务 |
| `experience/SKILL.md` | 澄清 Pending 在旧 schema 下可能迁移；候选不等于发布授权，脚本不能绕过 Cline 专属读取边界 |
| `meta-craft/SKILL.md` | 局部规则不重复整套流程；多规则行为调整使用代表场景，简单文字修正只做局部检查 |
| `spec-gaming/SKILL.md` | 缩短目录中常驻的触发描述，正文判断原则保留 |
| `.clinerules/engineering-reasoning.md` | 保留真实数据、行为契约、验收与职责边界；移除无关音频案例、全目录检查清单和固定完成报告格式 |

`mode-spec-review` 已检查，保留现状。任务状态机、supervisor、经验管理脚本与现有任务、收件箱内容没有因本轮 prompt 调整而修改。

## 验证方法

检查 frontmatter 与入口路径，核对 FINAL 和经验管理脚本的现有行为，并用代表场景检查普通修复、FINAL 遗漏、客户端假设和小型文字修改的决策边界。此次属于指令变更，未用游戏构建或全量业务测试代替指令验证，也未对 Astra 行为收益做量化承诺。

结果：9 个本地 skill 通过 `quick_validate.py` 校验；相关入口路径存在；独立复核的四个交接场景均保留预期的授权、状态与证据边界；`git diff --check` 通过。场景复核是行为判断检查，不是实际运行自动维护任务的端到端测试。
