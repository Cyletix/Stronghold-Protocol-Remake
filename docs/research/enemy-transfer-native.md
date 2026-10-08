# 胄子实体：受伤传递原生证据

2026-09-14，限定现有 JP 36.7.22 APK、`enm_pfb_28` 预制体与当前 CN 敌人数据库。已接入的完整 ID 仅为 `enemy_9014_acstma`、`enemy_9015_acstmb`，对应目标 `enemy_9013_acstmk`；这是两种敌人的一个常驻被动子项，不是胄全部阶段和子实体行为完成。执行与边界见[敌方被动](../mechanics/enemy-passives.md)。

## Verified：实际根被动与目标来源

复用[阻挡批次](enemy-block-native.md)已经核实的 root `_commonAbilities` → 启用 `PassiveBuffAbility` → `acstma_passive` / `acstmb_passive`。它们的不可沉默常驻 Buff 各只有事件 10 的两步动作，顺序为：

```text
ON_TAKE_DAMAGE
  AssignModifierValueIntoBlackboard(hp_lose, filterModifierCancelled=true)
  CreateBuffUseAbilitySelector(BossSelector, acstma_hp_trans)

acstma_hp_trans ON_BUFF_START
  FixedValueDamage(PURE, hp_lose, BUFF_OWNER,
                   noSourceDamage=true, skipModifierEvent=true,
                   considerUnhurtable=false)
```

事件 10 由 metadata 的 `Torappu.Battle.Buff+Event.ON_TAKE_DAMAGE` 默认值核定；不是把 Entity 的另一组事件编号直接套入。`acstma_hp_trans` 为即时、无条件、无派生生命周期的 Buff，空属性数组和空自带黑板；伤害节点不启用 `_multiplierByKey`、伤害回写、环境伤害、按目标数均分或攻击者计算事件。

| 源敌人 | BossSelector EmptyAbility pathID | 实际选择器 pathID | 动作输入目标 |
|---|---|---|---|
| `enemy_9014_acstma` | `3944669344605781145` | `6828043281619139737` | `BUFF_OWNER` |
| `enemy_9015_acstmb` | `3377172491615738469` | `-7558068246298813851` | `TARGET` |

两个根对象都直接引用该 EmptyAbility，别名确为 `BossSelector`。真实 MonoScript 确认选择器为 `AdvancedSelectorWithEnemyOptions`，邻接 `GlobalRange`；所有父对象激活。完整字段由[生成器](../../tools/build_enemy_passives.js)严格比较，主要限制如下：友方阵营、普通实体类别、地面/飞行皆可、敌人等级 mask 4、必须有 `acstmk_passive` Buff、最多一个目标，后排序为 `HATRED_DES`。`_filterByEnemiesKey` 未启用，不能把原版选择器说成直接按敌人 ID 搜索。

当前源根被动中实际拥有 `acstmk_passive` 的目标是 `enemy_9013_acstmk`，CN 数据库 level 0 的 `levelType=BOSS`。Web 据此限定可执行目标 ID；其他来源将来动态赋予同名 Buff，仍需独立接其真实生命周期，不能只写一个任意标记就算本批覆盖。父数据转换现在保留关卡合并后的 `sourceLevelType`，若覆盖成 NORMAL 则不满足目标资格；HP/ATK/level 覆写保持。

## Verified：数值、触发顺序和免事件传递

二进制 `work/apk-extracted/lib/arm64-v8a/libil2cpp.so` SHA-256 为 `d95820e25938778b8865571741c7d626d70662f82bc5bb3badf058fbd1e595af`。以下地址均绑定于该快照。

| 方法 / method index | RVA | 原始观察 |
|---|---|---|
| `AssignModifierValueIntoBlackboard.Execute` / 78875 | `0x2613e80` | `0x2613f4c` 检查取消；`0x2613f78` 读取 `Modifier.value`，`0x2613f90` 写黑板。没有读取 `realDelta` 或 `finalDelta`。 |
| `Modifier.get_value` / 59456 | `0x208c1fc` | 默认分支读取未装箱结构的 `+0x20`，即 metadata 字段 `m_value` 的装箱 offset `0x30` 减对象头 `0x10`。 |
| `CreateBuffUseAbilitySelector.Execute` / 79328 | `0x2635dc0` | `0x263615c` 按别名查自身附加能力；`0x26362f4` 用其选择器 `FindTargets_DISPOSE`；`0x263631c` 复制黑板，`0x2636398` 向实际选中的实体 AddBuff。 |
| `FixedValueDamage.Execute` / 80505 | `0x2683ea4` | `0x26840a4` 读 `hp_lose`；`0x2684280` 另读隐含 `atk_scale` 默认 1；无来源分支在 `0x26842dc` 调用 `CalculateDamageByAtkNoSource`。`0x2684324` 设置 shared flag bit 7，`0x268440c` 调用目标 ApplyModifier。 |
| `Entity.ApplyModifier` / 56017 | `0x4e11be0` | `_OnApplyingModifier` 在虚调用 DoApplyModifier 之前。shared flag mask `0x80` 绕过通常 applying/applied modifier 事件，走独立 skipped 分支。 |
| `Entity._OnApplyingModifier` / 56019 | `0x4e121dc` | `get_isDamage` 成立后在 `0x4e12388` 调用 vtable `0x928`。metadata slot 127 对应 `OnTakeDamage`；DoApplyModifier 为 slot 120 / vtable `0x8b8`，不靠方法名字猜调用。 |
| `Entity.OnTakeDamage` / 56057 | `0x4e1557c` | 先处理取消/无敌/命中检查，再在 `0x4e156f8` 调用 BuffContainer.OnTakeDamage。源图再用 `filterModifierCancelled` 拒绝已取消 modifier。 |
| `AdvancedSelectorWithEnemyOptions.OnPostFilter` / 62230 | `0x2152f88` | `0x21532cc` 调用 ContainsBuff，保留包含指定 Buff 的目标；末尾叠加等级/移动等过滤，并转到 AdvancedSelector 的排序。 |

`atk_scale` 不是从普通攻击文案推测：常量槽 `0xa6a7e60` → storage `0xab1c4c0` → metadata string literal 22629，内容就是 `atk_scale`。选择器别名可由另一常量 `ability_name` 覆写（槽 `0xa5d6068` → literal 22145）；未知别名不能继续默用 BossSelector。

因此，对这两个配置，转伤在子实体自身 HP 扣除之前发生，复制的是当前伤害 modifier 数值而非“本次实际减少的剩余 HP”。例如剩余 5 HP 受到数值 70 的有效 modifier 时，不能把传递量截成 5。新 modifier 为 PURE、无攻击者来源，且跳过 modifier 事件；它不再按原攻击的 DEF/RES 结算，也不触发同类转伤递归。测试中的这个反例仅验证本项目按该证据接线，证据本身来自上述调用及字段。

## 当前执行限制与未解分支

当前正式单首领战可使用此子项。多个合法同标记首领的 `HATRED_DES` 相同仇恨值排序尚未恢复，Web 明确拒绝该歧义转伤并记录诊断，原攻击照常结算；没有把全部目标同时扣血或擅自选数组第一个。未知 `ability_name`、负数/非数 `atk_scale` 也拒绝，并保留诊断。当前输入桥使用实体的源天赋黑板作为这一根被动的黑板覆写来源；完整通用 Buff/能力黑板继承体系不由本批实现。

`actrpa_passive` 的事件是 7 `ON_APPLIED_MODIFIER`，不同于本批受伤前事件；`actrpb/actrpc` 虽然监听 10，其传递图使用 TARGET，且 BossSelector 依赖 `achunt_mark` 和 `enemy_9017_achunt`。后续[根标记批次](enemy-achunt-cleanup-native.md)已确认四个实际根能力的第二个永久 Buff 就是 `achunt_mark`，纠正此前把此标记本身也当作动态依赖的判断；已独立接入 achunt 最终死亡清理。三种转伤仍缺即时 Buff 的 TARGET 上下文和治疗/非 HP modifier 组合，不套用本批函数。具体失败方法/跳表和恢复条件见该页，无新字节不重复扫描。

没有恢复或改写整个敌人多技能调度、器物不可阻挡、胄子实体主动模式、在线 XLua 覆写、所有来源组合或精确 FP 运算。静态数据与当前 CN 数值来源分开记载，不能由两个版本 ID 能匹配升级成全版本一致。

## 复现

```powershell
python tools/inspect_enemy_transfer.py
node tools/build_enemy_passives.js --check
node tools/_enemy_transfer_smoke.js
```

[inspect_enemy_transfer.py](../../tools/inspect_enemy_transfer.py) 将 14 个定向方法的反汇编、字段、事件枚举、常量槽和虚表槽证明写入 `work/client-logic/native-enemy-transfer/`，只读取已有快照。多字节枚举中与本批无关的值明确标为未解，不把单字节读法用于错误推断。
