# 岁相器物死亡生成：组件与原生调用取证

2026-09-14，限定本地 JP 36.7.22 APK、现有提取快照与本地 CN 敌人数据库。实现和近似见[机制页](../mechanics/enemy-death-spawn.md)。不把本项目测试作为原版行为的证明，也不据此宣称敌方公共技能调度全部恢复。

## Verified：实际挂载与事件链

预制体 `work/client-logic/bundles/battle/enm_pfb_9.ab.json` 对应 `assets/AB/Android/battle/enm_pfb_9.ab`，原包 SHA-256 为 `b50c2dbef35fe383af3c53572714edeb104ae936fc5c7e138a89ac6a0ac51992`。14 个已启用组件位于各敌人的 `Talent/DeadSpawn`，均引用 fileID 1、pathID `3800760148018415462`。

该 fileID 的外部 CAB 是 `CAB-658d74aab777086fc32b93f385be999a`。通过 `work/client-logic/script-types.json` 的真实 MonoScript，绑定到 `Torappu.Battle.Abilities.PassiveBuffAbility`，不是按字段形状猜类名。MonoScript 原包为 `anon/787628af8cacd60eaae9af1d9c0afa14.bin`，SHA-256 `cec3e04633d6166a305bc4fd3c20cc36add42c77caffacdb9cb2c7e069053ea3`。

14 个组件都挂载 `enemy_dead_spawn` Buff，`isSilenceable=0`、`lifeTimeType=2`、`_ignoreIfOwnerDead=0`。`work/client-logic/buff-templates.json` 的该模板只有一个事件：

```text
event 3: ON_OWNER_KILLED
  FilterDeathReason(source=BUFF_OWNER, finishReason=FALLDOWN)
  IfNot
  SummonEnemiesFollowMyRoute
```

事件编号不是从名称顺序推测：恢复的 metadata 中 `Torappu.Battle.Buff+Event` 的 `ON_OWNER_KILLED` 是 field index 58972；fieldDefaultValue 的 dataIndex 129076 单字节压缩有符号整数 `0x06` 解码为 3。邻近五项解码分别为 START=0、FINISH=1、TRIGGER=2、OWNER_KILLED=3、OWNER_FINISH=4。不能把 `Entity.Event.ON_DEATH` 的另一套编号拿来套用。

由实际事件和动作链可确认：这是死亡事件下的生成，排除 `FALLDOWN`，该 Buff 不可沉默。退出事件属于 `ON_OWNER_REACH_EXIT`，并非本模板事件。数据库仅有 `DeadSpawn.*` 键还不足以证明挂载；生成器必须同时核组件、真实脚本和模板。

## Verified：原生黑板键与动作参数

二进制 `work/apk-extracted/lib/arm64-v8a/libil2cpp.so` SHA-256：`d95820e25938778b8865571741c7d626d70662f82bc5bb3badf058fbd1e595af`。

`Torappu.Battle.Action.Nodes+SummonEnemiesFollowMyRoute::Execute`，method index 82711，RVA `0x274cd98`：

- `0x274cfac` 读取节点 `_enemyKey`（偏移 `+0x18`），`0x274cfd8` 调用 `Blackboard::GetStringOrDefault`。常量槽 `0xa695a48` → `0xab20b08` → 编码 `0xa000c25d` → string literal 24878，内容为 `enemy_key`。
- `0x274cfdc` 读取节点 `_summonCount`（偏移 `+0x20`），`0x274cff0` 调用 `Blackboard::GetIntOrDefault`。常量槽 `0xa63c2a0` → `0xab1eac0` → 编码 `0xa000ba4b` → string literal 23845，内容为 `cnt`。
- 动作字段偏移从 MetadataRegistration 的 fieldOffsets 读取，生成的证据文件保留完整布局。不是从本项目变量命名反推。

模板序列化参数直接给出 `_delayTime=0`、`_managedByScheduler=true`、`_dontBlockWave=false`、`_useMapPosition=true`、`_useTargetPosition=false`、`_skipCheckPoint=false`、`_useRandomDelay=true`、`_randomDelayRange=0.7`、`_randomOffsetBound=0.5`、`_passableMask=WALK_ONLY`、`_useOffsetForEach=false`、`_stopSummonIfHostDead=false`。这些是已知配置；并不意味着随机分布、随机抽取顺序或选格过程已经还原。

## 当前数据库配对

CN 数据入口 `data/ArknightsGameData/zh_CN/gamedata/levels/enemydata/enemy_database.json`。下表每行的两组 ID 都分别通过实际组件绑定，不凭后缀扩展。名称和数量来自各自 level 0 合并后的黑板；关卡已合并黑板优先。

| 敌人 ID（基础 / 强化） | 名称 | 生成 ID（同后缀配对） | 每次生成数 |
|---|---|---|---|
| `enemy_1195_sfyin` / `_2` | 磨砻 / 明鉴 | `enemy_1196_msfyin` / `_2` | 2 / 2 |
| `enemy_1197_sfshu` / `_2` | 俗心 / 雅气 | `enemy_1198_msfshu` / `_2` | 3 / 3 |
| `enemy_1199_sfjin` / `_2` | 身观 / 言省 | `enemy_1200_msfjin` / `_2` | 1 / 1 |
| `enemy_1201_sfzhi` / `_2` | 墨浪 / 心涛 | `enemy_1202_msfzhi` / `_2` | 15 / 15 |
| `enemy_1203_sfhu` / `_2` | 烹泉 / 沏虹 | `enemy_1204_msfhu` / `_2` | 4 / 4 |
| `enemy_1205_sfpin` / `_2` | 青花 / 赤霞 | `enemy_1206_msfpin` / `_2` | 1 / 1 |
| `enemy_1209_sfden` / `_2` | 清明 / 堂皇 | `enemy_1210_msfden` / `_2` | 1 / 1 |

[生成产物](../../web/enemy_death_spawn_data.js) 保存每个完整 ID、组件 pathID、脚本引用、黑板、模板参数及输入 SHA-256，便于逐条追溯。该数据配对不证明 JP/CN 所有机制版本相同。后续同轮已进一步恢复并接入下述子敌受击次数规则；护盾、隐匿和其他独立能力仍需分别取证。

## Verified：PropLikeEnemy 受击次数与类型限制

14 种子敌的根组件均实际绑定 `Torappu.Battle.PropLikeEnemy`，MonoScript pathID `-8226928637605576427`，同一 fileID 1 / common CAB。它们不是通过通用死亡 Buff 获得受击次数生命。生成器现在逐个核根对象及真实脚本，并在子敌数据中保留 `propLike.node` / `script` / 类型配置。所有这 14 个对象都配置 `_onlyAffectSpecificModeIndex=0`、`_hasSp=0`；无须猜当前模式是否满足条件。

原生 `PropLikeEnemy::DoApplyModifier`（method 64814，RVA `0x21fc51c`）默认分支完整可读，字段偏移与 metadata 对齐：`_acceptSpecificDamageType=+0x528`、`_acceptDamageType=+0x52c`、模式限制开关 `+0x538`。方法开头存在 XLua hotfix 分支，结论不覆盖未取得的在线覆盖代码。

```text
targetType == EP: 调用 Entity.DoApplyModifier
targetType == HP:
  若限制类型，且 damageType 既不是 PURE 也不是配置类型：拒绝
  若 modifier.finalDelta < 0：hp = hp - 1；modifier.appliedDelta = -1
  若 modifier.finalDelta >= 0：HP 不变
```

- `0x21fc5f0..0x21fc608` 按 modifier 目标类型分支。恢复的枚举默认值确认 `Modifier.TargetType.HP=0`、`SP=1`、`EP=5`。
- `0x21fc610..0x21fc660` 核类型开关、无条件接受 PURE，再比较配置类型。实际 `DamageType` 默认值为 NONE=0、PHYSICAL=1、MAGICAL=2、PURE=3、HEAL=4、ELEMENT=5。
- `0x21fc67c..0x21fc6b4` 取得 `finalDelta`，用 `FP.op_LessThan` 与 0 比较。
- `0x21fc6c0..0x21fc718` 读取当前 HP，用 `FP.op_Subtraction` 减去整数 1，写回 HP，并将 modifier 的 `+0x38` 写为 -1。因此是每个已接受的负 HP modifier 扣一点，不能按一次技能总伤害或基础攻击力换算次数；非负 HP modifier 不恢复 HP。
- `OnBorn`（`0x21fc910`）调用 `Enemy.OnBorn` 后创建表现特效，未另设命中计数器。本方法使用正常 HP 存储，不在受击时重置为数据库基础次数。当前关卡 HP 覆写/已有生命倍率继续作用于所需次数。

只有 `enemy_1204_msfhu`、`enemy_1204_msfhu_2`、`enemy_1206_msfpin`、`enemy_1206_msfpin_2` 启用类型限制，配置值都是 MAGICAL，因而接受法术/真实，拒绝物理和元素 HP 伤害。其余十个不限制类型。EP modifier 走基类，不能根据 HP 规则额外推导元素损伤免疫。

| 子敌 ID（基础 / `_2`） | CN level 0 的 HP，即无额外生命修正时的次数 |
|---|---|
| `enemy_1196_msfyin` | 2 / 3 |
| `enemy_1198_msfshu` | 3 / 4 |
| `enemy_1200_msfjin` | 30 / 35 |
| `enemy_1202_msfzhi` | 3 / 4 |
| `enemy_1204_msfhu` | 4 / 6 |
| `enemy_1206_msfpin` | 12 / 15 |
| `enemy_1210_msfden` | 35 / 45 |

原生 EP 基类的所有后续细节、可执行在线 hotfix，以及完整的属性修正顺序不由该小函数自动证明。每个源伤害 tick 是否生成独立 modifier 仍取决于其各自实现；本项目已有 tick 通路采用逐 tick 扣一点，不把所有来源时序一并标为原版已验证。

## 未解与本轮实施边界

`Execute` 的可读前缀到 `0x274cffc`，随后遇到不能连续解码的片段，未恢复后半段调度、空间选择和随机过程。运行时采用本项目种子随机数逐子敌取 `[0,0.7)` 延迟，并保留宿主死亡坐标；这是实现约定。尚未还原 0.5 范围散布、可通行格筛选、障碍附近的失败/回退、`_useOffsetForEach=false` 对随机调用次数的影响。不能把上述随机延迟分布或原地生成升级为 Verified。

本轮还尝试了 `EnemySkill` 公共调度：`Init`（`0x4dfc744`）和 `CastToTarget`（`0x4dfcb7c`）有部分可读调用，但 `CheckTrigger`（`0x4dfd158`）、`CheckAvailable`（`0x4dfd2cc`）和 `Tick`（`0x4dfd5ec`）未取得可用完整函数体。相关尝试保留在 `work/client-logic/native-enemy-scheduler/`。因此没有把整个敌方冷却、资格、多技能选择改成猜测实现；当前工作顺序仍由[统一计划](../plan.md)管理。

## 复现

```powershell
python -B tools/inspect_enemy_death_spawn.py
node tools/build_enemy_death_spawn.js --check
```

第一条只读取现有二进制与 metadata，写入 `work/client-logic/native-enemy-death-spawn/evidence.json`、`SummonEnemiesFollowMyRoute.Execute-prefix.asm` 及三个 `PropLikeEnemy.*.asm`；第二条核实际 prefab→脚本→模板→数据库映射与产物一致。生成产物用去掉 `--check` 的同一命令。均无需重新解包或执行官方客户端。
