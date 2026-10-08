# 任务状态协议

`T-*.md` 是唯一执行状态。`assets/todo.md` 是用户验收清单与自然语言收件箱；其勾选状态由用户掌握，日志、临时方案和对话不能用来判断任务的下一步。

分支和任务边界由此同步执行：任务范围只会在 `T-*.md` 内声明，分支命名建议以 `codex/` 开头并保持一条任务一条分支，再在任务文件中记录任务ID与目标。

## 收件箱摄取

用户在 `assets/todo.md` 中每行写一个 `- [ ] 自然语言描述`。勾选语义为：

- `[ ]`：用户尚未确认解决；无 task 引用时可摄取，有 task 引用时表示已进入任务但仍待用户验证。
- `[x]`：用户已手动验证解决。只有用户可以切换到此状态；Agent、supervisor 和任务状态迁移都不得自动勾选。
- `[?]`：条目缺少必要信息而挂起。

自动维护先调用 `SyncInbox`：

- 为新条目补稳定的 `I-YYYYMMDD-NNN` 来源 ID；
- agent 从第一条待处理事项开始，将一条事项或一组同类事项抽象为目标、范围和验收方式明确的 `queued` 任务；
- 新任务的 `source` 填该来源 ID，再次 `SyncInbox` 会在保持 `[ ]` 的前提下记录 task ID，并将该条目移出待摄取队列；
- 来源 ID 已被任务使用时不得重复建任务。

已勾选的 `[x]` 条目不摄取，也不强制要求 inbox ID 或 task 引用。

一个需求只有在至少明确以下内容时才能进入 queued：

- **目标**：完成后系统或交付物应该发生什么变化；
- **范围**：允许修改哪些项目资产；
- **验收**：用什么可观察证据判断完成。

缺少其中任一项且无法从项目现状可靠推导时，调用 `SuspendInbox` 写入原因和恢复条件；该项不再进入自动选择。用户补充的信息满足恢复条件后，调用 `ResumeInbox` 回到 pending。

任务 ID 使用 `T-YYYYMMDD-NNN`；同日序号按现有文件递增。文件名必须是 `<task_id>.md`。普通步骤 ID 使用 `U-大写短名`，最终步骤固定为 `FINAL`。

## 文件格式

```markdown
---
task_id: T-EXAMPLE-001
source: null
title: 示例变更
status: queued
next: null
updated_at: 2026-08-31T00:00:00+09:00
completed_at: null
blocker: null
resume_when: null
attempts: 0
---

# 示例变更

## 目标

- 完成后需要成立的外部行为或项目结果。

## 任务范围

允许修改：
- `src/foo/**`
- `tests/foo/**`

明确不在本任务内：
- deployment
- 无关模块重构

## 验收条件

- 行为 A 满足要求。
- 旧行为 B 保持兼容。
- 对应自动测试通过。

## 依赖与约束

- 无外部依赖。
- 公共 API shape 不变。

## 执行步骤

- [ ] `U-IMPLEMENT` 完成实现修改
- [ ] `U-TEST` 补充或更新验证
- [ ] `FINAL` 整个 change set 的最终验收
```

## 状态机

- `queued -> active`：明确指定第一个未完成步骤。
- `active -> active`：当前步骤验证通过并勾选，同时指定下一个未完成步骤。
- `active -> active`：第一次失败只把 `attempts` 增为 1，允许同一方法的一次受控重试。
- `active -> blocked`：第二次失败自动阻塞，填写 `blocker` 与 `resume_when`。
- `active -> blocked`：权限、权威冲突或外部依赖不可通过重试解决时，直接 `Block`，不消耗重试次数。
- `blocked -> active`：恢复条件满足，继续原步骤或明确指定另一未完成步骤。
- `active -> done`：所有普通单元与 `FINAL` 都已勾选。
- `queued|blocked -> cancelled`：仅用户明确取消；保留文件和理由。

不允许 `done -> active`。需要返工时新建后续任务并引用原 task ID。

没有 active 任务时，自动维护按 supervisor `Status` 返回的顺序激活第一项 queued 任务。每个循环只执行一个 unit，完成状态转移和日志后再继续下一循环。

## FINAL 语义

`FINAL` 是整个任务的 change-set acceptance gate，不得当作形式化收尾。

执行 `FINAL` 时必须重新读取：

- 任务目标；
- 允许修改范围；
- 验收条件；
- 依赖与约束。

并确认：

1. 所有普通 unit 已完成；
2. 每条验收条件都有实际证据；
3. 修改未超出任务范围；
4. 相关接口、schema、调用点、测试、生成物和文档不存在已知未闭合传播；
5. 项目要求的测试、build、lint、checker 或其他验证已经执行；
6. 没有通过修改测试、规格或文档来掩盖实现错误；
7. 没有已知 blocker。

本项目还必须确认：

8. 没有把 Inferred/Hypothesis 静默写成客户端确定事实；
9. 若实现与 Verified 客户端行为存在差异，差异已明确记录；
10. Web UI 视觉验收确实对照了任务指定的 `draft/` 参考，且没有调试残留。

若项目位于 Git worktree，`FINAL` 应检查 `git status` 与 relevant diff 作为范围和一致性证据，但 Git 状态不得替代任务状态。

只有上述条件成立才能 Complete `FINAL`。

FINAL 发现既定范围内但无法在验收阶段直接完成的遗漏时，可先 Block 原任务并创建 `source: null` 的后续任务；后续任务正文必须明确引用原 task ID。后续任务完成后 Resume 原任务重新执行 FINAL。

## 不变量

- 同时最多一个 active 任务。
- `source` 为 `null`、一个收件箱来源 ID，或由多个来源 ID 组成的 JSON 数组；同一来源不能生成多个任务。一个大任务承接多条同类反馈时使用数组，避免为每条小反馈制造独立任务。
- active 与 blocked 任务必须有且只有一个 `next`，并指向未勾选步骤。
- queued、done 与 cancelled 的 `next` 必须为 `null`。
- done 任务的所有执行步骤 checkbox 必须为 `[x]`，且必须包含已完成的 `FINAL`。
- 验收条件使用纯列表项，不使用 checkbox；它们由 FINAL 统一验收，不逐条进入状态机。
- 完成记录不删除；任务文件保持紧凑，运行历史不得追加在这里。

所有状态迁移必须通过 supervisor；任务状态机语义以本文件为准，具体命令和恢复操作见 `.agents/skills/automaintain/RUNBOOK.md`。禁止直接编辑任务 frontmatter 或 checkbox。

## 状态检查：

```powershell
& .\.agents\skills\automaintain\scripts\supervise.ps1 -Action Validate
```

崩溃遗留锁只在锁记录的 PID 已不存在时清除：

```powershell
& .\.agents\skills\automaintain\scripts\supervise.ps1 -Action Unlock -Reason '已确认原进程退出'
```
