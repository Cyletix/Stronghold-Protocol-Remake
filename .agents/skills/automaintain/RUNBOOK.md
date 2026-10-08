# 自动维护操作说明

仅用于 supervisor 自动维护；普通“继续推进”走 [当前计划](../../../docs/plan.md)。

## 启动与停止

在当前 Agent 会话中输入：

```text
使用本项目 automaintain，继续现有任务并处理可摄取事项，直到没有可执行工作。
```

模型与推理设置沿用当前会话。停止当前前台会话可用 Ctrl+C；不要按进程名杀掉所有 Agent 实例。若另用了 CLI 调度器，其服务状态不等于本项目的任务状态。

## 命令入口

supervisor 要求 **PowerShell 7（pwsh）**。先在 pwsh 中进入项目根目录，再执行：

```powershell
& .\.agents\skills\automaintain\scripts\supervise.ps1 -Action Validate
& .\.agents\skills\automaintain\scripts\supervise.ps1 -Action SyncInbox
& .\.agents\skills\automaintain\scripts\supervise.ps1 -Action Status
```

SyncInbox 会按协议更新收件箱，不是只读查看。只查状态用 Status；任务 schema 与动作参数见 [任务协议](../../../assets/task/README.md)。

## 恢复

重启维护会话后仍按 Validate → SyncInbox → Status 定位 active/queued。blocked 只在恢复条件满足后 Resume；有其他 queued/pending 则继续它们。

状态、next、attempts、blocker、resume_when 和任务 checkbox 由 supervisor 更新，不能为继续运行手改。具体循环、Block 条件与 FINAL 验收见 [SKILL.md](SKILL.md)。经验处理见 [experience](../experience/SKILL.md)。
