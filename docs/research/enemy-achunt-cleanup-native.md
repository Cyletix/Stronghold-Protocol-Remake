# achunt 根标记与死亡清理

2026-09-14。限定 JP 36.7.22 的既有源预制体、模板与原生默认分支，数值实体仍读取当前 CN 敌人数据库及关卡覆写。本批实际接入 `enemy_9017_achunt` 最终死亡后的一个清理子项；没有完成其主动技能、全部子体转伤或动态标记链。[执行范围与测试](../mechanics/enemy-passives.md#achunt-死亡清理)另列。

## Verified：标记无需动态创建

来源 `assets/AB/Android/battle/enm_pfb_28.ab`，包 SHA-256 为 `8b8fbc4da8e0064177aaed3884db60b6595842f3eabe6f5a1334ed5e8cede4ea`。读取现有 `work/client-logic/bundles/battle/enm_pfb_28.ab.json`，并用公共 CAB 的真实 MonoScript 关联 `PassiveBuffAbility`；不重新解包，也不凭字段形状命名脚本。

以下四个根 `_commonAbilities` 直接引用的启用能力均有第二个 Buff：`buffKey=achunt_mark`、`templateKey=empty`、`lifeTimeType=2 (INFINITY)`、`isSilenceable/isStunnable/isFreezable=0`。它没有属性、黑板或模板动作；所有父对象激活。

| 实际敌人 ID | 根 PassiveBuffAbility pathID |
|---|---|
| `enemy_9017_achunt` | `-2443645408120409948` |
| `enemy_9018_actrpa` | `-77328028347945273` |
| `enemy_9019_actrpb` | `5414177585931266297` |
| `enemy_9020_actrpc` | `-7797771213659267664` |

此前把这些选择器要求的 `achunt_mark` 一概视为动态链依赖，是未读第二个根 Buff 造成的缺口；本批纠正该解释。`achunt_mark_by_boss` 与其派生 `achunt_summonee` 是另外的名字和生命周期，仍未实现；不能因为本次根标记已核就把动态链也标完成。

## Verified：事件与选择器

`achunt_passive` 事件 3 为 metadata 的 `Buff.Event.ON_OWNER_KILLED`，只含一次 `CreateBuffUseAbilitySelector`：来源和输入目标均为 `BUFF_OWNER`，别名 `BossSelector`，没有排除死亡原因或派生结束关联，创建即时 Buff `kill_achunt_mark_boss`。事件 2 的周期动作不在本批支持范围。

根对象直接引用 `EmptyAbility` pathID `1833237484048871588`，其选择器为 `6034892868228804772`，真实类型 `AdvancedSelectorWithEnemyOptions`，旁接启用的 `GlobalRange`。完整字段由[生成器](../../tools/build_enemy_passives.js)比较：友方阵营、普通实体、移动类型 ALL、等级 mask 7、包含 `achunt_mark`、不按 enemy key 限制、`_limitTargetNum=0`，后排序 `HATRED_DES`。因此不能误用先前胄转伤的 BOSS-only / 最多一目标条件。

Web 支持的标记持有者来自上面四个实际根绑定，并保留合并后的 `sourceLevelType`。NORMAL、ELITE、BOSS 都符合 mask 7；同名标记的未知动态来源不因字符串相同就自动加入。

## Verified：直接归零，保留复活

`kill_achunt_mark_boss` 的唯一事件为 `ON_BUFF_START`，唯一动作是 `InstantKill(BUFF_OWNER)`；`killSource/noSource/skipReborn/noReason/markReachExit/switchState` 均为 false。这不是 PURE 伤害模板。

原生库 SHA-256 仍为 `d95820e25938778b8865571741c7d626d70662f82bc5bb3badf058fbd1e595af`。

| 方法 | RVA 与观察 |
|---|---|
| `InstantKill.Execute` / 80574 | `0x26894b8`，168 条可解指令；本配置不进入撤退、无原因结束或到终点分支，在 `0x268971c` 调用 `Entity.Suicide`，传入 `noSource=false`、`skipReborn=false`。 |
| `Entity.Suicide` / 55932 | `0x4e09c28`，79 条指令；先检查虚槽 38 的 `get_alive`，构造 FP 0，在 `0x4e09d50` 调用虚槽 107。 |
| `Entity.SetHpInternal` / 55977 | metadata 确认虚槽 107 / vtable `0x7e8`，参数依次为 value、force、noSource、skipReborn。上述调用传 value 0、force true，并保留来源中的两个 false；没有经过 `ApplyModifier`。 |

因此执行桥使用直接 HP 归零，再走现有正常死亡/复活入口。不会按 DEF/RES、伤害盾或受伤回调折算成一笔攻击，也不把子体清理记到击杀首领的干员身上。源的 `skipReborn=false` 不能被改成强制越过复活。这里证明的是该指令调用链，未宣称完整死亡事件优先级与所有被动组合都已恢复。

## 三种转伤仍拒绝的具体原因

`actrpa_passive` 监听 7 `ON_APPLIED_MODIFIER`；`actrpb/actrpc` 监听 10 `ON_TAKE_DAMAGE`。三者均复制 `Modifier.value` 并创建 `actrpa_hp_trans`，后者的 `FixedValueDamage` 使用 `TARGET`，不同于已接两种胄子体的 `BUFF_OWNER`。根标记已解，剩余关键问题变为即时 Buff 开始时的目标上下文，以及事件 7 对治疗/非 HP modifier 的组合。

本次定向检查记录为：`Buff.OnStart` 54560 / `0x4d9db50`、`Buff._RunActions` 54660 / `0x4d9d6dc`、`Buff.OnAppliedModifier` 54577 / `0x4d9edac` 均为 0 条可解入口指令。`GetActionTarget` 78312 / `0x25e85ac` 主体可读，但位于 `0x805947d` 的 11 字节跳表原值为 `d14ecde18474d5076e8838`，按该分派公式产生越出函数的目标，不能宣称完整分派已恢复。

因此没有将 `TARGET` 猜成新 Buff 的宿主，也没有新增三个转伤验收。恢复条件是取得覆盖上述上下文方法/跳表的有效同版字节、实际热修或能区分目标身份的运行观察；无新输入不重复扫描相同地址。[前批转伤取证](enemy-transfer-native.md)继续适用于原有两种明确配置。

## 实现边界与复现

当前适用单个活 achunt 的正常战场，清理同板所有合格根标记子体，包括同 ID 多实例。原选择器有 `HATRED_DES` 排序；多活 achunt 会引起相互清理和复活的递归顺序，本地明确拒绝并记录 `unsupported-multiple-cleanup-owners`。未知 `ability_name` 别名亦拒绝。其余目标遍历使用现有战场顺序，不声称原版全部回调顺序逐值一致。

```powershell
python tools/inspect_achunt_cleanup.py
node tools/build_enemy_passives.js --check
node tools/_achunt_cleanup_smoke.js
```

[定向工具](../../tools/inspect_achunt_cleanup.py)将 6 个方法、虚槽、实际顺序动作及明确失败写到 `work/client-logic/native-achunt-cleanup/`。测试验证真实 spawn、关卡覆写、死亡/复活、源目标拒绝、普通与领袖清场、弹体命中、两个隔离权威板和签名快照恢复；本项目测试不作为原版一致性的来源。
