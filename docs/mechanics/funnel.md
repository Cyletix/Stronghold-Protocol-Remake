# 浮游单元：客户端模式与原生过程

2026-09-14。本批把已有卡达 S2 的独立锁敌执行器扩为多单元，新增澄闪 S1/S2/S3 和洛洛 S2 主体。实现位于 `web/src/simulation/operator-combat.js`，能力配置由 `tools/build_basic_attacks.js` 生成；本机和房间 VM 共用。没有勾选完整技能、模组或整人验收。

## 证据和版本边界

**Verified（静态客户端字段及可读原生分支）**：本地 JP 36.7.22 的 `work/main.obb`、`work/apk-extracted/lib/arm64-v8a/libil2cpp.so`。原生文件 SHA256 为 `d95820e25938778b8865571741c7d626d70662f82bc5bb3badf058fbd1e595af`。这些函数入口含 XLua 覆盖分支；本批分析的是覆盖为空时实际执行的原生分支，尚未证明运行客户端没有替换它们。

角色组件从 `assets/AB/Android/charpack/` 提取，结果在 `work/client-logic/funnel-charpacks/`。角色 AB SHA256：

| 角色 | AB SHA256 |
|---|---|
| `char_328_cammou` | `32d345dd46a1916660bb6b07e5e5e59aaf7501cd985d2701a5fa962a903c015a` |
| `char_377_gdglow` | `197a74145bdcf72f8f6d7db2b950ccb800b8a6981bd16e037ab3e1f58047d52e` |
| `char_4040_rockr` | `1f1cf8ff648ed6bd2209e7b5657a149192c37eaad7812e84ae7eabac07038982` |

运行等级数值仍取本地 CN 源表；`skill_table.json` SHA256 为 `9eaaecacd024b8e2177ddb44e0c306bed609b53ef79d2e6446dda9dae49d6435`，`character_table.json` 为 `05fddd1e746d66be22580b51e9e44be75b38aef95169477b2e55150b89a2fed7`。JP 角色模式、技能黑板用途与本批 CN 字段能够对应；这不证明两个版本其他角色或所有更新一致。

## 从调用和对象引用得到的规则

技能 prefab 的 `SwitchMode` 指向角色模式。澄闪模式 1、2、3 的 `_funnelActions` 长度为 2、2、3；S1/S2 的 `_projectileKey` 有本体弹，S3 为空。三个模式覆盖原来的 `gdglow_tr` 自动附带浮游攻击，避免把放飞单元再算作一次本体附加命中。洛洛模式 1 只有一个 `S2Funnel`，没有澄闪的自爆组件，不能把“多单元/自爆”作为洛洛的待办说明。

澄闪自爆采用原生调用链 `GdglowHitBehaviour.DealHitTarget`（RVA `0x24190b4`）→ `RandomExtensions.DicePRD`（`0x32aa7b4`）。它在普通浮游伤害前判定；成功分支产生爆炸弹并停止当前浮游弹，没有再结算该次普通浮游伤害。PRD 以浮游 ability 为键：失败计数加一后乘源系数 `0.015`；第 40 次保底不再抽取随机数；成功清零。它不是每次固定 10% 或固定 1.5%。澄闪天赋不再被旧描述分类器错误处理为常驻攻击力增幅。

自爆仅用于技能期间的放飞单元。默认模式 `-3379071882326323409` 的普攻弹体为 `projectile_chr_gdglow`，独立 `Funnel` ability `-5924025960506339537` 使用 `projectile_chr_gdglow_funnel`；该基础浮游弹体及其 `_logic` 都没有 `GdglowHitBehaviour`。基础特性 `gdglow_tr` 只有事件19触发 `Funnel`，没有概率动作。角色数据流节点 `4617819122343005999` 把天赋的 `attack@prob` / `attack@atk_scale_2` 传往 `_target=1`（`UnitDataFlowConfig.DataType.SKILL`），放飞弹体才挂上述命中行为。这与当前CN四份天赋描述均限定“技能开启后”一致；基础普攻不自爆是正确行为，不是待补缺口。

`[uc]projectiles.ab` 的 `projectile_chr_gdglow_funnel_s12_3` 与 `projectile_chr_gdglow_funnel_s3_4` 使用 1.1 半径碰撞体，`_onlyCheckHitWhenStop=1`，移动组件立即到达并延迟约 0.32 秒停止；动作伤害倍率取 `atk_scale_2`，可以波及初始锁敌范围之外及隐匿邻敌。`MultiFunnelTrait.SetFunnelAtkScale`（`0x2574bcc`）按 ability 保存各自上次目标和命中层数；更换目标归零，目标相同递增。`OnProjectileStop` 保留相应目标/倍率数据，因此自爆后再次锁到同一目标不会单凭自爆把伤害层数清零。

洛洛 `rockr_s_2[overload]` 在过载开始时提高浮游伤害上限，并只在此阶段增加本体攻击力；结束动作把过载 buff 已存在时间写为眩晕时长。`BasicSkill.get_overloadRatio`（`0x2102de0`）在过载技能原生分支返回 0.5，本批 40 秒技能从第 20 秒进入过载。`MultiFunnelTrait.UpdateMaxAtkScaleMultiplier`（`0x25755cc`）同时把最大层数改为 `ceil((基础上限 × 倍率 − 初始倍率) / 每层增量)`；只扩大上限却仍把层数锁在六层，会令过载永远达不到上限。基础无模组最高为 2.2 倍。提前结束仅按实际进入过载后的时长眩晕；完整释放为 20 秒。

上述反汇编保留在 `work/client-logic/metadata/asm/`，对应方法索引为 72076–72079、19830、77103、77108–77112、60761、60845。源方法、组件引用、黑板和仿真测试承担不同证据角色；本项目测试只证明执行器满足本批明确断言。

## 已接行为和剩余边界

- 卡达 S2 保留独立锁敌、范围内重新放飞、持续攻击范围外旧目标、概率眩晕、死亡与技能结束清理。
- 澄闪 S1/S2 有两个独立单元，S2 使用源扩大范围并无限持续；S3 停止本体攻击、三个单元全战场索敌，普通单元命中附带 0.5 秒停顿。持续锁定不会被后来更近的目标抢走；本体不能行动时已有锁定继续，新锁定等待本体恢复。
- 澄闪四份无模组自爆天赋候选按当前养成用于技能期间放飞单元；未开技能的基础附带浮游不自爆。两份法抗穿透候选同时用于本体、单元和自爆法伤；物理伤害不受影响。
- 洛洛 S2 的攻速贯穿两个阶段；攻击加成、浮游上限提高仅发生在过载阶段。基础“立于磐石”按源 15 秒间隔叠加，死亡/再部署重新计时。自动战斗仍按项目现有规则自动施放；没有另加手动关闭技能的 UI。

**尚未完成**：浮游飞出/返回和重新放飞的原版精确时序、技能结束后多单元倍率回传顺序、部署和技能切换之间 PRD key 的完整生命周期、攻击速度中途变化时的进度继承、全部异常状态交互、原版仇恨排序及敌人碰撞形状、默认模组与其他模组的精确特性/天赋替换、完整盟约和两装备组合。当前首次命中即时、再次放飞沿用一个攻击间隔；爆炸缓存触发时攻击力并在原地延迟结算。不能把这些约定当作已还原的客户端帧序。简易多单元菱形提示未做实机画面验收。

验证：`node tools/_funnel_smoke.js` 核澄闪 30 份技能、洛洛 S2 十级、10 份基础天赋候选；断言实际伤害、每单元锁敌/层数/PRD、40 次保底与 RNG 调用数、自爆替代普通命中/延迟/半径/对空/隐匿溅射、全图目标资格、过载半程和实际眩晕时长、穿透、退场/再部署及签名恢复。另以40次实际普通攻击核本体与附带浮游叠层，禁止调用自爆PRD并确认无爆炸。`node tools/_click_smoke.js` 保留卡达十级与两次签名恢复。恢复断言比较全部战斗逻辑字段与逻辑 RNG；纯表现 `particles` 使用既有 `Math.random()`，单独排除，未改变游戏随机序列。
