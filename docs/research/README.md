# 数据与客户端证据

[返回文档导航](../README.md) · [当前推进计划](../plan.md)

- [数据清单与问题分类](data-inventory.md)：源表 → 生成器 → 消费者，F/E/V/N 缺口编号与取证需求。
- [研究结论](findings.md)：带来源和证据等级的客户端观察与推断。
- [现成数据与执行代码](ready-made-sources.md)：2026-09-14 实际下载的 DPS 核心、Buff/敌方配置和 PRTS 机制快照，含固定版本、复用边界与本地路径。
- [现成成果批量接入](community-batch-integration.md)：统一导入/适配命令、数据库与 DPS/卫戍实际消费者，以及按公共类型继续处理的机器缺口。
- [敌人普攻能力与根能力分表](enemy-attack-capabilities.md)：显式 NONE 的等级继承、通用普攻开关，以及固定根能力家族与缓存入口。
- [敌人模式归属与公共执行](enemy-mode-dispatch.md)：完整 Unity 归属连接、原生初始模式规则、固定 7 类触发队列和独立模式执行边界。
- [客户端逻辑批量提取](client-logic-pipeline.md)：技能预制体、Buff动作序列、原生方法与DPS/数据库共用证据入口。
- [公共技能程序接入](client-program-integration.md)：六类属性、Buff实例和生命周期的两端执行、原生证据及剩余阻塞。
- [敌群替换原生取证](enemy-replacement-native.md)：已接正式出怪的类型/逐轮选池、强度、数量、间隔与特殊分支边界。
- [器物死亡生成原生取证](enemy-death-spawn-native.md)：14个真实组件挂载、死亡事件、生成ID/数量及仍未还原的空间/随机过程。
- [敌方阻挡与根被动](enemy-block-native.md)：九个明确BLOCK_FREE挂载、永久生命周期、实际原生getter及器物子敌不可读方法页。
- [未决领域的原始逻辑入口](native-domain-entrypoints.md)：敌方调度、Boss、模式阶段、经济/机变、装备/环境和公共战斗动作的现有对象与方法地址。
- [用户玩法材料](玩法简介.txt)：原始参考，保留原文，不作为工程进度表。
- [生成报告](../generated/README.md)：覆盖统计、Boss/决策/商店来源。
- [历史录像审计](../archive/20260913-cleanup/video-review-20260910.md)：画面事实可追溯，旧实现状态仅作历史参考。

每个新结论记录版本/快照、源位置、原始观察、解释、证据等级和未验证条件，遵循 [research-evidence](../../.agents/skills/research-evidence/SKILL.md)。源字段存在不能证明触发顺序；本项目代码和测试不能反证原版机制。社区与用户提供的信息可用于实现依据，但与同版源表冲突时保留差异。名称未命中只说明该次检索结果，不能断言资源不存在。

玩法契约写入[规格](../spec/mode-spec.md)，实现边界写入[机制专题](../mechanics/README.md)，验证记录写入[清单](../checklists/README.md)。已有内容先复用`work/client-logic/`，沿源ID、对象引用、顺序动作和原生调用按公共机制成批推进；只有新增包、缺失对象或未展开函数才按[工具说明](../development/toolchain.md)补取。历史解包失败、旧覆盖率和旧未实现清单不作为当前工作方法。
