---
name: experience
description: "处理单条运行日志中的可复用经验，并管理用户待审查的经验候选。触发：新日志 meta 非空、自动维护自然停止前查询、用户决定发布或复核经验。"
---

# Experience

## 职责

- `.clinerules/Experience.md`：用户确认后的少量常用经验，也是唯一发布位置。
- `assets/state/experience-index.json`：证据、候选和审查状态，由脚本维护。
- 已写入正式规则或程序的行为不再作为经验保存。

experience 流程不得因经验成熟而自动修改其他规则、skill、任务协议或脚本。

## 摄取

仅当 supervisor 新生成日志的 `meta` 非空时运行：

```powershell
& .\.agents\skills\experience\scripts\ingest-log.ps1 -LogPath <log>
```

脚本负责校验、去重、证据归并、状态计算、schema、锁和原子写入。不得手工修改 experience index。

## 管理接口

自动维护自然停止前查询候选：

```powershell
& .\.agents\skills\experience\scripts\manage-experience.ps1 -Action Pending
```

`Pending` 不发布或审查候选；schema 2 下仅查询，旧 schema 1 index 在加载时会原子迁移为 schema 2。需要严格只读时直接查看 index，不运行迁移。

以下动作只有在用户对对应经验作出明确决定后才能调用：

```powershell
# 发布新经验
& .\.agents\skills\experience\scripts\manage-experience.ps1 -Action Approve -ExperienceId <id> -Text '<单句经验>'

# 审查反例后保留现有经验
& .\.agents\skills\experience\scripts\manage-experience.ps1 -Action Keep -ExperienceId <id>

# 修订已发布经验；只有用户同时确认新 action key 时才传 -ActionKey
& .\.agents\skills\experience\scripts\manage-experience.ps1 -Action Revise -ExperienceId <id> -Text '<单句经验>' [-ActionKey <key>]

# 退役已发布经验并保留历史证据
& .\.agents\skills\experience\scripts\manage-experience.ps1 -Action Retire -ExperienceId <id> [-Reason '<原因>']
```

发布或修订的经验必须能跨任务复用、尚未被正式规则或程序固化，并能压缩成一句明确、可证伪的提示。

## 边界

候选状态不等于发布授权。管理脚本只更新 `.clinerules/Experience.md` 和对应 experience index；不自动修改其他控制资产。

`AGENTS.md` 将发布目标限定为 Cline 专属。其他 agent 可处理日志与候选索引，但不得通过脚本间接读取或修改该目标；用户只要求发布经验并不自动解除这一读取边界。遇到此情况，提供候选和待执行动作，说明具体限制。
