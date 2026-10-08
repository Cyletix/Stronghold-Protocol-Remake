# 项目工作区 Agent 规则入口

本项目包含卫戍协议的客户端研究、数据提取与仿真实现。按当前请求选择下面的入口，只读取与当前决策相关的部分。

## 按需入口

- 玩法与架构变更：`docs/mode-spec.md`、`docs/architecture.md` 的相关章节。
- 客户端行为与资源研究：`docs/findings.md`、`docs/data-inventory.md`、`docs/toolchain.md`；新增或修订研究结论时使用 `research-evidence`。实现结果不能反过来证明客户端事实。
- 项目专用方法：`.agents/skills/<name>/SKILL.md`，按描述匹配当前任务。普通修复或问答不自动启动自动维护。
- 用户要求启动或继续自动维护：`.agents/skills/automaintain/SKILL.md`；运行命令与恢复方法见同目录 `RUNBOOK.md`。
- 处理标准任务：先读 `assets/task/README.md` 和当前 `assets/task/T-*.md`。任务状态由 supervisor 管理，`assets/todo.md` 勾选仅由用户验收时修改。
- 排查任务运行问题：按需读取 `assets/state/`、`assets/log/`；它们不替代任务文件中的执行状态。

## Cline专属
只有Cline才能读取, 如果你是gpt codex/claude code/Gemini/, 不需要读取
- cline顶层宪法：`.clinerules/00-agent-constitution.md`
- 项目权威与研究证据：`.clinerules/Project.md`
- 常用经验：`.clinerules/Experience.md`
