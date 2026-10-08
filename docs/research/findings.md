# 研究证据索引

2026-09-18补充：[实际卫戍池的平铺动作配送](../mechanics/enemy-basic-actions.md#实际卫戍池的平铺动作配送2026-09-18)。源MeleeAttack可以具有远程选敌范围，旧运行分支却按射程生成弹体；这两项不能混为一谈。现沿完整缓存根与唯一类型批量输出直接/弹体合同，仅接实际池111敌，未改变专用模式/链式/Boss归属。配置观察、共享映射推断和本地验证分开记录；没有新增整敌验收或重新提取APP。

2026-09-18补充：[普攻动作与行走冷却分离](../mechanics/enemy-basic-actions.md#普攻动作与行走冷却分离2026-09-18)。普通攻击的动作总长曾被社区模型强制拉长到攻击间隔，导致有目标时连续原地攻击。复用已读`AbstractAnimatedAbility`原生缩放分支和完整源`_maxAnimScale`字段，按动作类批量消费；妖怪MKII源为1秒动作、3秒间隔。来源、原生分支与跨快照边界见[证据文件](../../work/enemy-animation-playback-evidence.json)。旧飞行阻挡测试人为设置长冷却后的移动不能证明自然战斗行进，本轮已改为真实自然循环回归。

2026-09-17补充：[限时攻击与治疗模式](../mechanics/operator-mechanics.md#限时攻击与治疗模式2026-09-17)。已有完整角色/技能图归为同一模式适配组，批量接入芳汀 S1/S2、波登可 S1、普罗旺斯 S2 共40级；属性复用公共 Buff 程序，模式快照独立于在途攻击。敌人标签从实际数据库字段继承，不从飞行状态推测。原生动作帧/完整仇恨、波登可治疗弹道及天赋模组组合保留明确未核边界；完整冻结来源见[源合同](../../work/operator-mode-next-group.json)。

2026-09-15补充：[下一击强化共用执行器](../mechanics/operator-mechanics.md#2026-09-15-下一击强化的共用执行器)、[固定生命回复属性](../mechanics/common-buffs.md#2026-09-15-固定生命回复属性)与[大剑组首攻/连攻](../mechanics/enemy-skills.md#大剑组首次与连续攻击2026-09-15)。从已保存完整图批量接入暴行/山/隐德来希/海霓S1与角峰S1，参数/身份由脚本展开；大剑两变体补读共用动画供应器原生方法并缓存。源字段、执行桥接、精确时序及完整天赋/模组未核边界分别记录，限定主体通过不等于整技能或整敌完成。

2026-09-15补充：[掠海漂移体悬浮与落地](../mechanics/enemy-skills.md#掠海漂移体悬浮与落地2026-09-15)。已接模式所属悬浮 Buff 的控制禁用→落地近战，并核附带侵蚀损伤；动态地形和原生特效仍保留。原生技能装配分支证明未匹配数据的 `RecoverAnim` 默认禁用，已从可执行派工移入源入口未启用，不将预制体存在当作自动施法依据。完整静态源、推断桥接和验证分别记录。

2026-09-15补充：[暴鸰参数](../mechanics/enemy-skills.md#暴鸰参数修正2026-09-15)。复用已保存的完整技能组、JP弹体和有出处的Spine，确认0.2666667秒出手、3×3方形和MOVE_SPEED倍率区+2；原前摇0.45秒和×2已修正。新增BuffAfterAffecting基础分支证据；BombdMovement两个函数仍不可读，保留旧飞行与加速时点近似，不勾完整技能。六入口与哈希见[源记录](../../work/enemy-bomb-contract.json)。

2026-09-15纠正：[卫戍出场优先范围](enemy-mode-dispatch.md#卫戍出场优先范围)。原 `enemy_encounters.json.enemies` 为通用属性合并目录，不能代表实际出场池；旧批次关于池内数量的结论按新范围回执重算。杰斯顿仅找到未确认实际启用的悬赏声明，退出卫戍优先开发。范围投影保留逐字段来源和哈希，原公共实现、稳定 ID 与验收不删除；本轮改的是派工与统计，没有新增战斗机制。

2026-09-15补充：[攻击回复 SP 与带 Buff 的标签远程技能](../mechanics/enemy-skills.md#攻击回复-sp-与带-buff-的标签远程技能)。完整 IronSandStorm 组连接 owner 攻击回复、地面/标签选择器、范围、动画、弹体及加载后的眩晕定义。新原生证明成功施法输出仅首次发 SP 事件，技能注册期由 SP_RECOVER_STOPPED 阻断；不是按命中回复，也不是原生事件仅限普攻。`loadFromDB=1` 后的 stun 可闪避且接受状态抗性，不能使用 prefab 占位值；范围以 owner 模式半径覆盖初始 collider，不能多加半格。[完整合同](../../work/enemy-tagged-ranged-contract.json)保存来源与哈希，Buff 叠加、寿命结束映射、仇恨及实体接口等仍保留 Inferred。

2026-09-15补充：[冷却型范围近战技能](../mechanics/enemy-skills.md#冷却型范围近战技能)。完整 CircleAttack 已接回共享调度。新原生证据纠正三点：通用 EnemySkill 在成功起手时重置技能冷却；FROM_ATTACK_SPEED 的时长比例为 `clamp(owner.attackTime / 原动画时长, 0.1, 1)`；基类在原 inputTarget 不在新名单时以它替换末项，而非单纯追加。完整配置、范围覆盖参数、动画 2.0667 秒及 OnAttack 0.6333 秒见[范围近战合同](../../work/enemy-area-melee-contract.json)。Melee 覆写不可读，输入实体与目标排序、计时期间行为及动态攻速更新的推断边界保留；旧合同哈希不改，但旧“非零技能冷却从结束起算”说明已撤销。

2026-09-15补充：[模式周期事件与具名能力](../mechanics/enemy-skills.md#模式周期事件与具名能力)。两种收割者模式 1 的完整组已接入：移速 MULTIPLIER +5 是单独 ×6；每秒最大 HP 4% 自伤可致死；Scream 源圆形半径 2.5、零普通伤害、独立神经损伤；普通攻击 EP 由独立节点产生，不重复补造成伤害监听。[周期合同](../../work/enemy-periodic-ability-contract.json)单独冻结新几何和原生证据，保留 EP 完整公式、直接能力内部调度及同时点顺序的推断边界。未修改旧苏醒合同，也未把这两组算成新 EnemySkill 或整敌完成。

2026-09-14补充：[HP 监听与自身施法](../mechanics/enemy-skills.md#hp-监听器与自身苏醒施法)。完整睡行 Buff、真实枚举默认值、HP 显式调用和动画时长已闭合；异常 11 为 DISARMED，UNBALANCE 为独立 FSM 状态 9，30 秒仅解除不能移动。read/奇美拉组的当前卫戍环境入口已冻结为暂缓原因，不能把敌人身份命中当技能可触发。[苏醒合同](../../work/enemy-awake-contract.json)保存源版本、哈希、新原生入口与模式清理/异常中断边界。

2026-09-14补充：[敌人共享 SP 与技能调度](../mechanics/enemy-skills.md)。实际充能源来自四个普通动作的 ON_SPELL_ON Buff，自动回复增量为 0；原生在能力起手前扣 owner SP，成功发起后计数。完整字段、事件与选择器枚举以及新不可读入口固定在 [SP 合同](../../work/enemy-skill-sp-contract.json)，首次发弹桥接、选敌消歧、冷却与模式取消仍单独标为 Inferred。

2026-09-14补充：[敌方链式弹体公共合同](enemy-chain-projectiles.md)。从固定卫戍缺口中选择链式命中与失效回调，批量接同构无命中 Buff 组；完整源参数、元素枚举、跨版本与执行推断分别保存。池内优先级、模式属性和技能调度评估已冻结，后续按公共合同表派工。

2026-09-14补充：[HP 开关与同源黑板合同](enemy-mode-dispatch.md#hp-开关与同源黑板合同)。已确认 `hp_ratio` 覆写一侧阈值、`delay` 读取、初始开关与首次变化 latch，以及带容差的 Between 边界。`rage` 天赋命名空间、`1e-5` 数值近似和最终伤害事件位置分别保留 Inferred；同一 provider 的切换与属性/伤害 Buff 必须一起消费。DamageScale 默认键和缺值 1 已取得原生证据，新增不可读入口固定缓存，不重复解码。

2026-09-14补充：[阻挡开关原生合同](enemy-mode-dispatch.md#阻挡开关原生合同)。SwitchMode 已确认读取 `mode`、失败回退字面索引、恢复目标默认模式优先，以及同模式不重启和 FSM 重启调用顺序；Enemy 阻挡检查取真实 blocker 的 0/1，`cnt` 只覆写阈值。Tim 的 `mode_index`、默认 0 和目标回退近似不能替代这些原生规则。三敌的自身 Buff 目标、provider 挂载/移除及 carrier 沉默恢复明确记为 Inferred；新不可读入口已固定列出，不重复解码。

2026-09-14补充：[七类模式合同与统一推进](enemy-mode-dispatch.md#七类合同与统一推进)。原七类已补成带输入、触发链、公共算子和验收边界的固定表；所需 Buff 图按去重键从同一 CN 来源数据库统一接回。“当前模式缓存没有动作图”不再作为数据库缺源结论。完整事件/兄弟动作保留，参数候选与运行时派发仍分别记录。

2026-09-14补充：[敌人模式归属与公共执行](enemy-mode-dispatch.md)。紧凑导出遗漏的 Unity 层级已从既有完整逻辑库连接，不再把缺入边当无天赋依据；模式内动作与受约束出生模式已批量接入。原生默认索引规则、跨版本推断、复活/开关复合链与不可读方法分别保存，后续使用[固定模式表](../generated/enemy-mode-dispatch.md)。

2026-09-14补充：[显式模型资源映射补源](enemy-animation-supplement.md)与[按能力类型选择攻击事件](../mechanics/enemy-basic-actions.md)。文件名不匹配不代表缺资源，已沿 assetId/assetList 一次关联冻结缺口。普通单次施法与固定事件连击分别消费；原统计中“单个动画事件就算单击”“阶段时序相同就算完整”已撤销。连击次数来自配置观察和公共实现推断，不宣称不可读的 Multi 原生方法已恢复。

2026-09-14补充：[普通动作通道与事件门控](../mechanics/enemy-basic-actions.md)。近战接触与远程动作按独立源引用消费，仅合并所有模式一致的通道合同；原生等待 ON_ATTACK_EVENT 分支跳过配置预延迟。卫戍的始海穿刺者、萨卡兹百夫长两个门控缺口已接通，其他动作类别仍以当前表为准。

2026-09-14补充：[敌人普攻能力与根能力分表](enemy-attack-capabilities.md)。数据库显式 `applyWay=NONE` 按等级继承后接入通用普攻开关；未定义默认值不算证据。原根动作集合按模式通道与字段家族固定归类，不再把无普攻单位派为动画缺口，技能和被动仍独立跟踪。

2026-09-14新增：[R25 客户端逻辑批量提取](client-logic-pipeline.md)。已从本地APK/OBB读出893技能预制体、7522 Buff事件动作模板，以及经结构校验的metadata和部分原生函数。旧“8字节XOR尝试失败”不再作为代码不可获取的依据。来源、哈希、未覆盖区域和跨版本边界详见专题。

2026-09-14新增：[R26 敌群替换原生规则](enemy-replacement-native.md)。所查JP原生分支确认四属性加权强度、`enemyBattleEffectivenessFactor` 作分母、数量按银行家舍入及保留 `count × interval`，另确认三类次数与逐轮池条件。已接持久化计划、正式预览/波次、多人共享种子；具体原版随机序列、特殊援军与热修/服务端覆盖仍单列核查。

复核日期：2026-09-14。下文保留各次观察的日期与证据等级；标为“历史/已替代”的实现排查不能再作当前待办。当前数据消费边界见 [data-inventory.md](data-inventory.md#priority)，逐项验收见[实施清单](../checklists/README.md)。整理前完整实验过程、样本和失败记录见[原研究记录](../archive/20260908/docs/findings.md)。

当前研究先沿源表ID、已提取的角色/敌人/弹体组件、顺序Buff动作和原生方法追踪行为，按共用机制批量复用。旧文案/录像结论保留为交叉证据；旧检索未命中不等于现在没有原始实现入口。尚未分析的领域与可直接读取的方法见[原生领域入口](native-domain-entrypoints.md)。

## 证据含义

**源表事实**仅证明所核对快照中存在该字段/数值；**客户端行为证据**须有可定位的录像/日志/资源逻辑；**推断**说明依据与缺失验证；**实现验证**只证明本项目。不得用本项目函数、smoke通过或社区页面单独证明客户端行为。

| ID | 结论与证据位置 | 等级与边界 |
|---|---|---|
| R01 | 本地activity_table的activity.AUTOCHESS_SEASON/versionInfoDict含act1autochess、act2autochess；mode_rules保留两赛季 | 源表事实。act1vautochess命名不证明其官方赛季归属；上下半不能仅按ID推定 |
| R02 | charShopChessDatas链接normal/golden棋子status，含evolvePhase/charLevel/skillLevel/equipLevel；build_mode_rules.js保留源SHA256 | 源表事实。233配置非233独立干员；早期115名册对照是历史范围。当前固定招募按两季95/112槽隔离，见[数据清单](data-inventory.md)；固定等级见[玩法契约](../spec/mode-spec.md) |
| R03 | character_table.phases.attributesKeyFrames/rangeId与talents候选含阶段、等级、潜能条件；cultivateEffectList含4档账号加成 | 源表事实。230组属性对照是本项目实现验证，不证明所有加成顺序/潜能继承已还原 |
| R04 | stage_table.tiles.tile_achand说明为手牌待部署区；地图mapData保存tileKey/通行/部署/高度等 | 源表事实。路线实际行范围见R12；预览区用途、镜头13×7及完整联防流程仍是推断/用户目标 |
| R05 | mode_rules.seasons.*.battleData/stages保留16模式记录与阶段数据；isSpPrepare已与客户端教程/录像对应本轮特殊休整 | 源表事实与局部行为证据。事件/候选池关联、动态分支等仍未贯通，不能由genWaves反证 |
| R06 | 模式指定技能、模组等级和blackboard可在本地表追溯；enemy_database保存技能/天赋key；当前另有全部技能等级及原组件/顺序动作索引 | 源表事实与资源证据。早期Lv4/Lv7及描述分类只覆盖旧产物；现在按[原始逻辑管线](client-logic-pipeline.md)关联共享执行器，旧分类/补丁仍不能证明复杂状态机 |
| R07 | 所研究日服36.7.22 XAPK的Web映射含ak_act1autochess/ak_act2autochess；APK含IL2CPP/XLua库 | 历史解包证据，具体位置与包尺寸见归档；只能证明该包含相关入口/库，不能证明全资源完整或与当前CN表同版 |
| R08 | 现有decompress_ab.py处理UnityFS数据块codec4/5的LZ4变种（token半字节交换、offset字节序交换），已有导出资源和索引 | 本地工具与历史解包证据。适用于已测试包；不是所有版本通用性的保证 |
| R09 | 当时按icon_*Ship等名称查询未命中；现有部分盟约图标来自保存的社区页面 | 有限搜索结果。不再推广成“OBB没有这类资源”或“规则配置一定不在TextAsset” |
| R10 | 技能、角色模式、敌人和弹体prefab的对象引用已批量提取；骨骼/材质、动画事件与精确弹道帧序仍未全部贯通 | 原“prefab整体未关联”已被[逻辑管线](client-logic-pipeline.md)替代。后续从已有引用定位剩余表现/时序数据，仅补缺失对象，不重新逐技能扫描整包 |
| R11 | build_mode_rounds关联2赛季16模式302回合候选，47个引用关卡均存在；单人funny为9轮、多人funny为14轮、normal为15轮 | Verified源表事实；哈希和原始waves/routes/branches逐文件对照。两处boss分支routeIndex超出routes但可命中extraRoutes，索引空间仍待确认，不称文件缺失。详见[自动报告](../generated/round-data-report.md) |
| R12 | 路线row与mapData.map行索引反向，数组行=rows−1−row；act1autochess_m01首行索引378…398、末行0…20。act1autochess_01无人机检查点row12对应数组行6，普通门row9对应行9；领袖起点row2对应行16 | Verified源坐标/地图数据对照（同R11关卡目录）。普通左侧门和路线范围为行6…9、列2…10，候选格在行10/11；不是整幅19×21都参与该场普通战。源检查点转换不证明寻路细节、巡逻循环或动态分支完整一致 |


| R13 | activity.AUTOCHESS_SEASON.*.bandDataListDict + effectBuffInfoDataDict：老鲤 give_coin_in_round 为第1/2/3轮 0/0/15；两赛季阿米娅 HP=30/25、阈值2/3/4与3/4/5；shopLevelDataDict 的 initialUpgradePrice、constData.maxBattleChessCnt=8 | Verified源表事实。give_coin_in_round 按源文案解释为覆盖基础资金，不能额外加15。策略目录30/40条分别读取；原先跨赛季混用、16起步公式、同盟AI每轮凭空+6及随等级增加部署数都是本项目错误 |
| R14 | 关卡 mapData 的 heightType/buildableType/passableMask 必须独立保留：II·1数组[6,4]为tile_wall/HIGHLAND/RANGED/FLY_ONLY；初版1的[6,3]为tile_fence_bound/LOWLAND/ALL/FLY_ONLY，而[7,5]围墙格为NONE部署。predefines非hidden装置中，初版3的[7,7]围墙格上有trap_1106_achplat；II·4阻隔工事trap_1105_accrate在[7,9]、[8,9]等位置 | Verified源位置/字段，不能以tileKey或怪物不可达推断可部署职业。射击台重写远程高台的细节由character_table→skill_table文案及[装置资料](https://prts.wiki/w/射击台)补充，仍需同版prefab验证；本地静态接入不含工事被破坏。高台与围栏不叠画，厚度/颜色仅为本地示意；实装及红绿提示/落位一致性验证见tools/_terrain_placement_smoke.js |
| R15 | AUTOCHESS_SEASON.*.charChessDataDict 的普通/精锐 garrisonIds 独立引用 garrisonDataDict；特质含事件类型、执行 key、多个逗号分隔的盟约 ID、概率/单场上限；enemy_database.enemyTags 区分无人机与海怪 | Verified源表字段。`garrison_13` 描述价格 1、blackboard 为 2，存在源内冲突；定制品池 ID 不等于已找到池内容。时序约定、接入状态及缺口见 [特质专题](../mechanics/garrison-implementation.md)，不以模拟器测试自证客户端一致性 |

2026-09-08经济复核边界：本地公开活动表没有找到完整的逐难度回合基础资金表；[实战攻略](https://www.gamemale.com/forum.php?mod=viewthread&tid=184056)明确写开局4资金，结合老鲤0/0/15暂存文案，将通常前3轮4/5/6记为 **Inferred**。第4轮以后每轮+1、最多10是当前临时实现约定，尚无完整客户端资金序列支持；标准模式额外资源、教程和终极模式例外都未校准。[官方3/27修复公告](https://ak.hypergryph.com/news/9695)确认终极第4~8轮资金曾有服务器异常，但没有公布应发金额。不得把当前公式或测试期望升级为原版经济数据。网络上“回合数+2”的泛攻略与上述证据矛盾，未采用。

原版[帮助](https://prts.wiki/w/卫戍协议/帮助)描述升级后下一等级费用重置、剩余资金在准备结束时清零；本地保留Cannot明确例外，开局使用initialUpgradePrice，从第2轮起减1。首轮折扣时点仍需核验，先读已恢复的本地数据桥升级/过轮方法，再用同版观测校准。2026-09-08所记名册赛季混用已由固定槽位隔离修复；策略未支持key与潮汐/风向/沙尘/树丛等剩余装置逻辑按对应原组件继续核查。

R06补充（2026-09-14）：早期提取保留两个等级的spType/increment、durationType、rangeGrids和文案；现已扩为917技能、9125份等级参数，并新增资源与原生执行依据。常规时序、格范围与生命周期的模拟测试仍只属于实现验证；攻击/受击事件顺序、弹药/特殊回复、下次攻击强化等按实际组件逐类核实，不能用目录齐全宣布完整一致。

## 已撤销或缩小的旧表述

- “名单/阶数未找到”“正式名册未按赛季隔离”：前者由活动棋子表定位替代，后者已由207个固定槽位及存档身份修复替代；原型/助战/隐藏来源和继承仍需核查。
- “技能仍取所有人的技能1等级1”：提取器已按模式指定技能并生成Lv4/Lv7，剩余问题主要在战斗语义。
- “三段地图用途Verified，因为engine这样实现”：只保留原网格为事实，分区用途降为推断。
- “Boss坐标是待映射的局部坐标”：源row与数组行方向相反，统一翻转后即可对应底部战场（R12）；不再使用此前的吸附门位替代路线。
- “客户端已具备全部规则，所以只需私服应答”：属于旧路线推论，不指导当前Web实现。
- “APK/metadata解不开，只能逐描述或录像实现”：只反映早期尝试；现有原组件、动作图及可读原生函数已能直接支持批量机制研究，范围和未解析部分见R25。
- “三类特训/六模板尚未接”：2026-09-12确有此缺陷，2026-09-14已按R26接入正式开局、波次和存档；特殊援军与原版随机序列另列边界。
- “smoke通过，所以客户端一致”：拆为实现测试与来源证据两项。

后续新增结论使用稳定ID，补来源快照、字段/资源定位、观察、解释与未验证条件；不再向本文件连续追加整段开发日志。

## 2026-09-09 商店库存字段边界

[Verified：字段] 两赛季constData.storeCntMax=6、maxBattleChessCnt=8；前者业务含义未核验，后者已有部署上限消费，不可混作同名卡库存。完整来源、哈希、提取范围与未确认的社区材料见 [商店审计](../generated/shop-source-notes.md)。全局turnInfoDataDict与模式specialPhaseTime已找到；此前笼统描述为没有阶段时间数据不准确，应改为已有字段、缺阶段边界与时机证据。

## 基础攻击特性与实现区别（2026-09-09）

[Verified：源描述] character_table中sword分支普通攻击描述明确连续两次伤害；blastcaster为超远距离群体法术伤害。build_basic_attacks逐charId保留路径与描述。[历史实现约定，2026-09-09] 当时两击在同tick分别减伤，轰击术师对当前格范围内全体有效目标结算；源文案不证明连击间隔或每击事件。扩散术师/炮手溅射和部分改普攻后来已有执行，不能继续整类列缺口；当前范围及剩余帧序/覆盖关系见[攻击机制](../mechanics/operator-mechanics.md)，优先用已提取组件复核。

## R15 · 完整流程录像与Boss源字段（2026-09-10）

[Verified] 用户提供51:05录像已沿完整时间轴抽查78帧，直接观察四人大厅、第三轮特殊决策、第14轮Boss、已解锁隐藏Boss；关键帧与时间戳见[录像核对](../archive/20260913-cleanup/video-review-20260910.md)。用户说明这是关服前最后一局，后续无正常结算不可推广。客户端`guide_auto_chess_mode_training_1_r4_prepare.txt`明确最终攻势合并队伍生命并两两分组；录像中73的逐人组成未重新核算。被水印遮住的Boss倒计时80曾误读00，放大已纠正。

[Verified：源字段] activity.autoChessData.bossInfoDict提供Boss→enemyId/handbookEnemyId；各赛季bossInfoDict提供weight/isHidingBoss/bloodPoint等，bloodPoint不等于战斗maxHp。turnInfoDataDict提供normalPhaseTime/isBossTurn/bossTurnHpReduceTime，最后者150只证明字段，未确定起算点和扣血频率。关卡options给initialCost=10/maxCost=99/costIncreaseTime=1，录像02:42显示开战费用10。

[边界] 292源变体保留原enemy_database技能/天赋黑板不等于全部执行。本轮定向Boss组件提取及有限执行范围统一见[Boss机制](../generated/boss-mechanics.md)；隐藏门槛见R17。

## R16 · 机变已知规则与实际缺口

[Verified] 客户端`guide_auto_chess_mode_training_1_r3_prepare.txt`明确轮流挑选、同项不能重复、全员选完后结束；先`effect_expand`再`effect_confirm`，随后进入普通休整。源`battleDataDict[].isSpPrepare`提供固定特殊休整开关。开局策略教程另写随机顺序，不能据此推定后续机变排序。

[源表事实/边界] 两季`effectChoiceInfoDict`有89/109项事件元信息；`effectInfoDataDict`与`effectBuffInfoDataDict`可通过effectId关联真实效果。2026-09-10源表/教程检索没有找到模式轮次→事件→候选池完整连接；该历史范围不包含后来恢复的原生方法。现在可直接分析`_GeneSpPrepareStateDataFromRoundInfo`、`ReqSpPrepareSelect`与多人数据更新，见[方法入口](native-domain-entrypoints.md)。真实候选池仍未确认，本地预览/重复领取保护及手写+8/+15不能替代原池；旧检索材料保留在[决策证据](../generated/decision-evidence.md)。

## R17 · 隐藏核心的赛季门槛

[Inferred / 社区来源] 2026-09-10核对[首季PRTS](https://prts.wiki/w/卫戍协议：盟约)与[下半PRTS](https://prts.wiki/w/卫戍协议：盟约_下半)：首季独立>300、同盟所有玩家总和>1000；下半>350/>1200。均要求对应个人/全队生命>1、险境以上通过第14轮常规首领；文案为当前已激活层数，不能跨轮累计。两页均警告触发条件来自用户供稿、准确性未保证，不能升级为Verified；精确结算帧仍缺直接证据。

[实现边界，2026-09-14复核] `hidden-boss.js`使用实际参与记录的纯计算，隔离赛季并拒绝重复玩家；“只提供本机数据”是早期接线状态，当前多人过轮已由`room-battle-session.js`传入同盟实际成员数据，见[联机专题](../development/multiplayer.md)。此修复不提升上述社区门槛的证据等级。详细源表检索与边界测试见[集中证据](../generated/decision-evidence.md#隐秘核心两季不能混用)；两季统一350/1200的旧结论仍不适用。

## R18 · 正常结算两屏

[Verified视觉观察] 用户补充[结算画面1](../../assets/reference/video-audit-20260910/结算画面1.png)显示个人阵容、通过回合与奖励区，并有下一步；[画面2](../../assets/reference/video-audit-20260910/结算画面2.png)显示四人总览、称号、真实用时及返回主页/回到同盟。截图只证明展示结构，不能反推经验、奖杯或称号公式。

[历史实现记录，2026-09-10] 当时已做两屏个人结果与本机逐轮统计，第二屏使用本机作战回顾。后来多人已接实际成员、共享结果与过轮记录，当前接线范围见[联机专题](../development/multiplayer.md)，不能继续把当时缺真实队友数据写成整个游戏现状。原服务器经验/奖杯/称号公式仍未核实；本地统计测试不证明原版四人结算已完整复刻。

## R19 · Boss prefab组件与条件执行

[Verified源资源] 现有OBB内3个enemy prefab AB的根BoxCollider2D、公共Buff和模式组件，为昆图斯、胄普通/隐藏、帝国余晖和卫戍版萨米5个逻辑敌人提供持续自缚及4.95×2.95受击矩形。昆图斯普攻selector与图鉴对应最高防御2目标；大潮/崩坍各模式的选择器、延迟、伤害组件已定位。胄与帝国余晖的低血机制须以当前关卡覆写后的黑板为准，不回填其他关卡数据。生成器与原字段/path_id定位统一见[Boss机制](../generated/boss-mechanics.md)。

[实现边界] 主引擎已消费上述受击/目标规则及昆图斯当前模式的源CD技能事件；默认第一模式，动作前摇与通用元素爆发仍含仿真约定。自动阶段、ACTIVATE_PREDEFINED子代装置及其余复杂能力尚未贯通；导出、纯模块测试与真实引擎专项分别证明各自范围，不能声称完整Boss复刻。

## R19 敌群模板与名册覆盖更正（2026-09-12）

[Verified 源数据] `activity_table.autoChessData.constData` 的 `specialEnemyNum=3`，`templateEnemyNormal/Elite/Special` 分别为萨卡兹枯朽前锋、灵幛、孽罪奇美拉，飞行模板为妖怪、寒霜、暴鸰；另有地面/飞行 token 模板。`enemyTypeDatas` 中 SPECIAL 不参加随机抽取，其余6类 involveRandom 为 true。两季 specialEnemyInfoDict 共60/67条，含 attachedNormalEnemyKeys、attachedEliteEnemyKeys、isInFirstHalf、randomWeight；modeDataDict 保留 inactiveEnemyKey。专用 `enemyDataLevelId` 指向本地已有的 enemy_data 关卡，4条敌人覆写此前未纳入该随机池导出。

[历史实现核查，2026-09-12；已由R26替代] 当时battleSourceForRun直接消费模板波次，run-setup未选择并锁定三类敌群；261/352条主动作使用上述模板。2026-09-14已接原生规则、持久化计划及正式替换，见[原生取证](enemy-replacement-native.md)，不再把此段当作未完成接线。352条动作、747个声明敌人只是47份关卡静态总计，不是单局编队或最终敌人数；可重建统计见[覆盖报告](../generated/content-coverage.md)。

[历史社区交叉核对] [PRTS 卫戍协议帮助](https://prts.wiki/w/卫戍协议/帮助)检索摘要与用户既有[玩法材料](玩法简介.txt)均提到开局三类；[盟约敌方资料](https://prts.wiki/w/卫戍协议：盟约/PRTS盟约记录)未提供当时所需的换算算法。此缺口现由R26的原生函数补足，已不需要等待社区补公式；特殊援军、原版随机序列与运行时覆盖仍单列取证。

## R20 · 四槽甄选与协防（2026-09-13）

Verified：两季各有四个 DIY 源槽，V / VI 各两槽，要求 TIER_6；主/隐藏势力、核心盟约 powerIdList、普通/精锐养成和协防参数均在本地表中。Inferred：采纳 PRTS 对非预置六星资格、势力优先归属及自持有身份不可重复的说明；不能把四名甄选者统一视为协防。原型跨阶重复、V阶四星原型和好友助战另列，未用普通 charId 冒充模板。使用入口、源定位、实现与未解边界集中见[甄选编队](../mechanics/diy-roster.md)。

## R21 · 医疗技力触发与模组字段（2026-09-14）

Verified源字段：`character_table.json#char_4196_reckpr/char_128_plosis/char_171_bldsk.talents` 包含8份阶段/潜能候选；`battle_equip_table.json#uniequip_002_reckpr/papyrs.phases` 分别给出条件治疗/攻速与链疗/屏障参数。模组扁平属性存在不证明特性和天赋字段已导出，本批确认之前莎草读取入口没有对应导出。

Inferred社区事件语义：[PRTS 录武官](https://prts.wiki/w/录武官)说明技能开启事件、强制SP及限时攻速刷新；[PRTS 白面鸮](https://prts.wiki/w/白面鸮)限定受益者为干员；[PRTS 华法琳](https://prts.wiki/w/华法琳)说明随机候选不避开阻回单位，并区分抵达终点退场。采纳这些说明，保留未实现的事件/状态来源和同类光环组合，不将本项目测试提升为客户端直接证据。[实现范围与尚缺项](../mechanics/basic-actions.md)维护在机制专题。

## R22 · 医疗探机与条件技力模组（2026-09-14）

Verified源字段：赫默S2声明`overrideTokenKey=token_10000_silent_healrb`；该实体为ALL位、费用5、0阻挡、0.5秒动作间隔和`x-4`九格，技能`skcom_withdraw`持续10秒。白面鸮模组隐藏`y-3`范围不能只读取有名字的天赋；华法琳模组`[no]/[ex]`对应2与3/4 SP，图鉴`enemyLevel`提供实际NORMAL/ELITE/BOSS分类。

Inferred社区规则：[赫默](https://prts.wiki/w/赫默)及[医疗探机](https://prts.wiki/w/医疗探机)支持库存阻回、不可被常规选中的装置、主人离场保留与主动撤退消耗。近域技力及精英/领袖额外SP依据前条PRTS和源描述。原版卫戍的跨轮/主人再部署库存、首末治疗帧及装置例外能力仍未核；当前仿真约定单列在[医疗机制](../mechanics/basic-actions.md)，专项测试不作为原版证据。

## R23 · 职业攻速光环和沙之碑（2026-09-14）

Verified源字段：赫默“强化注射”明确筛选医疗职业，而非治疗行为；四阶段/潜能候选及模组升级数值已抽取。蜜蜡S2关联独立`token_10011_beewax_oblisk`，3阻挡、费用0、源隐藏20秒存续和技能范围`x-4`；本体与实体十级倍率/控制黑板一致。[医疗机制](../mechanics/basic-actions.md)、[蜜蜡实现](../mechanics/operator-mechanics.md)分别维护边界。

Inferred社区语义：[PRTS 沙之碑](https://prts.wiki/w/沙之碑)说明无持续攻击、禁疗及禁止生命回复、技能/主人退场联动。本地均匀选合法格和即时使用本体攻击力的伤害快照属于待核解释，不能作为原版权重/时序结论；赫默模组地面治疗的特殊部署判定也未确认。本批测试只验收可分离主体，不升级这些未证实项。

## R24 · 夕的小自在与默认模组（2026-09-14）

Verified源字段：`character_table.json#token_10015_dusk_drgn`是独立属性实体，不能继承主人攻击/生命；源隐藏黑板提供25秒寿命，S3黑板的攻击间隔0.4不能脱离算法理解为固定增加0.4秒。`battle_equip_table.json#uniequip_002_dusk`还含无名字的`3-1`范围候选，只有读取扁平属性或有名字的天赋会漏掉它。

Inferred社区语义：[PRTS 夕](https://prts.wiki/w/夕)明确S3间隔增加40%、刷新同格召唤物的生命/时限及首次攻击天赋在主伤害前结算；[小自在](https://prts.wiki/w/“小自在”)明确禁直接治疗、优先自身阻挡目标、25秒可手动撤退。当前采用这些规则；跨玩家复制体互刷、精确弹道帧相位及Y/ISW模组另核。证据和实现限制见[攻击机制](../mechanics/operator-mechanics.md)，测试仅证明实现行为。

## R25 · 技能组件实名与批量候选（2026-09-14）

[Verified：JP 36.7.22源资源] 已定向取得匿名MonoScript资源表，共3483个脚本身份。按技能文件的外部CAB和64位PathID关联，893个技能预制体的4017个组件实例全部得到真实程序集/类名；例如标准强化由`Torappu.Battle.CastSkill`与`Torappu.Battle.Abilities.ActiveBuffAbility`组成。来源包与SHA、重建及查询命令见[客户端逻辑管线](client-logic-pipeline.md)，具体候选见[生成索引](../generated/client-mechanism-candidates.md)。

[实现边界] 候选索引结合完整字段差异、顺序模板闭包、原生基类方法与两个运行时的现有入口；不按描述逐技能分类。脚本实名、组内同形或非零原生地址都不是组件语义已完成，跨版本与动态引用继续单列。共享SQLite与本地原图哈希不一致时拒绝混合；原始证据数据库没有原地改写。

## R26 · 敌群替换的原生算法与接线（2026-09-14）

[Verified：JP 36.7.22原生指令与配置] `AutoChessLevelEnemyManager`与随机敌群方法已取得三类型选择、逐轮池过滤和数量/间隔换算，浮点与取整边界按对应原生指令核对。原始方法、地址、源哈希、公式与例子见[敌群替换原生取证](enemy-replacement-native.md)。这补足了R19历史记录中的模板替换缺口，不应继续派从零取公式的任务。

[实现边界] 六模板规则已接新局计划、预览、正式波次、多人共享种子与保存恢复；旧休整档兼容保留原波次。token/extraEnemy、特殊援军、原版随机序列和服务端覆盖仍在机制清单R06；本地测试只能证明所列实现契约，不能证明这些未覆盖分支或当前CN快照全等。

## R27 · 器物死亡生成与伤害规则（2026-09-14）

[Verified：挂载、模板与原生键] 14个实际`PassiveBuffAbility`组件挂载`enemy_dead_spawn`，触发`ON_OWNER_KILLED`并排除`FALLDOWN`；模板不可沉默。`SummonEnemiesFollowMyRoute.Execute`的可读前缀确认黑板键`enemy_key/cnt`，不是把所有extraEnemy字段一概当死亡生成。完整ID、原生RVA、源哈希、事件枚举及未解范围见[原生取证](enemy-death-spawn-native.md)。

[Verified：器物生命] 14种子敌实际挂载`PropLikeEnemy`，`DoApplyModifier`（RVA `0x21fc51c`）完整可读体将有效负生命修正固定为−1、非负生命修正归零；其中4种限定法术或真实伤害。元素积累另走基类，不由此推导积累免疫。当前关卡HP及其修改决定所需命中次数，详见同一原生取证页。

[实现边界] 死亡生成按当前关卡黑板与子敌覆写运行，延迟队列保留路线检查点、参与阻波/胜利/超时，房主恢复沿用已抽取时间。器物生命已接普攻、技能、弹体、持续伤害和恢复，采用最终伤害类型，保留关卡生命修正。原版空间散布、障碍选格与随机顺序未还原；子敌“无法阻挡”的实际公共判定及其他独立能力仍待核。当前原位置/种子延迟约定见[机制页](../mechanics/enemy-death-spawn.md)，本批不能证明完整敌人完成。

## R28 · 道具市场目录与经济分支（2026-09-14）

[Verified：目录字段消费] 原生道具目录按`itemLevel`分组并过滤`hideInShop`，卡片保留`itemId/trapId/itemType`，价目从对应棋子配置读取。CN两季46/59条记录已独立导出，共105条；同effectId可以有不同商品ID、等级和价格。[源位置、RVA及跨季例子](../mechanics/shop-items.md)维护具体证据。

[历史实现边界，已由R35/R38扩展至14件市场映射] 该批12件装备以真实effectId映射并采用赛季目录限制，保留旧已报价库存与新抽卡的区别；等级累计可抽、装备等权仍是本地抽取约定，未还原正式服务端权重/库存。训练桥明确读取`trainingRoundInfos/trainingShopInfos`，正式多人升级则发服务请求；本条初查时未找到的训练对象现已取得，见R31，不以训练流程替代所有模式的经济规则。

## R29 · 严格属性图共用到Web（2026-09-14）

[Verified：图与引用] 同一不可变JP证据的CastSkill/ActiveBuffAbility单持续Buff图，按真实组件、控制字段、空模板和属性枚举严格比较；Web适配器只接受timed自增益契约，新增模式/目标字段会被拒绝。该批CN按精确prefabId和全部等级黑板关联22个源技能ID、13个prefab，后续数量见R33；图与数值版本分列，跨版本原生一致性未确认。[具体来源与范围](../mechanics/client-stat-buffs.md)。

[实现与验证] 新明确接入星极/真理/星熊/伊芙利特/铃兰/闪灵S1，清除原文案分类效果；其他已有明确处理器继续负责专属分支。818个真实身份/技能/等级用例覆盖数值、实际伤害/治疗、攻击间隔、持续退出/死亡和六种新增技能的鉴权恢复。真理的基础间隔秒数加法先于静态与动态攻速计算，基础重算不残留。测试只证明当前执行边界，不证明天赋/模组完整联动和原版动作帧时序。

## R30 · 根被动的永久不可阻挡（2026-09-14）

[Verified：JP 36.7.22组件与原生] 九个实际敌人的根`_commonAbilities`直接引用启用的`PassiveBuffAbility`，挂载不可沉默、`INFINITY`寿命的`BLOCK_FREE`模板。`GetPassiveBuffs`返回该组件的`_buffs`，`Entity.isBlockFree`读取真实枚举3；完整ID、引用、模板与RVA见[阻挡取证](enemy-block-native.md)。这不来自敌人名称或图鉴关键词。

[实现与验证] 对这九个ID接永久不可阻挡，释放已有干员/召唤物的阻挡关系，保留关卡覆写与普通攻击资格；逐ID移动、实际目标条件和鉴权恢复通过。没有推导飞行、隐身或伤害免疫。[机制范围](../mechanics/enemy-passives.md)保留独立能力边界；转伤在后续R34接入；当时“标记仍未接”的解释已由R37纠正为四根永久标记并接achunt最终死亡清理。器物子敌走的公共判定页`0x21d0000`已确认不可连续解码，仍无不可阻挡证明；没有新字节或方法条件时不重复同页扫描。

## R31 · 被匿名包索引遗漏的训练对象（2026-09-14）

[Verified：源表与消费链] 旧资产索引遗漏OBB内90个匿名`.bin`包；增量读取AssetBundle内部别名，取得`gamedata/battle/battle_misc_table.ab`中的`miscConfig.AUTOCHESS.act1autochess`。源包、TextAsset密文字节、解码原始字节分别固定SHA；沿本地训练桥确认四轮资金`3/8/6/7`覆盖余额及四级26条精确棋子ID权重。原生整数随机区间和`MathUtil.LE`边界均保留，详见[源对象与方法](../mechanics/shop-items.md)。匿名文件名未命中不能证明配置不在APP。

[实现与验证] 第一季训练对应轮次/商店等级已接源资金与候选；实际升本、冻结报价、缺绑定/空池、跨模式隔离和休整后续随机重放通过。原版随机流仍未移植，第二季与正式模式不能套此配置。第三轮六槽/四人轮选、NPC和第四轮Boss原对象已保留；后续同版缺号复核及HP/Boss消费见R35，未接效果/流程继续单列，不计完整训练验收。

## R32 · 所有角色模式的攻击图等价证明（2026-09-14）

[Verified：源角色模式与原生] `CastSkill._switchToState`是布尔，`SwitchMode`在START读取模板`mode`，FINISH回默认模式。原19项配置已按真实角色模式与完整攻击组件审计，没有据组名放行；相邻红豆S1/S2的全部序列化模式均匹配已核攻击图，才取得受charId约束的有限证明。[父项目证据](../../../docs/client-skill-modes.md)保留21项审计、20原生入口和源哈希；默认模式初始化不可读，不猜模式0。

[实现与验证] 父DPS通过严格`mode_graph`契约新增这两个技能，十级源绑定与原界面计算通过，当时执行106/1001；额外控制器/目标节点、错误角色、模板变化及18项具体模式拒绝保持关闭。该批Web尚未消费新契约，后续已携带角色与证明边界显式适配，见R33。共享旧SQLite没有重建，新增编译依赖已进入候选索引哈希。

## R33 · 模式证明与最终防御消费（2026-09-14）

[Verified／实现] Web复用R32现有红豆角色模式证明，严格核角色、数据库SHA、完整模式引用与已审攻击图SHA后接S1/S2。缠丸S2源DEF FINAL_SCALER的字面0由原生ProcessFinalScaler与最终属性结算确认，不是文案−100%；该常量已由父DPS与Web共同消费。父DPS新增至107/1001并修正既有银灰S3的最终×0.3；旧大SQLite哈希未变。原生证据及可颂仍拒绝的talent_scale/动画上限边界见[最终防御证据](../../../docs/client-final-defense.md)。

[验证边界] Web当前25源ID/16prefab/235级，848身份技能动作、九种鉴权恢复与七项适配器拒绝校验通过；该批父侧122项相关验证通过，本次父侧206项见R36。缠丸实际承伤、全部已接防御平加/增益、选敌及面板退出均归零恢复。[已替代边界] 当时银灰Web末端平加未传播；本次已将最终因子统一作用于流形/元素平加后的承伤、Boss选敌、防御链接及战斗面板，保留缠丸零因子和结束恢复。其他最终属性、可颂天赋倍率及原版帧时序仍未完成，见[Web契约](../mechanics/client-stat-buffs.md)。

## R34 · 胄子实体的受伤事件与首领传伤（2026-09-14）

[Verified：原生顺序与模板] enemy_9014_acstma/9015_acstmb的ON_TAKE_DAMAGE在自身扣HP前读取Modifier.value，经BossSelector、常驻标记和BOSS资格选择首领，瞬时以PURE/skipModifierEvent/noSourceDamage应用FixedValueDamage。目标与数值不由图鉴文案猜测，具体方法与事件/虚槽证据见[转伤原生](enemy-transfer-native.md)。

[实现边界] 两个精确ID已接实际伤害/弹体及鉴权恢复；过量伤害不按子体剩余HP截断，首领不二次计算原攻击或递归事件。关卡levelType覆写已保留，NORMAL同ID不冒充BOSS。仅唯一合法首领可转伤；多目标仇恨排序、actrpa的事件7及三子体TARGET/来源上下文仍拒绝；此前把根achunt_mark混作动态依赖的解释已由R37纠正，真正周期/派生标记仍未完成，详见[被动专题](../mechanics/enemy-passives.md)。

## R35 · 训练源消费、同版缺号与防暴盾（2026-09-14）

[Verified：源对象与调用] GenerateLocalSave→_LoadRunTimeData将misc.initialHp=45写到新局玩家生命，现已接入并保留后续剩余生命。第四轮Boss的30000生命原本已由tr04关卡消费，本批只确认一致，不加第二重覆盖。同版JP活动表已按匿名别名、pathId与固定FlatBuffers schema定向解码，act1的46市场项/89棋子项同样没有第三轮`chess_item_3_11_e_a`。旧“取JP同版即可补齐”的入口已纠正；下一证据是实际缺号处理/热修。NPC名单/坐标函数已读，尚缺预置快照到转换的调用顺序。[三层源、方法、工具及具体断点](../mechanics/shop-items.md)保留可重复入口。

[Verified／限定实现] 防暴盾GlobalBuff的ON_TAKE_DAMAGE四节点链核自身阻挡，再否定来源被自身阻挡，两季源scale均0.6；Web单件主体在实际命中时核敌人实例/visualId和阻挡关系。实际近战、飞行中条件变化、真实购买穿戴、房主弹体恢复通过，修正单件装备`[装备,null]`被休整校验误拒绝的问题；坏对象、重复UID、库存null仍拒绝。多件去重仅是本地约定，maxStackCnt=1不能单独证明上游环境实例归并；未知来源伤害和其他吸收盾事件顺序仍未完整核定。不计完整装备/教程/模式完成。


## R36 · 自疗原生算子、保护桥与独立消费者（2026-09-14）

[Verified：源图与可读算子] 卡缇/缠丸/铸铁S1共享CastSkill、SelfSelector、Heal、UberEffectEmitter四组件图；SelfSelector只返回owner，ApplyHeal比例分支读取目标maxHp乘healScale，绕过本节点CalculateHeal。后续Entity仍派发Buff/输出/入站事件；OnTakeHeal在force假且isHealFree真时取消modifier，不能推导为绕过所有治疗干预。[20方法、版本哈希与完整图](../../../docs/client-self-heal.md)。

[受保护／实现约定] Heal.DoSetData、NewHealNode、GetEventActions/get_applyWay的能力参数装载和事件桥仍不可读，严格编译拒绝protected_heal_ability_bridge。父DPS按精确CN身份/字段单列3项自疗模型，实际恢复自身HP，按缺血封顶，独立输出HPS且不附加攻击；原107/1001与精一85/807计数不变。Web原已存在这三个技能，本批只修正比例节点与既有治疗增幅的关系，不算新增三技能。施放当帧为模型约定；Web沿用满血保留SP，DPS则按用户选择的就绪释放策略执行，满血有效治疗为零。这一策略差异以及禁疗/外部事件边界按各消费者专题保留。

[诊断与接续] 严格图17/893，拒绝607/228/24/16加保护桥1项；候选690组/Web161项独立登记，不是完成率。父侧206项、候选9项通过。[2026-09-18已替代接续] skcom_born_up三个7/10/10级源绑定已进入部署公共编译组。AppearSkill.OnBorn/OnLocate/DoCast在当前二进制均不能连续解码，固定为保护障碍，不再按此旧建议重复查询；公共Buff可读公式及当前两相部署映射见下方R39。

## R37 · achunt永久根标记与最终死亡清理（2026-09-14）

[Verified：源挂载与原生] achunt及actrpa/b/c四根启用PassiveBuffAbility的第二个Buff直接持有不可沉默、无限寿命achunt_mark。它不是周期生成的achunt_mark_by_boss；旧混同解释已纠正。achunt的ON_OWNER_KILLED经BossSelector选择同战场所有活的、可选的、具有此标记且为NORMAL/ELITE/BOSS的实体，InstantKill→Suicide→SetHpInternal直接归零。[源引用与原生边界](enemy-achunt-cleanup-native.md)。

[限定实现] 已在最终死亡/复活判定后、胜利收尾前同步清理；不走伤害/盾/转伤事件，不把子体击杀收益转给攻击首领的干员。序列化一次性标志防止恢复后重复派发，保留现有复活及正常死亡生成/掉落。未知别名、多活achunt顺序继续拒绝；三子体TARGET/事件来源、动态派生标记和完整主动技能仍未实现。[执行范围](../mechanics/enemy-passives.md#achunt-死亡清理)。

## R38 · 炎国短刀单件两版施法叠层（2026-09-14）

[Verified：同一公共图与CN数值] 普通eff_acarm040与进阶eff_acgarm040，两季均绑定同一GlobalBuff。ON_SKILL_START依次Dice(prob)→比较层数→给BUFF_OWNER创建ATK MULTIPLIER子Buff→计数增加；两版每层分别0.05/0.08、上限10、prob=1。概率判断在满层判断之前，满层成功施法仍推进随机流；子Buff无限期、非durable，不是穿戴时常驻加成。[原图、方法和版本隔离](../mechanics/shop-items.md#炎国短刀施法叠层与普通进阶公共图)。

[限定实现] Web已接单件普通/进阶实际施法、叠层与普攻增益；技能结束/属性刷新/保命保留计数，真正死亡清除。移除旧常驻5%/8%造成的重复加成；购买/进阶/穿戴/旧休整修正及房间保存后继续施法的状态与随机流验证通过。市场映射由13件增至14件。多件上游环境创建/归并、完整第三轮六槽轮选和服务端随机算法仍未完成，不把单件主体计作全装备/全训练模式验收。

## R39 · 部署公共Buff的周期公式与生命周期（2026-09-18）

[Verified：JP 36.7.22原生方法和完整配置] `SetAttributeAsDynamicVar` 用当前来源属性×黑板比例写入 `dynamic`，正持续时间下写入 `dynamic_spd=dynamic/duration`；`ModifyDynamicVar` 每次按 `max(0,dynamic-dynamic_spd×triggerInterval)` 更新。`BlockDamage` 无负数容量分支扣除实际阻挡量。`RemainingRatioToAttributeModifier` 读取属性黑板值并乘剩余时间比例；砾源模板给DEF/MULTIPLIER、非反向、endTime=0。方法、字段偏移、文字键、源等级及各文件SHA见[公共原生合同](../../work/client-logic/native-deployment-buffs/contract.json)。

[推断与实现边界] 原生DEF公式分派跳表与AppearSkill三个部署入口受保护，不能把字段消费和两相映射称为完整原生流程。当前按 `_castOnLocate` 区分入场/部署完成，`waitFirstTriggerInterval=false` 在部署时执行首周期；精确帧、黑板duration回退与全局技能开启事件仍保留边界。编译只接受完整已解释图，不重扫已固定保护方法。运行及限定验收见[批量机制](../mechanics/garrison-skill-batches.md)。

## R40 · 持续属性光环、模式投递与覆盖优先级（2026-09-18）

[Verified：JP 36.7.22完整配置与CN等级数据分列] 冻结的五候选[源合同](../../work/skill-aura-batch-contract.json)保存完整 `AuraBuffAbility`、范围、`TargetValidator`、控制器、Buff模板与角色模式，按各原图/等级表SHA追溯。初雪S1目标ASPD平加、S2目标DEF/RES最终倍率；两项所选 `MeleeAttack` 的 `_waitForAttackEvent=0`、`_preDelay=.5` 与远程选敌并存，不能按射程推成弹体。锡兰S2是 `AttachOrDetachSkill`、范围状态抗性和切换治疗模式；Pith S2全场筛选术师、目标加攻与自身攻速分列。局部Aura层能解释Raidian S3的部分字段，额外 `talent_scale` 未闭合，当前整项拒绝。[模式编译回执](../../work/skill-mode-batch-report.json)给出四项实际绑定与完整拒绝原因，初始源合同不是完成标志。

[Verified：限定原生数值公式] [三方法合同](../../work/client-logic/native-aura-overrides/contract.json)固定原始库/元数据哈希、RVA和指令。`Buff._CalculatePriority`（`0x4d9ac0c`）在 `get_isAutoPriority=true` 且键表非空时返回 `RoundToInt(1000 × Σabs(priorityBBKeys的黑板值))`，非自动分支原样返回固定priority；方法没有对状态抗性键名做倒序特判。`GetOverrideKeyCandidate`/`EnsureOverrideIndependentKey`处理已构造的字符串及map，未接收实体或角色对象。这些事实不证明哪一priority获胜、同优先级如何处理或独立来源如何生成key。

[未证实与实现约定] 当前光环按来源实例ID隔离独立贡献；override组采用较大数值优先、平局取较晚开始再稳定来源ID，`disableOverride`使贡献并存后按属性层合并。来源实例而非charId、竞争胜出/平局、disableOverride叠加及自动优先级getter的判定没有原生证明，不称为原版强效果覆盖。已有DEFAULT跳表受保护障碍保持固定，不重复提取。源字段能证明有0.5秒延迟，精确回调/中断/帧相位和原版热修顺序仍未还原；当前延迟直击沿已有队列冻结计划，来源失效取消、技能结束保留既发本体，属于已测试执行合同。

[限定实现验收] 四技能40源等级、10实际赛季配置、4次主机恢复，以及范围进入退出/来源撤销、属性/状态抗性实际消费者和敌方基础ASPD合并通过。只新增四个 `source-mode-body` 子项，保留原558条勾选/备注，不增加整技能或整人完成数。测试证明本地实现合同，不能证明原版多副本组合、完整天赋模组或跨版本一致性；具体模型与脚本见[批量机制](../mechanics/garrison-skill-batches.md)。

## R41 · 有限弹药计数与远程武器筛选（2026-09-18）

[Verified：完整配置与枚举] 隐现S1/S2的 `CastSkillWithLimitTimes` 都取有效主攻击进度，选中模式有单一直接 `RangedAttack` 和同对象 `AbilityEventCounter`，每次消耗1，耗尽结束；不同于蕾缪安的raw主进度与复杂行动。`AbilityStandard.Event` 值4为 `ON_SPELL_ON`，不是命中事件；四个计数/进度方法受保护，本次定点结果固定在[弹药原生合同](../../work/client-logic/native-ammo-controller/contract.json)，不再反复提取。

[Verified：属性与次筛选] [元数据回执](../../work/client-logic/skill-ammo-target-enums.json)确认属性20为 `TAUNT_LEVEL`、次筛选1为 `RANGED_APPLYWAY_FIRST`。所读 `SecondaryFilterAdvancedSelector` 在本组maxNum=1、sortByTauntAtLast=false下，先做基础后筛，再优先保留远程武器匹配集合；没有匹配则回退。武器由 `applyWay` 位判断，不能把飞行、站位或外观当远程类型；多目标路径不按单目标结论放行。[定点方法及边界](../../work/client-logic/native-ammo-selector/contract.json)。

[Inference / Simulation] 单一主攻击在发出后扣一弹是该族的语义映射，精确原生回调帧尚未恢复。基础postFilter6的飞行/仇恨比较顺序未证，唯一 `FilterUtil.Filter` 入口无法解出有效指令后即停止；当前先飞行后仇恨是模型约定。远程武器次筛选高于基础顺序有直接证据，不能与此未证部分混写。

[限定实现] 20源等级、180发实际弹药、8赛季配置及4次主机恢复通过；空目标、末发冻结、SP锁和卫戍消耗通知沿公共入口。属性20进入普通敌人与源EnemySkill的实时选敌，耗尽/死亡/结束撤销。只验收两个源主体子项，原562条记录保留；源canDiscard能力以既有程序化结束表达，不新增自动卫戍的手动技能按钮，完整天赋模组另核。

## R42 · 全局选择与圆形弹体的不同目标集合（2026-09-18）

[Verified：配置观察] `acduml_2` 的唯一普通攻击根为双分支SelectableGroup；主分支ALL侧按余音key与mode 1筛选，备选选择对立实体。两动作共享冷却、固定三次发射；弹体到达时选择ENEMY侧圆形受击集合，但另开结尾强制命中trace。完整图、图鉴字段与原始配置保存在[冻结合同](../../work/enemy-selectable-attack-contract.json)。基型额外启用第三攻击组件，不能套入双分支图。

[推断与限定实现] 主瞄准集合不能直接当爆炸受击集合。当前实现为对立圆形目标加有效trace一次；原图鉴优先攻击暗色余音及余音受击反应支持这一解释，未取得原生完整流程。全局负半径与空combat根不触发通用近战；共享CD、三发游标与弹体引用沿现有保存链消费。精确选支顺序、原生cast结束清理及动态重选仍保留[明确模型边界](../mechanics/enemy-basic-actions.md#全局选支多次发射与范围命中2026-09-18)。余音自然变形与反击仍是独立待办，不以手动mode 1接口验证替代。

## R43 · 当前阻挡目标的周期伤害与来源眩晕（2026-09-18）

[Verified：完整配置与CN等级表] Mechanist S3源周期Buff经CreateBuffToBlockee给阻挡目标创建即时AdvancedApplyDamage，MAGICAL、NORMAL、ignoreForSp=false且不跳过伤害事件；森蚺S2所选模式挂载ToggleablePassiveBuffAbility/BlockedToggleChecker，给blockees施加until-detach的stun。完整字段、模板、等级与原图哈希见[合同](../../work/skill-blockee-batch-contract.json)。

[Inferred / Simulation] Checker的(0,0,0)控制字段结合CN“阻挡的敌人”描述，映射为当前全部阻挡对象；没有读取该具体原生阈值方法，不用其它同名checker替代证明。首周期和精确事件帧仍是模型；跨大步补跳使用当前帧属性/成员，不能回放历史关系。敌受击回SP尚无完整消费者，保持缺口；普通攻击回SP不能替代它。

[限定实现] 公共来源状态、独立周期游标、实际伤害/死亡和状态查询已接。20源等级、2实际森蚺赛季配置、4次主机恢复及自然前摇中断/结束复攻通过；Mechanist为扩展身份。仅新增两个限定源主体，完整天赋模组和整技能不随绑定勾完。[运行与验收边界](../mechanics/garrison-skill-batches.md#当前阻挡目标的伤害与维持状态)。

## R44 · 有限父Buff与独立次数、派生覆盖及穿透（2026-09-18）

[Verified：完整图、等级与既有元数据] 雷蛇S1虽根duration=-1，两个源Buff仍用黑板8秒；event 10的BlockDamage后仅FinishBuff自身。折桠S1的CreateBuff明确derived及父结束联动，数据库状态抗性与外来光环具有同类override合同。Stormeye S1/郁金香S2分别使用固定/比例DEF穿透，后者另有有限计次周期ModifyCost；属性17/25和Buff事件身份沿用已有原生元数据，不重复取证。实际四图、40级与编译产物见[最终合同](../../work/skill-self-buff-batch-contract.json)。

[Inferred / Simulation] 一次盾参与现有正承伤阶段，其他盾的完整事件优先级未还原；派生与Aura共用一次覆盖竞争，仍采用已明示的DEFAULT排序。先比例后固定穿透、周期首帧及严格父截止时间属于本项目模型，未冒称新增原生证明。四个Active预延迟为0，根不可打断预延迟标志不意味着有正延迟。

[限定实现] 40源等级、act2雷蛇/折桠普通精锐4配置、8次主机恢复通过；Stormeye/郁金香按扩展身份验证，不算固定招募槽。独立DEF保留、已消耗盾不重置、父子撤销、Aura竞争、物理穿透/法术隔离及有限回费沿真实消费者验证；部署盾和Aura成员针对性回归通过。仅新增4个限定主体，整技能/天赋模组仍独立验收。

## R45 · 技能结束状态、有限抵抗和概率命中（2026-09-18）

[Verified：缓存原生与完整源图] AfterAffecting分支在cast事件2武装，OnTick检查能力不再affecting后一次AddBuff；onlyCheckOnStopAffect=false不走停止回调分支。极光S1、远山S2、雷蛇S2的完整余图、30等级、有限自身抵抗与命中概率字段见[合同](../../work/skill-mode-end-effects-batch-contract.json)。没有重提取受保护方法。

[Inferred / Simulation] 本地结束原因对应、同key最长截止刷新、每目标独立概率与精确帧相位保留模型；概率语义由字段和CN逐级描述交叉限定。结束前撤销活动层再算当前外部抵抗，独立状态进入行动、阻挡、净化、装备和事件消费者。30等级、6实际配置和9主机恢复通过，只增加3限定主体，不代表整技能/天赋模组已完成。

## R46 · 敌方持续光环、伤害监听与空普通模式（2026-09-18）

[Verified：完整配置] dsubrl两成员的三个Talent挂载包含静态CircleCollider2D半径0.5、每秒MAGICAL伤害、造成伤害事件11的SANITY动作及自身属性26 addition=-0.5抵抗Buff；唯一普通模式attack为空、combat为无动画无输出EmptyAnimatedAbility。标准sluggish优先级-1与自身overrideKey/priority1来自完整模板。完整来源、变换、参数和拒绝字段见[合同](../../work/enemy-aura-contract.json)。

[Inferred / Simulation] CN/JP对应、静态圆0.5的运行范围、进入后首跳1秒、跨大步当前帧补跳、源间独立时钟和较高priority胜出沿明确模型；数据库1.6不替代显式圆。造成实际正伤害才发神经损伤、完全吸收不发，为当前伤害事件模型，不能称为原生护盾优先级证据。

[限定实现] 两实际出生对象、多来源、进入/退出/重入、法术与当前攻击力神经事件、护盾/免疫/抵抗、精确停顿覆盖和双来源主机恢复通过。源空普通模式禁止旧兜底攻击；普通诊断12→10，只减少对应两条已证明无需普通输出的缺口，不勾整敌或阶段链。详见[敌方公共合同](../mechanics/enemy-basic-actions.md#敌方持续光环与空普通模式2026-09-18)。

## R47：常驻被动与有限顺序控制（2026-09-21）

**Verified（缓存源）**：[被动根合同](../../work/skill-passive-source-contract.json)和[18项组合完整合同](../../work/skill-flow-batch-contract.json)保留源组件、引用、黑板及哈希。PassiveSkill根与自身/贴附Buff、AbilitySequenceGroup有序子引用及各有限Buff为序列化事实。古米治疗RangedHeal继承链未重写共享时序方法；冻结动画Skill的OnAttack=0.4333、duration=1.3333，共享原生等待事件和播放缩放分支来源保存在组合合同sources中。

**Inferred/实现约定**：JP组件图与CN等级表、四位小数动画提取跨快照对应；等待子Buff完成映射一次finish事件，不宣称原生协程/退场动画逐帧等价。准备10秒接治疗30秒按完整有限子项推进，死亡/中断取消后续阶段；治疗冻结值、失效源/目标取消和主机游标是本地可恢复语义。

**实现证据**：`tools/_skill_passive_smoke.js`与`tools/_skill_mode_flow_smoke.js`覆盖30等级、6实际赛季配置、7次主机恢复及事件/占用/独立到期；这些验证复刻执行，不自证原版完整一致。组合表其余17项仍有未闭合叶子，不能用控制器命中计为完整技能。

## R48：INPUT_VECTOR3贴附弹体（2026-09-21）

**Verified（缓存源）**：[完整合同](../../work/enemy-attach-projectile-contract.json)保留CN动作、JP拥有关系、所有MonoBehaviour、脚本/默认枚举和各源哈希。destination=2对应INPUT_VECTOR3；delayToStart=3、followTarget/keepUpdate=0，圆半径约1.2，伤害枚举1对应物理。保存的CircleRange原生初始化在scaleble=0时使用owner范围替换fallback，实际等级射程2。SecondaryFilter3检查ContainsBuff且不移除未标记对象。

**Inferred/实现约定**：普通调度开始锁对象、OnAttack捕获当前二维位置；标记组优先再仇恨/部署次序；已发弹体在来源死亡后继续3秒延迟，范围结算不补追踪对象。原生最终比较器、精确捕获帧/高度与managed清理未宣称恢复，环境标记生产者未接。

**实现证据**：`tools/test_enemy_attach_projectiles.py`与`tools/_enemy_attached_projectiles_smoke.js`验证完整图拒绝边界、真实普通双通道、冻结位置/物理输出、动画后自然行走、发出前后生命周期、轮末等待和3个主机恢复点。属于限定普通主体；不自证整敌或原版帧等价。

## R49：主发出事件触发额外治疗（2026-09-21）

**Verified（冻结配置/枚举）**：[下一击完整报告](../../work/next-attack-batch-report.json)compoundSourceBodies保留整个ReplacementSkill、单主动作AbilityParallelGroup、BuffDuringSkill、额外Heal及选择器/自动范围。模板事件18的TriggerAbilityUseSelector→AlwaysNext→FinishBuff，黑板ability_name与Heal.namedAsAlias对应；事件枚举来自既存[原生部署证据](../../work/client-logic/native-deployment-buffs/contract.json)constants.enums中的ON_ABILITY_SPELL_ON=18。技能等级独立提供atk_scale、heal_scale及充能ct。

**Inferred/实现约定**：在本地主动作发出阶段一次选择合格受伤友方，使用非暴击源ATK×heal_scale，先治疗再主伤害；同步执行不给额外治疗重复触发监听。空动画/timeMode2叶子的原生事件桥、回调重入和FinishBuff精确先后未恢复，沿用既有下一击帧模型，不宣称原生逐帧一致。

**实现证据**：`test_next_attack_compound.py`及`_next_attack_compound_smoke.js`覆盖完整图拒绝、10等级/2赛季配置/3主机恢复，以及零敌、空治疗、独立倍率、充能和死亡后无重放；仅瑕光S1限定主体，不是完整天赋模组验收。冻结18项组合中的其他成员按实际四提供者绑定过滤后剩16项。

## R50 双向切换与准备持续结束组合（2026-10-03）

**Verified（完整源与限定原生）**：山S2、银灰S2的完整 `ToggleSkill + PassiveBuffAbility`、目标mode、范围/属性及20等级由结构编译，源与哈希见[模式回执](../../work/skill-mode-batch-report.json)。[ToggleSkill原生记录](../../work/client-logic/native-toggle-skill/evidence.json)指向六个完整方法：`IsAvailable`、`DoCast`、`UseSkill`、`OnTick`、`_SetToggledInternal`、`_DoSwitchMode`。`DoCast` 在转换前扣除spCost，`_SetToggledInternal` 随开关附着/移除被动能力。此证据限定JP 36.7.22默认原生分支；两个不可读的BasicSkill输出不用于证明SP回复时机。

**Verified（缓存图与动画）**：森蚺S3顺序根先执行自身动画，后挂载有限mode 2 Buff；前摇同对象的BuffDuringCasting含异常免疫[0,16,12]，ON_ATTACH创建另一个独立INFINITY属性Buff，主体ON_FINISH按序恢复默认模式、解除动画锁脸、创建stun并清理属性Buff。已有[异常枚举](../../work/client-logic/native-enemy-block/evidence.json)确认0=STUNNED、16=FROZEN、12=SILENCED，25才是LEVITATE；不能将12猜成浮空免疫。缓存 `Skill_2_Begin` 时长1.5秒、仅有音效事件，无OnAttack；CN主体时长由30逐级增至35秒，结束眩晕各等级均5秒。

**Verified（目标数上限）**：[完整四方法与公式](../../work/client-logic/native-block-target-limit/contract.json)确认选择器先读取maxTargetNum，再由 `LimitMaxNumToBlockCnt` 限制；allowZero=false返回 `min(maxTargetNum,max(1,blockCount))`，true分支返回 `min(maxTargetNum,blockCount)`。森蚺所选mode 2源maxNum=1，所以增加阻挡不会变成三目标群攻，零阻挡也不强制变成零目标。getter本体尚不可读，源maxNum/黑板解析沿当前已有绑定。

**Inferred / 实现约定**：JP源图与CN等级仍跨快照绑定。开关姿态期间继续回SP、自动战斗保持开启而非反复自动关闭，是本地生命周期约定；普通affecting-SP字段不能单独证明该规则。无OnAttack的前摇以缓存动画完结推进，施法免疫只覆盖此前摇，独立属性与回血从开始延续到主体结束；原生事件等待回退和精确帧相位未恢复。动画锁脸不改变本组逻辑攻击方向。前摇取消不产生主体结束眩晕、主体活体中断一次清理/加状态、死亡撤退丢弃后续状态，同样保留实现边界。

**限定实现验证**：20261003.1统一构建新增上述三个主体30等级，模式提供者53→56技能、527→557等级；固定明确路径162→165/363、待接198，扩展201→204/423、待接219。冻结组合余项16→15。编译反事实检查通过；开关组20等级/8实际赛季配置/6主机恢复、前摇组10等级/2配置/3主机恢复通过。真实攻击核实阻挡优先、森蚺单目标及零阻挡下限1，公共排序的NaN失效已修复。测试证明本地合同，不自证精确原生时序，也不勾整技能/天赋模组。[具体生命周期](../mechanics/garrison-skill-batches.md#开关姿态与带施法免疫的变形前摇2026-10-03)。
