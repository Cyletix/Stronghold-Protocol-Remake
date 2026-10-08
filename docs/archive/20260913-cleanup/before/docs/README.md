# 文档导航

现状核对日期：2026-09-13。实现状态、客户端证据与设计目标分开记录。

| 要回答的问题 | 唯一入口 |
|---|---|
| 代码现在怎么运行，哪些架构仍是目标？ | [architecture.md](architecture.md) |
| 先修什么，哪些已有数据，哪些需要再获取？ | [data-inventory.md](data-inventory.md#priority) |
| 每名干员的特性、天赋、各技能、召唤物，以及每种敌人逐项做到哪里？ | [实施 checkbox 总清单](implementation-checklist.md)，可批处理与逐个处理分开推进 |
| 玩法契约与当前差异是什么？ | [mode-spec.md](mode-spec.md) |
| 如何额外选 V / VI 阶干员，为什么并非全是协防？ | [四槽甄选编队](diy-roster.md)：两季资格、入口、独立保存与原型/助战缺口 |
| 怪物为什么偏难、分组是否齐全、干员具体缺谁？ | [content-coverage.md](generated/content-coverage.md)（可重建核对）与 [数据问题表](data-inventory.md#priority) |
| 迷迭香余震、召唤、群攻等执行器有哪些边界？ | [operator-mechanics.md](operator-mechanics.md)；个体完成记录统一在[逐人清单](generated/operator-checklist.md) |
| 凋亡等元素损伤、爆发、游医回复和指示条做到哪里？ | [elemental-damage.md](elemental-damage.md) |
| 冰爆虫死亡寒冷、冻结和破冰者条件伤害做到哪里？ | [enemy-cold.md](enemy-cold.md)；冰爆虫完整能力仍待状态来源核验 |
| 医疗/吟游者等基础行为和个体技能做到哪里？ | [basic-actions.md](basic-actions.md) |
| 冲锋号令/支援号令怎样回费，哪些干员已验证？ | [公共回费技能](common-cost-skills.md)；可玩绑定与仅有参数分开记录 |
| 公共攻击/防御/治疗/攻速如何叠加，批量验证了哪些角色？ | [公共增益与属性层](common-buffs.md)；27人、80个固定配置的技能本体验证，不代表整人完成 |
| 猎手如何装填，雪猎还缺什么？ | [猎手与雪猎](hunter.md)；固定养成子项与特殊动作缺口分开记录 |
| 秘术师是否真正储存攻击，深靛如何束缚？ | [秘术师与深靛](mystic.md)；4个固定技能配置与其他秘术师的待办范围分开记录 |
| 傀儡师会变替身吗，风丸纸偶是否独立？ | [傀儡师专项](dollkeeper.md)；20个固定技能配置与4个资料库源样例分开记录，非标准形态仍待实现 |
| 七名战术家的援军、复制与专属技能做到哪里？ | [战术实体专项](tactician.md)；18个固定配置、豆苗/夜半40组及渡桥/可露希尔50组技能等级、隐秘队六潜能；逐人范围与物理/模组等缺口见表 |
| 干员专属特质做了哪些，哪些仍缺数据？ | [garrison-implementation.md](garrison-implementation.md) |
| 仓库结构和文件边界如何维护？ | [repository-layout.md](repository-layout.md) |
| 哪些结论有原始证据，哪些仍是推断？ | [findings.md](findings.md) |
| 开发环境、依赖和数据源更新怎么做？ | [development-setup.md](development-setup.md) |
| 怎样运行、构建、提取和验证？ | [toolchain.md](toolchain.md) |
| 怎样分享网页、国内联机有哪些方案、实验做到哪里？ | [multiplayer.md](multiplayer.md) |
| 完整录像对照发现了什么，哪些已修，交付还缺什么？ | [录像核对](video-review-20260910.md) |
| 性能测量结果与适用范围？ | [performance-baseline.md](performance-baseline.md) |
| 任务当前在哪一步？ | [任务协议](../assets/task/README.md)与 supervisor Status |

[research-workflow.md](research-workflow.md)只说明证据记录方法。[玩法简介.txt](玩法简介.txt)保留用户提供的玩法材料；[agent-instruction-audit.md](agent-instruction-audit.md)是独立指令审计，不并入玩法资料。

旧架构设计、数据进度、交接、素材地图和路线图已合并到上述入口。原路径保留转向说明；[2026-09-08 归档](archive/20260908/INDEX.md)保存整理前全文和校验值，不作为当前指南。任务文件与历史日志保留，不复制完成勾选到文档。
