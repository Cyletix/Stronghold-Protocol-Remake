# JP 36.7.22 敌群替换原生取证

2026-09-14。证据来源是本地 APK 提取的 ARM64 `libil2cpp.so`，不是本项目仿真。

- 文件：`work/apk-extracted/lib/arm64-v8a/libil2cpp.so`
- SHA256：`d95820e25938778b8865571741c7d626d70662f82bc5bb3badf058fbd1e595af`
- CodeRegistration RVA `0xa177248`；MetadataRegistration RVA `0xa462ae0`。
- 方法名称通过恢复后的 metadata / assembly / method token 映射；字段偏移从 MetadataRegistration 的 fieldOffsets 表读取。
- 复现：`python -B tools/inspect_autochess_native.py --type AutoChessLevelEnemyManager --type Torappu.AutoChessData --type Torappu.ActAutoChessData --type Torappu.LevelData --type Torappu.EnemyDatabase --type Torappu.AttributesData`
- 工具输出 `signatures.json`、`layouts.json`、逐方法 `.asm`、`index.json`。不执行或修改客户端。

## Verified：已确定的原生算法

以下均限定于所检 APK 的默认原生分支。方法开头都有 XLua hotfix 分支；未证明实际在线客户端没有相应覆盖。

### 属性强度、数量和刷新间隔

`RandomEnemyGenerater::_GetEnemyAttrPower` (`0x22db944`，method index 67292)：

```text
P = ((HP * enemyMaxHpFactor + ATK * enemyAtkFactor)
     + DEF * enemyDefFactor) + MR * enemyMagicResistanceFactor
```

证据：`0x22dbb74` 读取常量 `+0x74/+0x78`，`0x22dbb80` 读取 `+0x7c`，`0x22dbb94` / `0x22dbc80` 读取 `+0x80`；`0x22dbc90..0x22dbca8` 依次 float32 乘加。这四个字段偏移已与 `AutoChessConstData` 的 fieldOffsets 对齐。

属性来源先遍历 `levelData` 敌人数据，匹配 `EnemyData.key` 或 `get_keyInLevel()`，使用该关卡的 `AttributesData`（其 HP/ATK/DEF/MR 偏移 `0x10/0x24/0x38/0x4c` 已独立确认）。找不到时从 `randomEnemyAttributeDict` 取得 `level`，调用 `EnemyDatabase::GetEnemyLevelData(enemyKey, level, ...)`。未找到 entry 时返回 0。因此正式接线必须尊重关卡覆写，不能直接取全局基础敌人值。另一方面，fallback 不使用 `enemyDataLevelId` 专用关卡的额外覆写；例如本地 CN 数据的 `enemy_10067_ftsjc` / `enemy_1439_dslntf` 在该专用关卡有 atk=400。数量计算 fallback 需单独导出未合并此覆写的 `quantityAttributes`，与实际作战的 `encounters.enemies` 区分。

`_CalculateActionBattleEffectiveness` (`0x22db668`，67293)：

```text
BE = (P * actionData.count) / entry.enemyBattleEffectivenessFactor
```

证据：`0x22db718..0x22db740` 调用 P，读取 action `+0x20` count、entry `+0x2c` factor，执行 `fmul` 后 `fdiv`。缺少 entry 返回 0。`enemyBattleEffectivenessFactor` 是分母，不是属性倍率或奖励积分倍率。

`_CalculateEnemyCountByBattleEffectiveness` (`0x22db75c`，67294)：

```text
unit = P_new / factor_new
if no entry or unit == 0: return 0
count = clamp(roundToEven(BE_origin / unit), minReplacedEnemyCount, maxReplacedEnemyCount)
```

证据：`0x22db828..0x22db860` 两次 float32 除法；`0x22db874..0x22db8fc` 转 double 后对恰好半整数检查整数部分奇偶，实施银行家舍入；`0x22db924..0x22db938` min/max clamp。不是 `Math.round`。零 unit 在 min clamp 之前返回 0；factor 为 0 与 unit 为 0 不是同一种情况。

`_DoReplaceActionDataClient` (`0x22db1ec`，67291)：

```text
oldDuration = float32(oldCount * oldInterval)
newCount = countByBattleEffectiveness(...)
action.key = replacement.enemyKey
action.count = newCount
action.interval = float32(oldDuration / newCount)
```

证据：`0x22db410..0x22db454`。它保留的是 count × interval，而非 (count − 1) × interval。实际 float32 相乘与相除后只在浮点精度内保持，不应测试任意十进制下精确实数相等。

### 模板类型与空地一致性

`_InitData` (`0x22d9564`) 将 constData 的 Normal/NormalFly/Elite/EliteFly/Special/SpecialFly 模板键映射成 0/1/2/3/4/5（`0x22d9670..0x22d96fc`）。`_GetTemplateEnemyAttr` (`0x22db500`) 对 0/1 从 `m_randomNormalEnemyResult[round]` 取键、2/3 从 elite 结果取键、4/5 从 special 结果取键，再从 randomEnemyAttributeDict 取 entry。

`_DoReplaceActionDataClient` 的 `0x22db2f4..0x22db3c8` 用位掩码 `0x15` 分开 0/2/4 与 1/3/5：地面模板只接受 `isFlyEnemy=false`，飞行模板只接受 `true`；失败返回 false。

### 特殊/随从动作模板

`_GetSpEnemyActionData` (`0x22d6b84`，67270) 的 metadata 参数原名是：

```text
enemyKey, originActionDatas, isToken, out actionIndex
```

先通过 `_GetEnemyEntry` (`0x22d6d38`) 查询 `m_gameData.randomEnemyAttributeDict[enemyKey]`。

| isToken | entry.isFlyEnemy | 选用常量字段 | 偏移 |
| --- | --- | --- | --- |
| false | false | templateEnemyNormal | 0x28 |
| false | true | templateEnemyNormalFly | 0x40 |
| true | false | templateEnemyToken | 0x58 |
| true | true | templateEnemyTokenFly | 0x60 |

证据：`0x22d6c48..0x22d6c94`。然后按顺序比较 action 的 `key` 与所选模板键，取首个匹配并设置输出索引（`0x22d6c94..0x22d6ce4`、`0x22d6d10..0x22d6d30`）。未找到 entry/匹配则 index=0，调用带 index=0/default=null 的边界安全集合访问（`0x22d6ce8..0x22d6d0c`）。集合为空/不存在时返回 null。`0x52fbd3c` 自身已反汇编确认空对象、负索引或越界都会返回 default。这不是“随便找特殊模板”；普通特殊援军走 normal 模板，token 走 token 模板。

### 实际动作回填

`_ApplyRealActionData` (`0x22d6a70`，67269) 的参数原名为 `realActionDatas, levelData`。它走 levelData `+0x80` 的首个 wave、wave `+0x20` 的首个 fragment，把转换后的 realActionDatas 写到 fragment `+0x18`。同样布局在 `_DoReplaceLevelDataClient` (`0x22daf50`) 明确使用数组首元素。

`_DoReplaceLevelDataClient` 从第 0 wave / 第 0 fragment 的 actions 开始倒序调用 `_DoReplaceActionDataClient`。如果返回 false 且该 action 仍是模板，清 action `+0x5e`。元数据字段顺序及相邻代码支持该字段为 `isValid`，但该类 fieldOffsets 被保护，此具体字段名暂记 Inferred。`ShouldActionUpToServer` (`0x22d7cd0`) 在 `0x22d7d3c..0x22d7d5c` 明确拒绝这个字节为 0 的动作，亦拒绝 boss、非 SPAWN 和 hiddenGroup 非空项。不能把失败替换保留为真正出场的占位敌人。

## Verified：逐轮特训类型与实际敌人池

`GenerateRandomEnemyData` (`0x22d5994`) 参数原名是 `roundEnemies, roundEnemyData, allBattleLevelIds`。顺序为 `_InitData` → `_GenerateSpecialEnemyTypes(roundEnemies)` → `_GenerateRandomEnemyData()` → `_GenerateRoundEnemyData(roundEnemyData, allBattleLevelIds)`。

### 类型排期

`_GenerateSpecialEnemyTypes` (`0x22d9704`)：若传入 roundEnemies 空/不存在，走本地排期；否则先生成 `maxLevelCnt` 个默认 `enemyTypeIdentifierToFillRandom`，遍历输入记录，用记录 `round-1` 索引覆盖 `enemyType`。这里的输入包含逐轮类型，不是仅三个显示图标。

本地 `_GenerateSpecialEnemyTypesLocal` (`0x22da834`)：

1. 依 `enemyTypeDatas` 枚举顺序收集 `involveRandom=true` 的类型。
2. 调用 `RandomExtensions.Shuffle`，随后 `CollectionExtensions.Resize(specialEnemyNum)`。这两个方法名通过调用点 IL2CPP metadata usage token → methodSpec → metadata method 声明直接解析，见 `helper-evidence.json`；不是猜测名称。未使用 `specialEnemyRandomTypeDict.weight`。
3. 对每个选中类型，查活动 `specialEnemyRandomTypeDict[type]`，按其 `count` 次数追加 `typeIdentifier`。
4. 超过 `maxLevelCnt` 则记录错误后截断并直接返回；否则补默认 identifier 到 maxLevelCnt，再洗牌类型排期。

本地源 CN `maxLevelCnt=15`、`specialEnemyNum=3`、六个随机类型的 count 均为 3，所以通常得到三个不同特训类型各 3 轮，余下 6 轮为默认 SPECIAL。该数值来自源数据，不是 JP 原生代码硬编码。

首次 Shuffle 名称 Verified；泛型重载体 `0x5438a8c` 可见从 i=0 到 min(requestedCount, Count)-1，取 Range(i, Count) 并交换两项，但该具体值类型实例与当前引用类型实例尚未逐表绑定。最终整数列表洗牌的 methodSpec 区域仍未解析。本实现使用向前 Fisher–Yates 及注入 PRNG，随机序列与原版逐值一致性属于明确未验证范围；类型选择/次数/补齐规则已证实，不因此阻塞运行端实现。

### 逐轮实际池

`_GenerateRandomEnemyData` (`0x22d99dc`) 对 index=0..maxLevelCnt-1：

1. 读取上述类型排期 index；identifier=0 直接略过。
2. 按活动 `specialEnemyInfoDict` 原有字典枚举順序取候选，查其 `type` 对应公共类型，要求 `typeIdentifier` 等于当轮 identifier。
3. 排除当前模式 `inactiveEnemyKey` 中的 **字典 key**，并要求 entry `isInFirstHalf == (index < trunc(maxLevelCnt/2))`。字段偏移分别由 `ActAutoChessModeData +0x90`、`ActAutochessSpecialEnemyEntry +0x24`、`AutoChessEnemyTypeData +0x38` 对齐。本地 15 轮数据前半为第 1–7 轮，后半为第 8–15 轮。
4. 非空候选调用 `UniformWithWeight` (`0x543a99c`)，将选中 entry `specialEnemyKey` 写到 `m_randomSpecialEnemyResult[index+1]`。
5. 查所选 entry，分别从非空 `attachedNormalEnemyKeys` / `attachedEliteEnemyKeys` 用 `RandomExtensions.Range(0, Count)` 各取一个，写到 normal/elite 字典相同轮号。单元素列表也进行一次随机调用；空列表不调用。不从整个随从大池另抽。

`UniformWithWeight` 方法名通过 slot `0xa5f4100` → storage `0xaaca500` → encoded `0xc0078b41` → methodSpec 247200 → method 19828 验证。entry `get_weightValue` (`0x39b1ae8`) 读取 `randomWeight` `+0x20` 并转 float。helper 按 float32 顺序加权求和，取 Range(0,total)，从头判断 `MathUtil.LE(ticket,weight)`、不命中则 float32 减权；末端兜底最后一项。`MathUtil.LE` (`0x7b91908`) 是 `ticket <= float32(weight + epsilon)`，epsilon 在 RVA `0x8057228` 为 float32(1e-5)。Range(float) 先将 PRNG 的 double Value 转 float，再执行 `float32(float32((max-min)*value)+min)`；整数 Range 委托给 PRNG。

## Inferred / 未完成范围

- `levelData.waves[0].fragments[0].actions = realActionDatas.ToArray()` 的字段语义及 ToArray 名称与调用布局一致；但 `List<T>.ToArray` 共享体 `0x5c203ec` 和 `List<T>.get_Item` 共享体 `0x5c1dfb0` 所在区域不能正常反汇编。原生写入路径 Verified，原始 C# 表达式只作为等价解释。
- 三类类型如何显示/向服务器发送、运行时 token/extraEnemyKeyList 的插入条件和特殊援军数量仍未完整移植。
- metadataDeclarations 不等于完整 C# 源码。主提取器统计 82 个 codegen module 中 28 个未解析/未支持，不能全部称为加密（其中 `__Generated` 名称可读但没有 `.dll` 后缀；本工具支持这个名称）。若干 fieldOffsets 显示 `0x3030...`，工具标为 `protected-or-invalid`。名称/指针存在也不证明全部方法体已解密。
- 目前仅检查该 JP 快照，不能无条件等同当前 CN/后续客户端；本轮未检查热更新覆盖。

## 实现与验收

实现位于 `web/src/simulation/enemy-replacement.js`，已接入正式 `battleSourceForRun`；可从 Node require 或浏览器 `ArkEnemyReplacement` 使用。第1–15轮读取持久化敌群计划进行六模板替换，计划之外的回合保留原关卡；首领的实际轮次仍由各模式源配置决定，非模板首领动作不变。逐次使用 `Math.fround` 对齐 ARM 的 float32 运算顺序。`replaceAction` 拒绝非有限预算/间隔或非正 count，避免 JSON.stringify 将 Infinity/NaN 静默存成 null；这是复刻端明确的数据完整性边界，不冒充客户端的额外保护。

API：`generatePlan(encounters, seasonId, modeId, {random, roundEnemies?, selectedTypes?})` 返回持久化友好的 `{version:1, seasonId, modeId, selectedTypes, roundTypes, rounds, missingRounds, randomConvention}`；rounds 的每轮记录包含 `round, typeIdentifier, typeKey, specialEntryKey, specialKey, normalKey, eliteKey`。random 必须显式注入。`roundEnemies` 使用已证实输入分支；`selectedTypes` 是调用方固定训练选择的实现约定，不冒充已证实的官方训练入口。

`applyToSource(source, roundRecord, encounters)` 只改首 wave / 首 fragment 六模板，移除缺目标/空地不符的模板 SPAWN，保留非模板与后续 fragment/wave，保持输入不变。数量属性优先 `source.enemies[key].sourceAttributes`，再取 `encounters.quantityAttributes[key]`；实际敌人对象则优先 source，再取 encounters.enemies。它不猜 token/extraEnemy 的附加生成。

`node tools/_enemy_replacement_smoke.js` 已通过：四属性权重、factor 分母、银行家舍入、float32 边界、上下限、缺 entry/零 unit、非有限 JSON 拒绝、间隔守恒、空地/token 模板选择、加权 epsilon、奇数轮前后半、禁用、固定排期与关卡覆写优先级。

`node tools/_enemy_plan_source_smoke.js` 已通过：16 个赛季/模式计划，5115 个关卡/轮次组合、26325 个模板动作决策；全部第一 fragment 的模板都被替换成明确抽中目标或删除，非模板/其他 fragment 未变、输入未变、结果可 JSON 序列化、计划可确定性重建。测试验证移植代码，不作为原版行为证据。

`node tools/_enemy_runtime_smoke.js` 验证正式15轮接线、预览不耗RNG、计划损坏拒绝、原休整档无重抽迁移、多人共享敌潮种子与签名恢复。`roomRestore`、客户端同步和休整地图目录都重建本轮替换后的敌人定义；专项重现专用覆写敌人恢复前后攻击力400不变，避免回退数据库800后影响后续出怪。

单人开局、房间和存档使用同一 enemySeed 生成并持久化计划；恢复后沿用原计划。种子 PRNG 与向前 Fisher–Yates 是本项目实现约定；客户端确定的三类型、按 count 展开、补齐、洗牌调用、前后半候选与权重语义另有原生证据。两者不能合并标为“原版种子完全复现”。下一步研究范围收窄为原生 hotfix/具体随机重载与服务器交互、token/额外随从和特殊支援动作，不再把整个敌群数量/池分配当作未知。
