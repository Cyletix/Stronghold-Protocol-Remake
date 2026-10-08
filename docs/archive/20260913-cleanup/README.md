# 2026-09-13 文档与入口整理

[当前文档](../../README.md) · [推进计划](../../plan.md)

这是迁移记录，不是新的任务计划。旧版“未实现/已完成”、命令和相对路径只代表当时状态。

## 入口去向

| 原文件 | 当前用途 |
|---|---|
| 根目录 TASKPLAN.md、docs/roadmap.md | 删除跳转占位；工作顺序统一到[推进计划](../../plan.md) |
| HANDOFF、asset-map、asset-pipeline、data-progress、mode-architecture、op-data-audit | 移出当前文档；分别由[导航](../../README.md)、[数据](../../research/README.md)、[开发工具](../../development/toolchain.md)、[规格/架构](../../spec/architecture.md)、[清单](../../checklists/README.md)承担 |
| development-setup、repository-layout | 合并到[开发说明](../../development/README.md) |
| research-workflow | 合并到[研究入口](../../research/README.md)与对应 skill |
| Start-Room.cmd、Start-Online.cmd | 同一启动器的重复入口已移除，使用[开始游戏.cmd](../../../开始游戏.cmd)及其参数 |
| run.bat | 旧 Python 快捷入口移除；[开发说明](../../development/README.md)保留静态服务命令 |
| Package-Room.cmd | 移到[tools/Package-Room.cmd](../../../tools/Package-Room.cmd)，修正脚本相对位置 |
| engineering-reasoning.md | 重复通用要求移出，项目必要边界由[AGENTS](../../../AGENTS.md)与具体 skill 维护 |

旧脚本内容以 .txt 保存，避免当成可执行启动入口。[迁移清单及哈希](manifest.json)记录原路径、归档路径和替代入口；合并前文件在 before/、退出入口在 retired/，不再放跳转 stub。

## 历史审计

- [2026-09-10 完整录像审计](video-review-20260910.md)：保留画面依据及当时实施记录；未完成事项以当前计划/清单重新核对。
- [2026-09-08 指令审计](agent-instruction-audit.md)：旧规则和模型选择评审，不是现行指令。
- [原始切片画廊](../../../assets/reference/video-audit-20260910/index.html)：保留证据，不重复抽帧。

逐项清单迁入 docs/checklists，机制迁入 docs/mechanics，规则/架构迁入 docs/spec，数据研究迁入 docs/research，开发资料迁入 docs/development。人工 review ID、摘要和记录按原表保留；仅迁移路径不增加完成勾选。任务状态与用户收件箱不作完成迁移。

## 整理验收

6,240 个 review ID、原有 322 个已验收子项及其文字记录保留，没有新增行为勾选。源码仅同步旧文档路径的注释（含两个生成文件头）；迁移脚本逐行确认替换范围，更新相应依据摘要后，87 组集成检查通过。

当前文档导航全部可达，51 份入口/规则文档的 1,603 个本地链接通过检查。单启动入口从非项目目录执行便携依赖检查通过；覆盖更新专项确认说明使用包内实际启动名，个人配置保留。supervisor 在其要求的 PowerShell 7 中 Validate 通过（18 个历史任务、66 份日志），没有迁移任务状态或用户勾选。

规则整理核对了普通“继续”、明确自动维护、单项阻塞继续其他队列、独立只读审查、缺源证据及归档清理等场景的适用边界。9 个 SKILL 正文由 581 行减为 235 行；去重不更改脚本状态契约。旧规则保存在 before/skills/，经验发布仍沿用用户确认与 Cline 读取边界。
