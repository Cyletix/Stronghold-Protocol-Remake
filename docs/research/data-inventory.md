# 数据清单与问题分类

最近批次更新：2026-10-03。本文件维护源数据消费链、问题编号与证据缺口；推进顺序只在[当前计划](../plan.md)维护，个体行为和勾选只在[实施清单](../checklists/README.md)维护。历史阶段记录不等于当前功能完成状态。

## 数据生产与消费

主 JSON 来源：`data/ArknightsGameData/zh_CN/gamedata/`。本地 OBB 来源为 `work/main.obb`。两者服务端版本/语言未建立统一清单，不能默认同版。数量只代表当前本地快照。

2026-09-14已补上此前未贯通的[客户端执行逻辑层](client-logic-pipeline.md)：478个逻辑包、技能与角色模式、7522个顺序Buff动作模板、metadata与部分原生方法地址；独立匿名MonoScript包又关联4017个技能组件的真实类型。`tools/extract_client_logic.py` → `work/client-logic/` → 父工作区来源隔离证据库/DPS诊断及卫戍定向生成器。此链是共享研究证据，不直接把882个资源匹配宣称为已实现技能。[原生敌群规则](enemy-replacement-native.md)已接入开局持久化计划、正式预览/波次及多人共享敌潮种子；严格属性图已适配[Web自增益消费者](../mechanics/client-stat-buffs.md)。

| 数据域 | 已有来源 → 生成器 → 产物 | 消费与覆盖边界 |
|---|---|---|
| 开关姿态与施法前摇组合 | 完整ToggleSkill/PassiveBuffAbility及Sequence/施法伴随Buff/模板/角色模式、CN全等级、缓存动画；[开关六方法](../../work/client-logic/native-toggle-skill/evidence.json)、[目标上限公式](../../work/client-logic/native-block-target-limit/contract.json) → skill_mode_toggle.py / skill_mode_flow_warmup.py / build_skill_mode_data.py → skill_mode_data.js | 20261003.1新增山S2、银灰S2、森蚺S3共30等级；姿态开关、独立属性/回复、前摇免疫、主体结束眩晕及目标数上限。模式提供者累计56技能557等级；来源编译、30等级/10赛季配置/9主机恢复通过。姿态SP回复/自动维持开及1.5秒动画完结映射仍为推断，BasicSkill不可读输出不是SP证据，见[研究R50](findings.md#r50-双向切换与准备持续结束组合2026-10-03) |
| 下一击主发出事件附加能力 | 完整ReplacementSkill/并行根/监听Buff/额外别名Heal及事件枚举 → next_attack_compound.py → next_attack_skill_data.js | 瑕光S1全部10等级由完整图匹配，主攻击一次发出附加独立治疗；2实际赛季配置、3主机恢复。不是每命中回血，也不等于一般并行调度或完整天赋模组；见[批量机制](../mechanics/garrison-skill-batches.md) |
| 常驻被动/有限顺序技能与延迟固定落点敌弹 | 冻结完整组件/所有权、源等级、动画与原生枚举 → skill_mode_passive.py / skill_mode_flow.py / enemy_attach_projectiles.py → skill_mode_data.js / external_combat_data.js | 2026-09-21按完整图接3技能30等级和1敌普通主体；常驻无主动状态、子项依序激活、动画事件治疗及3秒固定范围命中。6实际赛季配置、10次主机恢复；仅限定主体，标记生产者、其他组合叶子和完整阶段仍待接 |
| 干员限时攻击/治疗模式 | 已冻结完整角色与技能图 + skill_table 全等级 → build_skill_mode_data.py → skill_mode_data.js | skill-modes.js 切换行动/选敌计划，client-programs.js 复用属性层；首组4技能40级，真实源标签经 source-battle.js 进入敌群。只记限定技能主体；完整仇恨、原生帧相位及治疗弹道另核，见[模式主体](../mechanics/operator-mechanics.md#限时攻击与治疗模式2026-09-17) |
| 棋子固定养成、模式/回合配置 | activity_table 的 AUTOCHESS_SEASON 与 cultivateEffectList → build_mode_rules.js → mode_rules.json | 2赛季233个棋子配置（非233名干员），含16个模式记录；养成已接，battleData/stages 主波次已接，动态分支仍未完整消费 |
| 完整敌群输入 | autoChessData / 两季敌群 / enemyDataLevelId → build_enemy_encounters.js → enemy_encounters.json | 两季七类、60/67条主敌及随从关联、权重/前后半/模式禁用、324随机池和4条专用覆写，共325个基础定义；另导出324份纯数据库数量属性及maxLevelCnt，已接首波首片段六模板替换 |
| 基础干员/敌人 | character_table、enemy_database → extract_battle_data.py → battle_data.json | 干员库展示454名资料；固定招募名册按赛季独立生成（初版95名、II 112名）；build_levels.js输出battle_levels.json，engine使用敌人属性 |
| 阶段属性与范围 | character_table、range_table → extract_level_data.py / extract_range_data.py → level_data.json / range_data.json | 本轮普通/精锐230组基础属性对照通过，范围与详情共用养成 |
| 技能 | character_table、skill_table、range_table → build_operator_skill_levels.js → operator_skill_levels.js；旧 skill_data/skill_choices 保留身份选择及旧效果子集 | 454资料身份、917技能、9125份等级参数；账号/固定养成/文案共用取值，源文件SHA随产物保存。数据齐全不代表全部执行，见[技能边界](../mechanics/operator-mechanics.md#逐等级技能与狙击技能批次) |
| 天赋与模组 | character_table / uniequip_table / battle_equip_table → extract_talent_data.py / build_modules.js / build_basic_attacks.js → talent_data.json / module_data.json / basic_attacks.js | 天赋候选筛选与部分执行；医疗新增三种技力支援、录武官/莎草及白面鸮/华法琳四组模组字段，赫默新增职业攻速光环与模组升级；赫默源无人机、蜜蜡沙之碑、夕小自在属性/技能/范围由build_basic_attacks导出，夕X模组保留无名字的范围候选。其余模组仍多为扁平属性，不视为完整升级效果 |
| 卫戍协议专属特质 | 两赛季 charChessDataDict/garrisonDataDict + enemy_database 标签 → build_garrison.js → garrison_data.json | 200/266 棋子变体保留，运营/传递/战斗事件贯通；[未完成项](../mechanics/garrison-implementation.md)包括定制品池、权重和部分上游状态/弹药行为 |
| 名册/盟约 | 活动 charShopChessDatas、charChessDataDict、bond 配置 → build_mode_rules.js / build_op_bonds.js / extract_bond_data.js → mode_rules.json / op_bonds.json / bond_data.json | 正式固定名册已按 season+chessId 隔离，初版95槽、II 112槽；旧姓名/阶数目录不是正式招募资格依据。原型、好友助战、隐藏奖励及继承边界见F04/F06 |
| 经济/策略 | 两季shopLevelDataDict、effectBuffInfoDataDict、band 配置及匿名battle_misc_table → build_mode_rules.js / extract_training_config.py 等 → mode_rules.json / training_config.json / band_effects.json | 商店槽位/升级价格和策略按本局赛季/模式读取；第一季训练新局生命45、四轮资金3/8/6/7及四级26条权重已接。正式/第二季基础资金、完整概率和库存仍缺，不能套用训练；具体原生与源对象见[训练经济](../mechanics/shop-items.md) |
| 装备/装置 | act2 effectInfoDataDict、两季effectBuffInfoDataDict/trapChessDataDict及JP GlobalBuff → build_equip_data.js / build_items.js / build_equip_protection.js → equips.json / trap_data.json / shop_items.json / equip-protection-data.js 等 | 既有装备115条配置；两季市场105记录、14件执行映射，含防暴盾单件有来源敌方命中及炎国短刀单件普通/进阶成功施法叠层；短刀满层仍抽随机数，旧常驻重复加成已移除。使用/事件/部署子系统已有，特殊效果、概率、多件环境实例和完整来源仍需逐类核对 |
| 地图/路线 | levels/activities/*、mapData、routes → build_levels.js 与路线转换工具 → battle_levels.json | 16地图条目，当前筛选可玩11个 covenant/covenant2；地图模板不等于每轮敌潮 |
| 轮次关联 | activity_table.battleDataDict/stageDatasDict + 原关卡 → build_mode_rounds.js → mode_rounds.json / 自动关联报告 | 2赛季16模式302个回合候选，47/47文件已找到；继续经build_source_battles生成47关/292敌人变体；主波次已替换运行期随机genWaves |
| 元素系统 | buff_table / enemy_database / 图鉴 → build_elemental_data.js → elemental_data.js | 5 类积累/爆发基础、2130 条敌方抗性/类型目录，当前关卡属性优先；不代表 2130 种敌人都完整实现 |
| 敌人能力 | enemy_database / 图鉴 / 活动表 + OBB enemy prefab → build_source_battles.js / build_boss_mechanics.js / build_enemy_passives.js → source_battles.json / boss_mechanics.json / enemy_passive_data.js | 292源变体保留原始能力及levelType覆写；九根BLOCK_FREE、acstma/acstmb受伤转移及achunt最终死亡清理已接；四根永久achunt_mark已核，三子体TARGET/事件来源仍未确认，见[根被动](../mechanics/enemy-passives.md)。定向5个逻辑Boss已接固定站位/受击区、部分普攻/低血机制，昆图斯大潮/崩坍按当前模式和源CD执行；自动阶段/预设装置等仍缺，见[机制边界](../generated/boss-mechanics.md) |
| 图像/音频 | OBB → decompress_ab.py、export_*、图集工具 → web 下资源目录 | 图标、头像、部分地块/音效已消费；未接资源不能算已复刻动画或地图 |
| 敌人模式与动作 | 紧凑 CN prefab + JP ClientLogicStore → 冻结组件/归属/七类合同；同版 CommunityStore → 完整 Buff 图；enemy_database → 所需天赋黑板缓存 | enemy_mode_profiles 与被动 provider → external_combat_data.js；独立模式、出生选择、根阻挡和受约束 HP 链已接。HP 同时消费全部声明 Buff、DEF/法抗加成和输出倍率；生命周期/作用域等推断保持标记。后续按卫戍池基础优先级补技能/能力、Buff和模式生命周期，不重复分析已接 provider。见[统一模式入口](enemy-mode-dispatch.md#七类合同与统一推进)与[实时覆盖](../generated/community-coverage.md) |
| 敌人 SP 与技能调度 | 固定技能组件表 + enemy_database.spData/skills + 完整充能/苏醒 Buff 图 + 原生合同 → enemy_skill_dispatch.py / enemy_self_cast_skills.py / build_external_combat_data.py → external_combat_data.js | enemy-skills.js 与 enemy-skill-lifecycle.js 消费共享 SP、施放前扣费、普攻充能、双目标技能、HP 监听显式自身施法。实际接入 ID 退出派工；无卫戍触发环境的组单列暂缓，其他阶段另计。见[共享 SP 与技能调度](../mechanics/enemy-skills.md) |
| 敌人周期事件与具名能力 | enemy-periodic-ability-contract.json 的完整模式图/几何/原生 → enemy_periodic_abilities.py / build_external_combat_data.py → external_combat_data.js | enemy-periodic.js 统一消费模式移速、最大 HP 自伤、直接 Scream 与普通动作 EP。稳定 group ID 独立退出派工，不抵扣 EnemySkill 与整敌待办；周期相位可随主机存档恢复。见[模式周期事件与具名能力](../mechanics/enemy-skills.md#模式周期事件与具名能力) |
| 敌人冷却型范围近战技能 | enemy-area-melee-contract.json 的完整技能/范围/动画/原生 → enemy_area_melee_skills.py / build_external_combat_data.py → external_combat_data.js | enemy-skills.js 复用技能状态，增加零 SP 冷却入口、出手前范围重选与施法参数快照；external-combat.js 消费有上限的原生动画缩放。只对完整子类放行源 Boss，保留专用执行器。见[冷却型范围近战技能](../mechanics/enemy-skills.md#冷却型范围近战技能) |
| 敌人攻击回复与命中 Buff 远程技能 | enemy-tagged-ranged-contract.json 的完整选择器/SP/动作/弹体及数据库 Buff → enemy_tagged_ranged_skills.py / build_external_combat_data.py → external_combat_data.js | 统一消费一次成功输出回 SP、施法期停止回复、地面与源标签过滤、owner 模式范围及命中时眩晕；使用加载后的可闪避/状态抗性字段，弹体保存效果快照并可存档恢复。见[标签远程技能](../mechanics/enemy-skills.md#攻击回复-sp-与带-buff-的标签远程技能) |
| 数据库/常量 | build_db.js 等 → SQLite/导出 JSON | 存在手写常量与多处生产入口，尚无完整生成依赖图；重建前检查覆盖范围 |

以上是主要入口而非“全量重建脚本”。各命令、前置关系见 [toolchain.md](../development/toolchain.md)。

<a id="priority"></a>
build_elemental_data 同时保留图鉴 enemyLevel，供华法琳模组区分普通、精英和领袖；没有该源分类的敌人不按名称或生命值猜测。

## 本批共同执行边界

父 DPS 当前执行路径与数量以[实时覆盖表](../generated/community-coverage.md)为准，剩余按[固定模板队列](../plan.md)推进。早期原映射 107/1001、首失败分布和 690 个诊断组是历史快照，不能作为现在的队列或覆盖率。`skcom_heal_self` 的源方法与部署程序历史取证仍可定点引用，见[父自疗专题](../../../docs/client-self-heal.md)，不据此重启逐槽原生审查。

Web银灰最终防御已传播到元素/流形平加、实际承伤、选敌、链接和面板，见[属性消费者](../mechanics/client-stat-buffs.md)。achunt根`achunt_mark`是永久标记，已接最终死亡清理；旧动态标记解释已替代，但三子体TARGET/事件来源和其他主动技能仍未接，见[清理取证](enemy-achunt-cleanup-native.md)。数据与测试分别证明来源及实现范围，不把此局部接线视为全敌人/全模式完成。

## 架构与数据问题分类

分类：**A** 本地数据够、可直接修；**B** 数据已有、需要接线或跨模块梳理；**C** 字段/行为证据不足、需定向获取；**D** 工程和表现。P0/P1/P2 只表示影响级别，不是另一个推进队列；实际工作顺序见当前计划。

| ID / 优先级 | 分类与问题 | 现状 / 已有依据 | 下一步与验收 / 待获取内容 |
|---|---|---|---|
| F01 / P0 | A 固定养成与面板失真 | **已有修复**：去除阶数倍率；normal/golden 配置+属性关键帧；范围/天赋/详情一致 | 115×2源表对照、账号隔离、合成奖励回归通过；保留逐棋子配置，潜能继承另见F06 |
| F02 / P0 | A+B+C 基础职业与个体技能 | 医疗/吟游者、溅射/余震、七名战术家、标准替身/储存/装填，以及部分元素与召唤主体已有实现；卡达、澄闪、洛洛限定浮游/过载主体已接 | 以原组件和顺序动作识别共用机制，集中列出无法编译的节点和专属例外；[浮游](../mechanics/funnel.md)仍缺精确生命周期/模组，不能继续把整类列为未接。恐惧、火墙及敌方条件附伤等见[元素专项](../mechanics/elemental-damage.md)；具体执行边界见[攻击机制](../mechanics/operator-mechanics.md)、[基础行动](../mechanics/basic-actions.md)、[特质](../mechanics/garrison-implementation.md)。提取/绑定数量不代表完整技能验收 |
| F03 / P0 | B+C 敌群抽取与模板替换 | 47份源文件已读入；原生三类抽选、类型次数、前后半池、权重/禁用、数量/间隔规则已接，六模板按持久化计划替换；预览与正式波次同源 | 继续核原版PRNG/洗牌具体实现、服务端覆盖、特殊援军/token与extraEnemy分支及随机组。当前独立seed流为复刻约定；旧休整存档保留原波次，新局启用计划，不以移植测试自证原版全流程；模式结算规则另见F07/N01与机制清单R07/R08 |
| F04 / P0 | B 赛季目录与缺失干员 | **固定槽位已修复**：初版95名、II 112名；原33名缺口和16条阶数差异归零。207槽逐个实际抽取/购买/禁用并对照默认技能、盟约、养成与模组属性。隐藏同身份旧槽不再覆盖正式槽。身份配置不等于战斗机制完成 | season+chessId已贯穿固定名册与读档；隐藏仅接受明确奖励；[四槽持有六星甄选](../mechanics/diy-roster.md)已接入，原型模板/好友助战/备用技能及潜能继承仍待核。验收见 `_season_roster_smoke.js` 与个体清单；F04整体仍未完成 |
| F05 / P0 | B+C 路线/分区/出生漏怪 | 普通及Boss统一转换源行坐标，按敌人motion遍历；1,696组组合检查地面节点与边，Ⅱ地图地面绕障动态回归通过；移除不可达直线兜底，练习入口重载地图/路线并重置镜头 | Boss换区阵型相对位置/装备已保留、休整加载不二次偏移；围栏显示与阻隔工事/射击台静态接入、当前敌潮路线分离/去重已补；巡逻、工事破坏、其他装置、动态分支/extraRoutes和联防语义仍需校准；缺客户端同关卡截图/阶段序列时只推迟相应语义 |
| F06 / P1 | B+C 天赋/模组/原型完整属性 | 阶段、blackboard、equipLevel、backup映射及角色/装备原组件已在本地；目前潜能用backup基线 | 先按条件、替换与继承动作分组未支持效果，追同棋子自持有/原型/助战的数据流和模组属性顺序；仅对仍不能确定的分支补同版面板或运行观测，范围见机制清单R09 |
| F07 / P1 | B+C 经济/决策/道具细节 | 已修16起步/AI+6、老鲤覆盖发放、策略赛季/8部署上限；商店费用按源表。第一季训练新局45生命、四轮源资金覆盖余额、四级候选已接；第四轮Boss的30000生命原已由源关卡生效。14件市场映射含防暴盾有来源命中、短刀单件两版施法叠层/满层随机消耗及旧常驻重复加成修正。其他模式基础4/5/6及后续封顶10仍是推断/临时约定；isSpPrepare、准备计时、机变预览确认已有 | 第三轮六槽/四人轮选、NPC坐标转换调用链及多件装备环境实例仍待核；短刀单件执行已接，不能据此计完整训练机变；缺号在同版JP/CN表均不存在，需缺号处理/热修定义，不能再以重找JP表代替。正式模式事件池、排序/超时、共享库存/返池/概率、资金和首轮折扣仍需核验；[方法入口](native-domain-entrypoints.md)区分本地生成与服务器注入，旧审计的名称未命中不能证明资源不存在 |
| F08 / P1 | B+C 复杂敌人与Boss | 早期3个AB/5个逻辑Boss已有受击区、目标与部分技能执行；现已批量提取敌方预制体、Buff动作及原生方法目录，资源范围不再限于这5个Boss | 沿敌方共享冷却/触发/条件/模式节点批量接入，再处理昆图斯阶段/预设子代、胄分支/传伤和萨米列攻击等例外；[Boss报告](../generated/boss-mechanics.md)记录已消费子集，[方法入口](native-domain-entrypoints.md)列现有取证来源。保留模式条件，不重解全部敌人资源 |
| E01 / P1 | D 模拟不可重复 | **基础切片完成**：固定1/30秒tick、最多8步追赶、独立逻辑seed/state；30/60/144Hz步数与随机状态恢复通过 | 剩余全量命令输入、回放与状态哈希；G/B直接写入仍在 |
| E02 / P1 | D 长局恢复 | **单人已纯本机**，支持休整保存/继续；多人能恢复仍在运行的房间 | 房主重启后恢复、战斗中途快照、多人一致检查点与跨版本迁移仍未完成。名片持久化不是对局持久化 |
| E03 / P1 | D 大量对象/多人战场 | 已接服务器独立普通战、联防/Boss共享实例与观战。2026-09-11本机8干员场景，20份开战快照gzip平均16,142字节；每次包含地图与完整干员条目 | 按目录ID复用静态资料，地图仅切换时传，战斗动态与运营状态分开同步；显示插值已于2026-09-12接入，判定与60FPS绘制分离。约10Hz的1.29Mbps/客户端仅为该样本估算，仍需四人长局和实际链路测量 |
| E04 / P1 | D 生成链漂移 | check_game.js统一只读检查mode/源轮次/敌潮生成漂移及核心玩法，失败非零退出；其他JSON生产入口仍分散 | 全部数据生产入口的增量依赖图仍待补；不把检查命令当全量重建命令 |
| V01 / P1 | C+D 棋子/特效/地形还原 | 已有资源索引、导出器及角色/敌人prefab引用；原版Spine/动画/骨骼/材质/投影映射未齐 | 按当前计划R10/R11复用共同索引，从代表对象完成逻辑→动画事件→浏览器表现闭环，再增量扩展同构资源；剩余帧序、材质和投影差异明确保留，不因全量耗时在此永久延期 |
| V02 / P2 | C+D 精确UI/镜头/音效 | 开局设置、选图/确认分离、BGM静音记忆和统一盟约图标已修；正常结算两图已收到，两屏个人结果/真实用时已接 | 原版结算奖励公式与真实同盟表现归F07/N01及机制清单R07/R08；贴图/模型与精确镜头按计划R11校准，先用现有资源/录像定位差异，避免无依据的反复全屏试调 |
| N01 / P1 | D 联机与分享专题 | **用户已反馈异地连接成功**；独立运营与自动战斗、权威过轮、共享Boss血量和伤害节点、观战与运行中重连已接。新版页面退出清理与进程归属已过本机专项，尚待用户验收新版 | [方案与实验](../development/multiplayer.md)：推进真实四人整局、弱网/休眠恢复、同步流量和房主退出后的恢复；公网托管、HTTPS适配仍是备选专题，不重复把“能否连上”作为首要未知 |
| D01 / P1 | D 文档可信度 | 本次移除已修的医疗错误/单人服务器依赖等过时现状，修正波次完成边界；覆盖报告可重建 | README只作使用入口，推进计划排顺序，本表记数据缺口，各专题记机制，清单记验收；历史任务状态保留 |

下一批任务和顺序见[当前推进计划](../plan.md)；跨领域原始逻辑范围见[机制清单R01–R12](../checklists/mechanism-research.md)，旧B01–B09及个体推进记录保留在[实施清单](../checklists/README.md)。

## 出怪问题的发现与替代（2026-09-12 → 2026-09-14）

[Verified 源字段] specialEnemyNum=3；类型表有6类参与随机，SPECIAL不参与随机。特训主敌关联普通/精英随从，另有前后半、权重和模式禁用名单。三类不是三种单体，不能把七类随便抽三类，也不能删掉普通敌人、悬赏或Boss召唤来凑数。

[历史实现核查，2026-09-12；已替代] 当时battleSourceForRun直接读取声明动作，run-setup未锁定三类特训；旧enemy_type_pool仅有II扁平名单，正式源波次未消费它。这是当时频繁出现六类模板敌人的已定位原因，不能继续写作当前状态，也不能据此量化原版难度偏差。

[当前实现，2026-09-14] enemy_encounters.json保留两季关联、4条实战覆写及独立数据库数量属性；run-setup锁定并持久化三类与逐轮计划，正式预览/波次及多人共用敌潮seed。原生确认属性加权强度、factor分母、银行家舍入、count×interval保持及逐轮池选择，见[原生取证](enemy-replacement-native.md)。具体原版随机序列、服务器覆盖及特殊援军/token/extraEnemy仍未确认；这些边界不再阻塞已确认的六模板替换。modeFactorInfo/difficultyFactorInfo未在上述公式中使用，不能额外当攻击/生命倍率。

## 已修问题与仍存边界

- 医疗/吟游者普通行为和精调分类已修；454是职业资料数量。个体技能、天赋和模组仍有缺口，统一见基础行动专题。
- 单人已不依赖房间服务器；休整存档可用，战斗中途保存及多人重启恢复仍缺。
- 联机位置插值已接，判定与绘制分离；2026-09-11旧样本gzip约16KB/帧仍仅作历史负载基线，不代表四人Boss峰值。
- 空波次收尾、倒计时、装备相邻落点、预览散布、名片入口、合成确认与A/S/D/G/C已修。高台拖拽保留真实部署类型；补齐满员移动/交换的提示与落位一致性，围墙地面和射击高台分开画（见findings R14）。移动/交换有部署音效，免费刷新显示FREE矩形徽标；盟约移除人数分数，保留层数、圆弧和详情门槛。
- 寒霜减攻速光环、暴鸰一次投弹/爆炸、幽灵不可阻挡及近战判定已接；冰爆虫死亡寒冷/冻结、凿冰人/破冰者冻结目标增伤亦有明确主体。器物14本体死亡生成及14种子敌有效命中次数已接，见[器物专题](../mechanics/enemy-death-spawn.md)；另有九个明确源根被动的[永久不可阻挡](../mechanics/enemy-passives.md)已接。器物子敌的公共阻挡判定页仍不可读，不能由这九个ID外推；散布/障碍、其他状态来源、堂皇护盾和独立能力仍待核。
- Boss固定受击区/整图、部分技能及生命归零判胜已接；昆图斯自动阶段/子代、胄/帝国余晖/萨米复杂分支和完整模型动画仍缺。
- 再部署使用独立费用池，源initialCost=10/maxCost=99/costIncreaseTime=1、每30模拟tick回1费；重复再部署倍率、个体减费和回费时序仍需核对。
- 禁用干员按本地开局策略抽取，未确认原版名单算法；第一季训练四轮资金和四级候选已取证，正式模式有限共享卡池、概率、基础资金和完整机变池仍需商店/决策专题所列证据。

## 剩余证据如何继续获取

- **敌群替换**：已接逐轮计划、六模板换算、预览/波次和持久化；下一步定向核服务端覆盖、特殊援军/token/extraEnemy分支及原版随机序列，不重复全量解包。
- **轮次、经济与阶段**：第一季训练对象、同版JP活动表、初始生命和第四轮Boss源HP已核；继续追NPC预置到坐标转换的调用方，以及第三轮缺号处理/热修和四人轮选，不能重做已消费字段。正式模式继续读多人数据桥和`AutoChessGameManager`的输入/状态转换，见[方法索引](native-domain-entrypoints.md)。教程、录像、结算图用于交叉核验；只有静态/原生链仍不能回答的分支才补对应返回或短片。
- **属性与技能**：复用逐等级源表、角色模式、弹体、Buff事件动作和原生公共方法，按相同执行结构成批验证普通/精锐、账号练度、潜能与模组差异。只为剩余帧序、热修和跨版本冲突补实际观测，不把每项技能重新退回文案猜测或录像起步。
- **资源关联包**：限定代表干员/敌人/地图的bundle、path_id、引用prefab、骨骼/atlas/材质、命中/动画事件。服务V01；先查现有SQLite，不重复全量扫描。
- **版本对齐**：记录APK/OBB版本和gamedata修订/哈希。旧日服包与当前中文表之间的缺图或差异，不能一律解释为没有资源。

## 已知定位与研究边界

官方活动表的 AUTOCHESS_SEASON 与 versionInfoDict 列出 act1autochess(V1)、act2autochess(V2)；act1vautochess 未在这两个映射中出现，不能仅因名称归为“第一赛季”。社区“上/下半”与上述ID应逐项对照。

OBB链路已打通：UnityFS → 项目LZ4变种解码 → UnityPy → 资源导出；work/inventory.sqlite提供bundle/object查询。职业/技能图标、敌人头像、autochess段位、地块和音效有现成导出器。历史数量和具体bundle列表保存在[旧资产管线](../archive/20260908/docs/asset-pipeline.md)，不拿旧命中率作当前覆盖率。

旧“卫戍协议配置不在OBB”“OBB没有盟约图标”等结论只来自当时扫描范围/名称匹配；未命中不证明全包或其他版本不存在。规则JSON的可用源已经在本地gamedata，不必为本轮基础修复再遍历全部OBB。

旧metadata/XOR尝试失败同样只描述当时方法；已恢复的结构、可执行方法映射和公式见[逻辑管线](client-logic-pipeline.md)。未解析的模块/字段、XLua覆盖及服务器输入须逐项记录，不能概括为“APP代码解不出来”，也不能反向宣称已取得全部C#源码或服务器算法。

## 验证与文档维护

运行 `node tools/build_enemy_encounters.js --check` 和 `node tools/audit_content_coverage.js --check` 检查新导出及源表/实际名册差异。`node tools/check_game.js` 运行已登记回归。747是47份文件合计声明敌人数，352是SPAWN动作数，均不是一局敌人数。

职业行动、干员特质、商店、决策与Boss细目各回其专题维护。本表不再复制历史完成补记；工具通过只证明被检查的边界，不证明原版全机制一致。

### 局外技能与装备详情目录（2026-09-12）

tools/build_detail_catalogs.js生成web/skill_choices.json和web/equipment_details.json；复用技能提取/分类纯函数，保留已有默认技能补丁，不覆盖skill_data.json。可选技能目录按battle_data收录454个条目（含无技能条目）。干员页现已开放全部454名资料与技能选择，支持筛选当前赛季固定名册（初版95人、II 112人）；额外资料使用独立展示条目，不修改ROSTER、商店池和当局技能快照。未纳入名册的干员不能调试加入候选区；初版原缺失33人的固定招募资格已接入，但其技能、天赋和召唤仍须逐项核验，不以名册可见代替玩法完成。装备115条按effectId关联trap_data与character_table，变形同构体对应表完整来自原始天赋。未覆盖的复杂技能见F02，不以目录数量判断完成度。

2026-09-12 骑士储蓄罐修复：[Verified 源字段] act2的`chess_item_3_12_e_a`为`itemType=EQUIP`，关联`eff_acarm123`；名称及1～6资金效果已在源表中，进阶`eff_acgarm123`为2～12。小贾斯汀第1/4/7/10回合奖励此前被`rewardTrap`误标为可部署装置，名称直接使用chessId，事件也无法命中。现将此类奖励转换为实际装备/消耗品的effectId、名称和类型；旧休整库存加载时仅修复身份，不重发奖励或消耗随机数。图标复用本地`竞技投币机.png`：[PRTS文件页](https://prts.wiki/w/文件:卫戍协议_道具_骑士储蓄罐.png)重定向到该原图。`_items_smoke.js`覆盖实际策略轮次、两档奖励、拖动目标/防重复、存档及房主模拟恢复；不会将“源字典名称含trap”视为可部署的证据。

### 2026-09-12 固定名册批次 B01

`mode_rules.json`新增源chessId/隐藏/模板/盟约字段；`module_data.json.bySeason`按赛季与槽位保留默认模组属性。运行名册通过`ArkRunSetup.rosterProfiles`筛选，两季普通商店分别95/112人；同charId隐藏旧槽另存byChess，不覆盖正式槽。明确获得的盟约·辅助干员仍可发放。开局禁用、默认技能、固定养成、已接入的模组机制以及本机/房主运行时使用同季配置。

`_season_roster_smoke.js`对207个固定槽逐个实际抽取、购买、禁用并对照源字段；每个未验收的完整技能/天赋仍保持未勾。旧版休整存档只迁移精确已知目录，按存档赛季重新绑定；若库存身份不存在于该季则拒绝读取并保留原存档，不悄悄删干员。多人战斗快照不跨版本迁移。隐藏来源、DIY原型、替补继承继续保留待办。
