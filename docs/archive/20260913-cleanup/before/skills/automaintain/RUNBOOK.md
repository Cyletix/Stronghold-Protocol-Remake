# 自动维护操作说明

本文件只记录自动维护的启动、停止、状态检查和故障恢复。

任务状态机语义以 `assets/task/README.md` 为准；Agent 执行流程以 `automaintain/SKILL.md` 为准。

## 1. 启动

先进入项目根目录。

在当前 agent 会话中输入：

```text
使用本项目 automaintain，继续现有任务并处理可摄取事项，直到没有可执行工作。
```

使用 Cline CLI 时，可将同一请求作为 prompt：

```powershell
cline --verbose '使用本项目 automaintain，继续现有任务并处理可摄取事项，直到没有可执行工作。'
```

模型与推理强度沿用当前配置；需要覆盖时按已安装 CLI 的 `cline --help` 选择支持的参数。

## 2. 停止

前台运行时：

```text
Ctrl+C
```

即可停止当前维护会话。

不要使用：

```powershell
Stop-Process -Name cline -Force
```

因为可能同时杀掉其他 Cline 会话或后台服务。

## 3. 查看状态

```powershell
& .\.agents\skills\automaintain\scripts\supervise.ps1 -Action Validate
& .\.agents\skills\automaintain\scripts\supervise.ps1 -Action SyncInbox
& .\.agents\skills\automaintain\scripts\supervise.ps1 -Action Status
```

`Status` 是任务执行状态的权威。

Git diff、日志和 Cline 输出不能代替任务状态。

## 4. 恢复

正常情况下不需要人工修改 task YAML。

维护会话重新启动后，应通过：

```text
Validate
→ SyncInbox
→ Status
```

继续现有 active / queued 工作。

blocked 任务只有在恢复条件已经满足时才 Resume。

不要为了继续运行而手工修改：

```text
status
next
attempts
blocker
resume_when
checkbox
```

## 5. Block 行为

某个任务 blocked 时：

* 跳过该任务；
* 如果存在其他 queued / pending 工作，继续执行；
* 只有所有剩余工作都不可执行时才停止并汇总阻塞项。

缺少更精确资料、还能进一步研究、无法完全复刻原始实现，本身不是 Block 理由。

## 6. Cline 后台服务和调度

以下状态互不等价：

```powershell
cline hub status
cline schedule list
cline schedule active
```

它们只表示 Cline 服务或调度器状态。

工作区任务状态始终以：

```powershell
& .\.agents\skills\automaintain\scripts\supervise.ps1 -Action Status
```

为准。

如果没有使用 Cline schedule，可以忽略这一节。
