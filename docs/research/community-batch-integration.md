# 现成成果批量接入

2026-09-14：现成资料、DPS 核心、公共技能模板与敌人动作参数已接入现有消费者。当前顺序只在[计划](../plan.md)维护；技能续作先看[固定模板路径](template-batch.md)，原始来源见[检索清单](ready-made-sources.md)。

## 入口

技能模板续作默认运行 `python tools/advance_community_templates.py`。它复用冻结输入与已有回执，哈希未变时跳过编译和计算；`--slots <JSON名单>` 只重算受影响失败项。禁止把全部 ID 转成人工逐条研究任务。

需要更新全部数据消费者时，从卫戍工作区运行：

```powershell
python tools/import_community_batch.py
```

该命令增量导入共享库、导出页面资料、编译敌人动作，调用上述快速 DPS 入口并重建 mode.js。默认不重新下载、解包、发布或执行全仓测试。统一摘要保存在[community-batch-integration.json](../../work/community-batch-integration.json)，快速入口会从当前回执更新其 DPS 和战斗摘要，原步骤记录保留为历史。

| 部分 | 消费路径 | 当前结果 |
| --- | --- | --- |
| 数据库 | 父 tools/resources.py import-community → ResourceStore.community()/SQLiteSource.community()/CommunityStore | 19,591 记录，含 8,292 Buff、2,075 敌 prefab；1,001 技能资料映射到 924 个 skillId，1,681 敌人唯一关联，支持按 1,341 类节点查询 |
| DPS | 原事件模拟优先；community_engine.py → akdata/公共模板/本地参考公式 | 当前可算数、各路径和净补数量见[实时覆盖表](../generated/community-coverage.md) |
| Web 战斗 | build_external_combat_data.py → external_combat_data.js → external-combat.js → 调度/弹道 | 当前配置、时序、弹速及遭遇池命中见[实时覆盖表](../generated/community-coverage.md) |
| Web 资料 | build_community_references.py → community_references.json → 技能详情/名册/敌情 | 550 技能补充说明、264 相关敌人的机制资料；全库按实际消费者筛选导出 |

共享库位于父 `data/community/community.sqlite`，约 120 MB。原始数值表与不可变客户端证据 SQLite 未覆盖；PRTS 修订、来源和未关联记录保留。885 条模组记录含基础证章，不能全算为专属模组。

## 使用与缺口

主窗口沿用“执行计算”。已有事件模拟优先；社区结果显示默认条件、模板投影、源码版本和日志，未知维度显示“未提供”。不生成虚假逐帧事件与排轴。参考公式是本地研究源码桥，不随 vendor 或便携包再分发，详见[父 DPS 说明](../../../docs/community-dps.md)。

卫戍普通攻击直接消费公共时序和恒速弹道，浏览器与房主 VM 共用脚本；Boss 专用逻辑和显式配置优先。Wiki 资料只显示并转义，不作为战斗代码。

| 固定表/回执 | 用途 |
| --- | --- |
| [16 类技能表](../../../data/derived/community-templates/README.md)及 catalog.json | 原 341 槽的稳定归属、代表抽查、201 槽现成公式链接；动态进度由 status.json 和实时表更新 |
| 父 work/community-dps-coverage.json | 全量可计算状态、公式来源、未知量及具体失败；由快速入口更新，不在多份说明中重复维护数量 |
| [11 类敌人动作表](../generated/enemy-action-templates.md) | 缓存根引用、动画、参数与样本；按公共执行器或缺失资源集合推进 |
| [敌人导入报告](../../work/external-combat-import-report.json) | 当前动作消费者缺口和所有受影响 ID |
| 父 data/community/report-gamedata-cc5bf84b0e6d.json | 关联歧义、版本不匹配和未匹配资料，按公共关联规则修复 |

资料批量查询仍用父 `tools/resources.py community --kind enemy --all`；`--node CreateBuff` 查节点全部引用；`--raw --kind enemy --id <PRTS-ID>` 查未关联原记录，见[共享库说明](../../../docs/community.md)。

## 验证边界

导入、关联、社区模型可运行和原版行为验收分别统计。8,292 Buff 可查询不表示全部 Web 执行器已完成。公共规则只验证代表、输入边界及实际消费者；相同输入的成功和失败回执都可复用。源模型仍有默认条件和适用范围，不能把可运行数量写成原版正确率。

本轮未修改人工验收勾选，未发布或打包，定时任务仍为 PAUSED。
