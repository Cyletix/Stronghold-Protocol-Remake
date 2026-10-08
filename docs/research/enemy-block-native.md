# 敌方阻挡：原生边界与常驻 BLOCK_FREE

2026-09-14，限定本地 JP 36.7.22 APK 和已有提取快照。本轮得到 9 个直接常驻被动的实际挂载与属性语义，已接入 [Web 执行](../mechanics/enemy-passives.md)；14 种岁相器物子敌的独立阻挡来源仍未恢复。两组不可合并计为完成。

## Verified：可读原生入口

二进制 `work/apk-extracted/lib/arm64-v8a/libil2cpp.so`，SHA-256 `d95820e25938778b8865571741c7d626d70662f82bc5bb3badf058fbd1e595af`。方法来自现有 metadata 与 CodeRegistration 的 assembly/token 绑定，由 ELF PT_LOAD 映射文件偏移；没有重新解包或执行客户端。

| 方法 | method index / RVA | 本轮实际观察 |
|---|---|---|
| `Entity.get_isBlockFree` | 55865 / `0x4e05f48` | 56 条指令；默认分支读取 attributes 并依次检查异常标志 3、33、41，任一存在返回 true；否则读实例 `+0x26` 字节。 |
| `Character._CheckBlockable` | 63676 / `0x21b9588` | 143 条指令；`0x21b96d8` 实际调用 `Enemy.CheckBlockable`，还涉及阻挡容量与距离。 |
| `Enemy.ReleaseFromBlocker` | 64152 / `0x21d2cb0` | 92 条指令；`0x21d2d78` 调用 `Character.RemoveBlockee`。 |
| `PassiveBuffAbility.GetPassiveBuffs` | 76086 / `0x2541534` | 默认分支 `0x254158c` 返回实例 `+0x110` 数组。MetadataRegistration 对字段 `_buffs`（field 86024）的 offset 为 `0x110`。 |
| `PassiveBuffAbility.GetActiveBuffs` | 76087 / `0x254159c` | 默认分支返回 null。它与上一项共同证明这里配置的是被动 Buff 数组。 |

`Torappu.AbnormalFlag` 的底层类型是 int：fieldDefaultValue 压缩整数确认 `BLOCK_FREE=3`、`FEARED=33`、`ATTRACTED=41`。`Torappu.LifeType` 的底层类型则为 byte，其默认值是原始单字节，确认 `INFINITY=2`；不能对这两种底层类型使用同一 signed 压缩解码。

`isBlockFree` 的具体顺序为：`0x4e05fbc` 传入 3，`0x4e05fc4` 调用 `GetAbnormalFlag`；随后 33、41 分别在 `0x4e05fe0`、`0x4e05ffc` 检查。`+0x26` 的字段身份没有恢复，不能把它命名为器物专用标志。以上方法含 XLua 热更新分支；本结论限定可读的默认原生路径，不证明在线热更新从未改写它。

## Verified：9 个根对象的直接被动挂载

来源为 `work/client-logic/bundles/battle/enm_pfb_{18,28,29}.ab.json`。每个根对象 `_commonAbilities` 直接引用下表组件，组件启用且所有父 GameObject 激活。其 `m_Script` 为 fileID 1 / pathID `3800760148018415462`，外部 CAB 为 `CAB-658d74aab777086fc32b93f385be999a`；`work/client-logic/script-types.json` 实际 MonoScript 将其绑定为 `Torappu.Battle.Abilities.PassiveBuffAbility`。

| 精确敌人 ID | bundle 序号 | 被动组件 pathID | Buff / template |
|---|---|---|---|
| `enemy_1521_dslily` | 18 | `-6119291241878305267` | `dslily_common_unmove` / `empty` |
| `enemy_9013_acstmk` | 28 | `8917350904993237303` | `acstmk_passive` / `empty` |
| `enemy_9014_acstma` | 28 | `1389324337505877145` | `acstma_passive` / 同名 |
| `enemy_9015_acstmb` | 28 | `-2621127885642982811` | `acstmb_passive` / 同名 |
| `enemy_9017_achunt` | 28 | `-2443645408120409948` | `achunt_passive` / 同名 |
| `enemy_9018_actrpa` | 28 | `-77328028347945273` | `actrpa_passive` / 同名 |
| `enemy_9019_actrpb` | 28 | `5414177585931266297` | `actrpb_passive` / 同名 |
| `enemy_9020_actrpc` | 28 | `-7797771213659267664` | `actrpc_passive` / 同名 |
| `enemy_9033_acdeer` | 29 | `-8004128765363502733` | `enemy_smdeer_passive` / `empty` |

全部 9 个目标 Buff 都有 `attributes.abnormalFlags` 包含 3、`loadFromDB=0`、`lifeTimeType=2`、`isSilenceable=0`、`isStunnable=0`、`isFreezable=0`。因此这些属性来自实际序列化的常驻被动，不需要从技能描述、数据库黑板或者主动技能冷却推断存在时间。源字段表示此 Buff 不被这些状态暂停，不表示宿主免疫所有这些异常。

`work/client-logic/buff-templates.json` 中六个非空模板的事件还创建伤害转移或标记 Buff；图内没有结束宿主 Buff 或移除异常标志的动作。本轮只消费明确存在的 `BLOCK_FREE` 属性，未实现这些其他事件。相邻标志 8 `UNBALANCE_IMMUNE`、22 `UNMOVABLE_PRIVATE` 也未由这批模块自动完成。3 个固定首领原有不移动实现继续沿用。

[build_enemy_passives.js](../../tools/build_enemy_passives.js) 逐个断言实际引用、父对象激活、脚本身份、源 Buff 配置与图边界，并输出 [enemy_passive_data.js](../../web/enemy_passive_data.js)。产物保留根组件、完整组件路径、Buff/template、原始异常数组和所有输入 SHA-256。只认可这 9 个完整 ID，不按名称、后缀或同字段形状扩展。

## 尚未解决：14 种器物子敌的阻挡来源

此前 [PropLikeEnemy HP 取证](enemy-death-spawn-native.md) 得到的完整 `DoApplyModifier` 只证明受击次数与伤害类型限制。其根预制体为 WALK、`_blockVolume=1`，不能由 HP 覆写推出不可阻挡。

本轮沿真实调用定位到同一不可正常解码的文件页 `0x21d0000`：

| Enemy 方法 | method index | RVA | 从函数入口连续解码 |
|---|---|---|---|
| `CheckBlockable` | 64092 | `0x21d0854` | 0 条 |
| `CheckBlockableWithoutCheckRange` | 64093 | `0x21d095c` | 0 条 |
| `_CheckMotionModeBlockable` | 64094 | `0x21d0a78` | 0 条 |
| `_CheckSpecialBlockCondition` | 64095 | `0x21d0b44` | 0 条 |
| `RegisterBlocker` | 64096 | `0x21d0c08` | 0 条 |

邻近 `UnregisterBlocker` 在 `0x21d10fc` 可解码 83 条，证明不是把整个类都判成无法读取。`Character._SearchBlockee` 的可读 `isBlockFree` 调用作用于 Character，不能移作器物子敌的判定证据。当前 Entity 字段偏移表包含不可用数值，也没有据此杜撰 `+0x26` 身份。

剩余恢复条件具体是：取得本快照上述页的可读字节，或授权运行内存快照；也可以换有独立版本标记的客户端，重新核方法与字段身份再比较。没有新字节/新快照条件时不重复扫描这些同页入口。当前改用上面已可读、已实际挂载的被动批次推进；器物子敌不因此获得完成标记。

## 复现与证据边界

```powershell
python tools/inspect_enemy_block.py
node tools/build_enemy_passives.js --check
node tools/_enemy_passives_smoke.js
```

[inspect_enemy_block.py](../../tools/inspect_enemy_block.py) 输出到 `work/client-logic/native-enemy-block/`，保存每个方法的首 16 字节、RVA、连续反汇编、枚举值和 `_buffs` 字段偏移。原生 getter 与源配置是原作证据；Web 中用 `unblockable` 对接阻挡、释放及目标资格是本项目实现，测试只验证该执行和恢复契约。敌方完整阻挡算法、所有瞬态 Buff 的调度及在线热更新不在本批完成范围内。
