# 任务状态协议

`docs/tasks/T-*.md` 是唯一任务执行状态源。

`HANDOFF.md`、`docs/todo.md`、`docs/roadmap.md`、日志和对话都不能用于推断当前 next。下一步只来自 `supervise.ps1 -Action Status`。

## 任务正文结构

每个任务必须包含：

## 目标

说明完成后必须成立的结果。

## 任务范围

明确允许修改的资产，例如：

- `server/**`
- `web/**`
- `tools/**`
- `docs/mode-spec.md`

以及明确不在当前任务中的事项。

## 验收条件

使用普通列表，不使用状态机 checkbox。

验收条件必须可通过代码、数据、运行结果、研究证据或文档一致性判断。

## 依赖与约束

记录：

- 上游数据；
- 客户端版本；
- 已知协议约束；
- 外部工具；
- 兼容要求；
- 尚未验证的研究假设。

## 执行步骤

只有这里的：

- `U-*`
- `FINAL`

属于任务状态机（`- [ ] \`U-001\` ...` 格式，由 `supervise.ps1` 勾选推进）。

## FINAL

FINAL 必须确认：

1. 任务验收条件均有证据。
2. Git diff 没有范围外修改。
3. 修改涉及的 server / web / data / docs 已闭合传播。
4. 没有把尚未验证的逆向假设写成确定事实。
5. 数据结构变化已检查实际消费者。
6. Web 仿真行为变化与 `mode-spec.md` 一致。
7. 若实现与已验证客户端行为存在差异，该差异已明确记录，而不是静默覆盖事实。
8. 所需 smoke test / 脚本 / 运行验证已经执行。

## 状态机

`supervise.ps1 -Action <Status|Validate|Activate|Complete|Fail|Resume|Cancel|WriteLog|Unlock>`

状态：`queued → active → done`；失败两次转 `blocked`（需 `resume_when`）；`queued/blocked` 可 `cancel`。同一时刻最多一个 active 任务。
