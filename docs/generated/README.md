# 自动生成与来源报告

[返回文档导航](../README.md) · [数据与证据](../research/README.md)

本层用于核对字段、覆盖和引用。带人工行为勾选的生成表单独放在[验收清单](../checklists/README.md)，不以报告统计代替完成率。

源技能ID数、某季技能关联数、已登记处理器数和限定行为验收数是不同口径，不能混成“总共只做了多少技能”。复杂机制的批量取证入口见[客户端逻辑流水线](../research/client-logic-pipeline.md)；报告和旧批次记录不另设推进顺序，统一回到[当前计划](../plan.md)。

| 报告 | 生成或维护来源 |
|---|---|
| [组合控制器公共缺口表](skill-flow-queue.md) | `python tools/render_skill_flow_queue.py`；只读冻结18项完整合同和四提供者当前绑定，汇总剩余成员的控制/叶子依赖，不重新取源 |
| [卫戍批量工作表](garrison-batches.md) | `python tools/audit_garrison_batches.py`；限定固定名册未绑定技能，连接现有组件与首阻塞；公共能力组可重叠，候选数不等于可执行数 |
| [当前批量覆盖](community-coverage.md) | `python tools/advance_community_templates.py`；DPS、敌人动作及补源的当前唯一数量表 |
| [敌人动作固定表](enemy-action-templates.md) | `python tools/classify_enemy_action_templates.py`；公共类别、普攻适用范围和根能力分表，复用缓存 |
| [敌人模式固定分组](enemy-mode-dispatch.md) | `python tools/advance_enemy_modes.py`；7 类完整合同、交叉子类/公共算子、Buff 事件图连接和下一批工作单；renderer 只读计划与回执，DPS 快速入口也刷新显示 |
| [公共机制候选分组](client-mechanism-candidates.md) | `python -B tools/build_client_mechanism_candidates.py`；真实脚本类、字段差异、模板闭包、Web登记与DPS编译诊断，非完成率 |
| [敌群与干员覆盖](content-coverage.md) · [JSON](content-coverage.json) | `node tools/audit_content_coverage.js` |
| [干员处理器核对](operator-mechanics.md) · [JSON](operator-mechanics.json) | `node tools/audit_operator_mechanics.js` |
| [轮次数据](round-data-report.md) | `node tools/build_mode_rounds.js`，也生成游戏数据 |
| [Boss 组件与缺口](boss-mechanics.md) | `node tools/build_boss_mechanics.js`，也生成游戏数据 |
| [商店来源](shop-source-notes.md) · [原始字段摘要](shop-source.json) | 字段由 `node tools/extract_shop_research.js` 提取，说明包含人工研究 |
| [决策证据](decision-evidence.md) | 人工整理的教程/源字段/社区依据；不是自动完成报告 |

生成器支持情况以其 `--check` 实现为准；涉及游戏产物的重建须审查相应 diff。后续新增纯人工研究文档放入 `research/`，现有混合报告保留来源路径以维持引用。
