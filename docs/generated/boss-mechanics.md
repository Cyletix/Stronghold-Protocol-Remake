# Boss机制：直接提取与执行边界

生成：`node tools/build_boss_mechanics.js`；核对：追加 `--check`。

[Verified] 本表直接读取 `work/main.obb` 内3个 enemy prefab AB 的根 BoxCollider2D、公共Buff和模式普通攻击组件，并以 enemy_database / enemy_handbook / activity 表确认敌人身份和规则语义。路径ID与被使用的原始字段在 `web/boss_mechanics.json.prefabEvidence`。仅导出少量组件字段，未复制AB。

| 对象 | 受击矩形（格） | 本次普攻支持 |
|---|---|---|
| 假想敌：胄 / `enemy_9013_acstmk` | 4.95 × 2.95，源偏移 (0, 1) | 随机1人，法术 |
| 盐风主教昆图斯 / `enemy_1521_dslily` | 4.95 × 2.95，源偏移 (0, 1) | 防御最高的2人，物理 |
| 阿利斯泰尔，帝国余晖 / `enemy_9032_aclionk` | 4.95 × 2.95，源偏移 (0, 1) | 保留现有普攻；仅修固定站位和受击区 |
| “萨米的意志” / `enemy_9033_acdeer` | 4.95 × 2.95，源偏移 (0, 1) | 保留现有普攻；仅修固定站位和受击区 |
| 假想敌：胄 / `enemy_9013_acstmk_2` | 4.95 × 2.95，源偏移 (0, 1) | 随机1人，法术 |

以上5个逻辑敌人均保持源出场位置：prefab公共能力含持续的自缚标记，不能把 moveSpeed=0.1 或 1 当作允许沿路线行走。几何位置使用原始出场中心；源坐标向上为正，渲染数组坐标将 offsetY 取负。受击区域不是干员占格，不能把它改成实体墙或据此改变地图通行。隐秘核心胄与普通胄共享同一prefab，因此使用相同碰撞区；不照搬外部页面与本地prefab冲突的尺寸。

[Verified] 昆图斯3个模式的普攻selector均为2目标、postFilter=8；图鉴明确防御最高的2个单位。普通攻击附带伤害Buff的延迟为0.4秒。胄普攻组件damageType=2，图鉴明确随机单体法术。胄只在当前关卡天赋黑板明确提供1.hp_ratio/1.damage_scale且血量低于门槛时减免物理/法术伤害；不会减免真实伤害。帝国余晖只在达到advance.hp_ratio时应用advance.def/advance.magic_resistance。各关卡可能覆写或清空这些黑板，不回填其他关卡数据。

[Verified] 另已直接提取昆图斯大潮/崩坍各3模式的伤害组件和选择器：大潮全体法术，崩坍最高防御2/4/8目标并延迟1秒。运行期技能事件由当前关卡 sourceSkills 决定初始CD、周期CD、atk_scale、ep_damage_ratio；一次tick至多触发一个技能，并由引擎的 canCast 避免与普攻重叠。默认仅启用第一模式，显式 setMode 后重置新模式初始CD。技能图形/动画帧尚未复原，动作起始点沿用仿真调度约定。

## 阶段切换：已缩小的证据缺口

[Verified] 定向读取同一个昆图斯prefab及 `config/buff_template_holder.ab` 的两个模板；生成数据新增 `prefabEvidence.enemy_1521_dslily.phaseBindings / skillTriggers / phaseTemplates`，保留组件路径ID、父级路径和原始动作字段。

- `Default/Talents/GrowUp1` 的HP触发Buff黑板为 `times=1, mode=1`；`G1/Talents/GrowUp2` 为 `times=2, mode=2`。二者调用 `HpRatioTrigger`，配置为 `condType=GT, hpRatioEachTime=0, useMinHpRatio=false`，通过后 `SwitchMode(loadModeFromBlackboard=true, restartFSM=true)`。数据没有序列化比较表达式的执行体，不能直接把0.33写成剩余血量阈值。
- 两个倒计时Buff的 `triggerLifeType=1, triggerCnt=1, triggerInterval=-1`；GrowUp2另有 `durationKey=growup_duration`，GrowUp1为空。倒计时模板在事件2调用SwitchMode；当前单人源黑板给出 `growup1.interval=75, growup2.interval=200`；黑板如何将 `interval` / `growup_duration` 装配到实际Buff、第二次计时的起点仍须核实。
- `AtkUp1`仅挂在G1，`AtkUp2`仅挂在G2；属性修正是 `attributeType=1, formulaItem=1, loadFromBlackboard=1`。当前单人关卡提供 `atkup1.atk=0.4, atkup2.atk=0.7`，不能将两个阶段的增益一起常驻。多人关卡显式清空天赋黑板，不回填单人参数。
- 大潮/崩坍G1/G2模式的技能触发器均为 `checkParentActive=1, resetCdWaitFirstPeriod=1, overwriteInitCooldown=-1`，Default对应checkParentActive为0；现有显式 `setMode` 使用当前关卡对应技能的初始CD，G1为大潮15/崩坍4秒，G2为大潮1/崩坍13秒。切换动画、普攻状态机清理的精确过程尚未核对到相应原生执行体。

[Inferred] 模式父级绑定支持“进入G1后才附着GrowUp2”和“各形态攻击增益互斥”；但这不足以证明倒计时装配或HP比较的边界。外部[PRTS昆图斯页](https://prts.wiki/w/昆图斯)的已损失生命值术语展开与简述不能消除该比较表达式歧义，因此未据此启用自动切换。

可定向追踪 `Torappu.Battle.Action.Nodes+HpRatioTrigger` 的原生执行函数（黑板 `times/hp_ratio`、初始比例、GT边界），以及 `dslily_growup[countdown]` 的黑板装配和 `SwitchMode` 的首次附着重置逻辑。已有组件和方法索引可复用；共用触发器确认后可展开使用它的其他对象，顺序见[当前计划](../plan.md)。当前保留显式setMode，自动阶段尚未启用。

## 尚未完整执行

- 昆图斯三阶段自动切换尚未启用：GrowUp1/2 的buff绑定已找到，config/buff_template_holder.ab 里 dslily_growup_hp_ratio 使用 HpRatioTrigger 后 SwitchMode；精确阈值/切换时重置仍需核对，不能把后续模式技能全量常驻。
- 子代是 dslily_dstnta 分支逐阶段 ACTIVATE_PREDEFINED trap_039_dstnta#1…#4，并非enemy SPAWN；仍缺预设装置激活、缠绕对象与生命期。神经损伤事件数值可输出，元素爆发仍沿用现有通用仿真。
- 胄召唤无人机、刺胄之弹、剑锤伤害传递：源分支和字段存在；还需接入分支波次/可攻击弹道生命周期。
- 卫戍版萨米整列冰凌、半血列数变化：图鉴有行为描述，专属prefab为4.95×2.95；不能用普通萨米页面2.95×2.95的尺寸替代。列攻击时序及模式黑板覆写仍需绑定。
- 帝国余晖装备活化与技能、其余Boss不在本次执行范围。

上述缺口具有现成定向入口：继续解析同一prefab的_modes/_attack/_generalAbilities和对应GameObject组件；数值从当前关卡合并后的sourceSkills/sourceTalentBlackboard取，不从通用敌人数值覆盖。
