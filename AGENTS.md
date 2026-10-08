# 项目工作区 Agent 规则入口

本项目包含卫戍协议的客户端研究、数据提取与 Web 仿真实现。先按当前请求选入口，只读取本轮有关章节。

## 按需入口

- 用户说“继续推进”：看 `docs/plan.md`，选下一项可执行工作；具体反馈优先按当前请求修复。总导航为 `docs/README.md`。
- Codex 定时续做也按 `docs/plan.md` 和它指向的机制/实施清单推进；先用现有客户端逻辑索引定位缺口，方法见 `docs/research/client-logic-pipeline.md`。定时任务本身不启动另一套 supervisor。
- 实施与验收：`docs/mechanics/README.md` 找专题，`docs/checklists/README.md` 找逐人/逐敌条目。只有对应行为实现且具体验证后才能勾选；部分完成只写记录。生成器必须保留稳定 ID、依据摘要和人工进度。
- 玩法与架构：`docs/spec/mode-spec.md`、`docs/spec/architecture.md`。新增客户端结论使用 `research-evidence`；本项目代码和测试不能自证原版一致。
- 数据取证：`docs/research/README.md`；构建、提取、运行与发布：`docs/development/README.md`。
- 项目 skills 按各自触发条件读取，不整包加载。规则只在本文件分流，具体方法留在对应 skill；普通修复、问答或“继续”不自动启动 supervisor。
- 用户明确要求启动、恢复或推进 supervisor 自动维护时，使用 `.agents/skills/automaintain/SKILL.md` 和同目录 `RUNBOOK.md`，再读 `assets/task/README.md` 与当前任务。状态由 supervisor 管理，日志用于取证；`assets/todo.md` 的勾选仅由用户验收时修改。

## 文件与维护边界

- 用户启动入口只有 `开始游戏.cmd`；开发打包入口在 `tools/Package-Room.cmd`。按用户 2026-09-17 的持续要求，每完成一个可验收的大项并通过必要验证，立即制作完整分享包并报告产物路径；方法见 `docs/development/README.md`。发布按用户当次要求执行。
- `web/mode.js` 从 `web/mode/` 生成；`web/engine.js` 和 `web/src/` 直接维护。改生成来源时同步检查消费者、派生数据和相关验证。
- 推进顺序只在 `docs/plan.md` 维护，个体完成只在验收清单维护；旧审计、已替代计划归入 `docs/archive/`。归档和历史任务记录不作为当前实现状态。

## Cline专属
只有Cline才能读取, 如果你是gpt codex/claude code/Gemini/, 不需要读取
- cline顶层宪法：`.clinerules/00-agent-constitution.md`
- 项目权威与研究证据：`.clinerules/Project.md`
- 常用经验：`.clinerules/Experience.md`
