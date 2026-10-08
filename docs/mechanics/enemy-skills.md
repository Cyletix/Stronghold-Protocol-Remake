# 敌人共享 SP 与技能调度

[机制导航](README.md) · [基础优先级](../generated/garrison-foundations.md) · [完整源合同](../../work/enemy-skill-sp-contract.json)

本页维护固定技能表的共享 SP、选择器、施法、Buff 与周期能力合同。各子类的源依据、运行边界和验证集中在对应小节，当前数量只看[基础优先级](../generated/garrison-foundations.md)。已接技能本体与真实模式入口分别记录，不能据此推算整敌完成。

## 原始依据

### 大剑组首次与连续攻击（2026-09-15）

本批按完整 `MeleeAttack + NoPreOneshotAnimation` 结构一次接通萨卡兹大剑手、萨卡兹大剑组长两种卫戍成员。两个根动作的 `_animKey` 本来就为空；这不是缺动画资源，动画由同物体挂载的行为供应。池外 `enemy_5032_dqmon` 有相同供应器，但未因此加入卫戍派工。源哈希、接受/拒绝成员与边界在[导入报告](../../work/external-combat-import-report.json)的 `preAttackAnimations`，原生方法收据在[定点缓存](../../work/client-logic/native-enemy-no-pre/evidence.json)。

**Verified（静态源及原生基础分支）**：已缓存 Unity 组件证明根近战动作与供应器属于同一 GameObject；CN 完整序列化动作在两种敌人间一致，新增未知字段、额外模式、附加 Buff 或挂载不一致均拒绝套用。已有带来源的 Spine 补充包含首次 `Attack`（长 1.5 秒，0.9 秒命中）、连续 `Attack_NoPre`（长 1.1 秒，0.5 秒命中）及结束 `Attack_Idle`。JP 36.7.22 `NoPreOneshotAnimation.UpdatePlaybackSpeed` 根据 `firstAttack` 选择前两者，按 `min(攻击间隔 / 动画时长, maxAnimScale)` 调整，当前上限为 1；该供应器没有其他动画执行器的 0.1 下限。`CombatState.OnEnter` 传入首次标记 true，成功连续攻击回调传入 false。

**Inferred（本地战斗桥接）**：本地以持续阻挡维持连攻状态，离开阻挡或控制状态边沿使下次攻击重新采用首次动画；这是现有引擎与原生 CombatState 的桥接，不是完整 FSM 还原。CN 新增 `_affectedBySlowDown=true`、`_checkFaceToFirstCastTargetDownAttack=false`，JP 缓存没有这两个字段，其余共享动作字段一致。普通攻击仍沿当前引擎的起手冷却与战斗帧时钟执行。

**实现与验证**：`enemy_pre_attack.py → build_external_combat_data.py → enemy-pre-attack.js` 为两种敌人生成并执行同一合同。真实战斗验证首次与连攻各只在对应事件结算一次物理伤害、未接敌不攻击、重新接敌恢复首次动画、明确空远程通道、显式时序覆写；两种敌人在首次动作中保存主机快照，恢复后伤害、事件游标和后续连攻完全一致。5 项 `tools/test_enemy_pre_attack.py`、`tools/_enemy_pre_attack_smoke.js` 及原 `tools/_external_combat_smoke.js` 通过。池内普攻缺口减少两个，不等于两种敌人整体完成。

**仍未完成**：原生中断后的精确定时、施法中途动态攻速变化、原始 Spine 及结束待机表现、所有关卡覆写和整敌组合验收。基础行为与整体验证清单保持未勾。

### 掠海漂移体悬浮与落地（2026-09-15）

[完整源记录](../../work/enemy-hover-contract.json)复用已冻结的两个模式、组件归属、Buff 图、敌人数据与动画。只定点读取缺失的 Buff 启用条件、运动切换和技能装配入口，原生版本、文件 SHA、完整字段及不可读记录随合同保留。`enemy_hover.py` 按已复核的整个源组指纹编译；源字段或关卡入口变化时拒绝静默套用。

**Verified（静态源与原生基础分支）**：模式 0 挂载 `enemy_syufo_fly`，本地黑板 `motion=1`、`mode=1`；模板在启用时改运动类型，禁用时切模式并附加 0.5 秒眩晕，结束时恢复默认运动。Buff 可被眩晕/冻结禁用，不受沉默/浮空禁用；睡眠也不在该条件中。模式 0 使用远程动作，模式 1 只提供接触近战通道。原 `canAttack=true` 不再使模式 1 的空远程通道回退成远程攻击。

`RecoverAnim` 虽挂在模式 1 并有 AlwaysTrigger，但当前敌人和卫戍关卡没有匹配技能数据。原生 `Enemy._AssignSkill` 对未匹配的技能调用 `set_isEnabled(false)`，因此本轮不伪造恢复施法。派工工具单列 `source-skill-inactive`，保留未完成总数；源指纹变化或出现恢复配置后重新开放。这与奇美拉的环境标记门控是不同原因。

**Inferred（运行桥接）**：将原生整数运动值与唯一 `motion` 黑板键对应到现有 FLY/WALK；将 Buff 禁用事件目标映射到自身，并在战斗更新边界观察控制状态、重算阻挡。CN 新字段 `isGroundBoundable` 接到地面束缚状态，JP 原生版本尚无该条件。落地后保持地面状态，控制结束不自动恢复悬浮；已有更长眩晕和免疫保留。不是完整原生事件/物理时钟的逐帧还原。

**已验证**：真实源实体悬浮时不占阻挡数，地面普攻不能锁定；眩晕/冻结后落地可阻挡，控制到期不反复落地；沉默、睡眠、浮空不错误触发；落地后无远程攻击。空中与地面普通命中均沿已有元素入口附带攻击力 50% 的侵蚀损伤（500 攻击对应 250 积累），显式零覆写不产生损伤。两种状态的真实主机快照恢复结果一致。

**仍未完成**：落地时原生动态地形/坠落检查、路线位置重算、UNBALANCE_IMMUNE 的完整位移交互、原始特效与转场动画。因此不勾选近地悬浮整项或整敌完成。测试为 `python tools/test_enemy_hover.py`、`node tools/_enemy_hover_smoke.js`；相关飞行阻挡、元素、模式/技能调度、周期能力、投弹、弹体及敌潮/存档回归通过。旧休整测试改为分别验证数据版本拒绝和明确允许的迁移，未扩大生产存档兼容范围。

### 暴鸰参数修正（2026-09-15）

本轮修正现有投弹路径的参数消费，**未勾选完整 `Boomb` 技能或整敌完成**。`tools/inspect_enemy_bomb.py` 复用冻结技能组、已解包弹体及动画补充，只对缺失的六个原生入口定点取证；原始对象、版本和 SHA 保存在[暴鸰源记录](../../work/enemy-bomb-contract.json)。`tools/enemy_bomb_parameters.py` 验证当前动作/兄弟组件、Buff 属性公式、单次输出事件和区域类型，再由外部战斗数据生成器接给网页与房主共用引擎。

**Verified（静态源）**：`Attack` 长 1 秒，唯一 `OnAttack` 为 0.2666667 秒；动作采用 FROM_ATTACK_SPEED、最大比例 1，复用已确认的最小比例 0.1。原先固定 0.45 秒的前摇已替换为该事件时间，并接受现有攻击迟缓时钟。技能 `initCooldown` 的显式 0 得以保留。`bomb_s` 的属性是 MOVE_SPEED / MULTIPLIER，`move_speed=2` 应为单独乘区 ×3，原 ×2 已修正；关卡覆写的 0/+4 对应 ×1/×5。

弹体真实 `BoxCollider2D` 大小 3×3，当前以半宽/半高 1.5 检查中心坐标；发弹后快照保存区域和伤害来源。起手排除撤退、不可选中、隐匿及迷彩目标；落点范围伤害按源配置忽略迷彩，逐个计算防御与闪避。可见爆炸仍用现有简易表现。

**未完成边界**：BombdMovement 的 OnInit/OnTick 在当前库不可读，已记录零条可读指令，不重复解同一页面；0.7 秒飞行和固定落点仍是旧仿真近似。BuffAfterAffecting 的原生事件分支证明它监听 ON_CAST_START 并等待能力不再 affecting 后 AddBuff，不能解释成起手或发弹立即加 Buff；旧路径的发弹后加速时点仍待完整能力/弹体结束合同替换，未将该时点升级为原版事实。根 Skills 挂载、一次触发的中断语义、模式 1/FSM 及完整事件顺序也保留未完成。

**验证**：`python -m unittest discover -s tools -p test_enemy_bomb_parameters.py` 核真实字段及未知兄弟/公式/附加输出拒绝；`node tools/_enemy_bomb_parameters_smoke.js` 验实际冷却、前摇与迟缓、倍率覆写、3×3 边界、目标资格、死亡后落弹及房主前摇/飞行中保存恢复。旧调试/冰霜/投弹测试继续通过。这些是本次参数实现的验证，不是完整技能的原版一致性验收。

本批最终通过 4 条参数校验和 7 组受影响检查（暴鸰、调试/冰霜、外部普攻、周期能力、弹体生命周期、模拟时钟、飞行阻挡）。当时飞行测试只验证不占用或挤掉地面阻挡位，移动部分人为设置了长攻击冷却，**未覆盖持续有目标时的自然行进，不能称为“站桩已修复”**。2026-09-18已撤掉该绕过，并修复公共动作总长被拉满攻击间隔的问题；现行行为与验证见[普攻动作与行走冷却分离](enemy-basic-actions.md#普攻动作与行走冷却分离2026-09-18)。

### 选择器远程技能

最初接入的家族是“SelectorTrigger → BlockedOrAdvancedSelector → 无额外 Buff 的 RangedAttack”。圆号手模式 0 出生可执行，模式 1 的自动入口另计；编译器同时核普通动作的充能来源，不能只因消耗 2 SP 就推测每两次普攻触发。

[Verified，静态源] CN 数据库与完整配置采用固定快照，JP 原生采用既有 36.7.22 本地库；逐文件位置、哈希和版本见源合同。敌人 SP 数据为初始 0、上限 2、自动回复类型、增量 **0**；两个技能各消耗 2，初始冷却和冷却均为 0。自动回复 0 不能用 `increment or 1` 改为每秒一点。

两模式、两普通攻击通道共四个 BuffToOwner，均在 `ON_SPELL_ON` 挂载即时充能 Buff。完整 `enemy_ltnhor[charge_sp]` 模板只有 `ON_BUFF_START → ModifySp(+1, BUFF_OWNER, force=true, checkSpType=false)`，选中的技能能力本身没有这个兄弟组件。事件枚举中 ON_CAST_START=2、ON_CAST_END=3、ON_SPELL_ON=4，充能不是声明在起手或攻击结束。

[Verified，原生基础分支] EnemySkill.CastToTarget 在调用能力施放前先调用 TryReduceSp；后者向 owner 提交负 SP modifier，说明不同技能和模式共享敌人 SP。成功发起后增加施放计数。Init 初始化计数与冷却，Attach/Detach 的可读部分只启停/挂载能力，没有再次调用 Init 或重置 SP。社区在 cast finish 扣 SP 的做法与这个分支冲突，本项目采用起手前扣费。

`familyMask=3` 为 ATTACK_OR_COMBAT，`postFilter=4` 为 HATRED_DES；它不是最近距离排序。已经不可读的 Buff 核心与模式启停入口没有重试；本次新发现的不可读 CheckFamilyMask、SetParentMode 也随合同缓存。

## 运行合同与推断

[Inferred，调度绑定] 当前引擎把普通攻击动画第一次有效发弹对应到 ON_SPELL_ON，一次施法只充一次；不按目标数、弹体到达或伤害事件重复加点。技能没有该充能源，双目标技能不会自行回充 SP。目标全部失效而未发弹时不派发这个桥接事件。

可用远程技能先于新的普通攻击竞争动作位置，并要求普通攻击冷却可用；已有攻击不被强行替换。技能沿共用 `atkSchedule/atkTargets` 推进前摇、发弹和恢复，期间保留普通攻击冷却。2026-09-15 新补通用 EnemySkill 原生证据后，选择器技能统一在成功起手时重置技能冷却；旧“非零覆写从施法结束计时”的推断撤销。圆号源冷却为 0，因此其原有数值行为不变，动作结束前仍不能重新占用同一动作位置。

模式切换保留 owner SP、各技能计数与冷却，取消未完成旧施法且不退款；已发出的弹体保留各自伤害类型和目标。当前模式之外的技能不参与施放，冷却暂停。源 SP 消耗时点已验证，取消/暂停与本地状态机的组合仍是明示推断。

选敌先取真实阻挡者，其余按仇恨降序，再以部署时间及稳定部署顺序消歧；仇恨使用已有数值字段，默认 0。完整原生 BlockedOrAdvancedSelector 及仇恨积累没有恢复，这个组合保留 Inferred。显式不可选、未部署、死亡、隐匿/迷彩单位不作为新目标。前摇锁定目标，失效后不临时补一个新目标。

## 参数与进度边界

运行时精确匹配 `sourceSkills[].prefabKey`。显式空列表表示没有可启用的这些技能；未提供列表才回退编译资料。消费 priority、SP 消耗、冷却及技能自身的 `max_target/atk_scale`，无关天赋命名空间不能覆写。重复技能键、非法数值和未知技能黑板参数拒绝该技能。原有专用 Boss 和投弹执行器保留所有权；只对可识别的同一旧技能避免重复执行。

生成链为 `work/garrison-skill-dispatch-priority.json + enemy-skill-sp-contract.json → enemy_skill_dispatch.py → build_external_combat_data.py → external_combat_data.js → enemy-skills.js / external-combat.js / engine.js`。状态回执分别保留已接技能、初始可挂载数量和待接组件，整敌、自动模式与其他技能不随本次局部接线完成。

验证使用完整源合同边界、真实配置的连续充能/双目标施放，以及主机 VM 前摇中保存恢复；覆盖零自动回复、起手扣费、模式取消不退款、沉默、目标失效、参数覆盖和已有通道/链弹回归。代码测试仅证明实现合同，不能自证原版全部机制。

## HP 监听器与自身苏醒施法

[完整苏醒合同](../../work/enemy-awake-contract.json)固定钵海收割者与富营养的收割者的同类调用链。源模式 0 的普通动作是零倍率、无动画且无额外伤害包的占位；编译为无普通攻击通道，不能因为遭遇定义 `canAttack=true` 就落入旧的最低一点伤害路径。这种占位到空通道的执行映射为 Inferred。

[Verified，完整配置及真实枚举默认值] Sleepwalking 在模式 0 挂载永久 HP 监听 Buff，携带 DISARMED（异常值 11）；另一 Buff 是 LIMITED、30 秒的 UNMOVABLE_PRIVATE（22）。11 不是 ALLY_TARGET_FREE（15）。30 秒结束只解除移动限制，缴械和监听仍在；不能把它实现为 30 秒后自动苏醒。源天赋命名空间 `sleepwalking.hp_ratio` 与 `sleepwalking.unmove_duration` 分别覆写严格 HP 比较阈值与移动限制时间。

监听器每 0.01 秒检查 HP 比例严格小于 0.9999、没有永久 `dslntc_awake[mark]`、不在 UNBALANCE，随后显式 `TriggerEnemySkill(Awake)`。完整节点关闭 active/ready 检查、允许中断旧能力、清理麻痹并以自身为目标。源 Awake 声明为 AlwaysTrigger；当前通过这条真实监听调用接入，不额外合成出生自动施放。原生 TriggerEnemySkill 节点中就绪检查和清理/中断调用可读，Enemy 内部最终施放入口不可读并已缓存。

[Verified，原生基础分支] `CheckEnemyUnbalanced` 最终比较敌人 FSM 状态是否为 9（UNBALANCE），不等于眩晕、冻结或麻痹。本地仅把明确的 `sourceEnemyState=9/UNBALANCE` 或 `unbalanced=true` 映射到该条件，映射标为 Inferred。不能用当前复刻的普通异常计时器自证原版 FSM 一致。

起手写入永久 Awake 标记并计一次施放；技能不造成伤害或发射弹体。`_timeMode=1` 从源动画读取完整时长，两种变体的 `Skill_Begin` 均为 1 秒；原生 AbstractAnimatedAbility.DoAttach/get_cooldown 支持此取值路径。它不按敌人普通攻击间隔缩放，也不把 `_cooldown=0` 误作零秒施法。结束时消费完整瞬时 Buff 图并切到模式 1。`_interruptAbilityOnDetach=0` 随调度保存，外部模式切换保留这条正在执行的自身施法；计时、目标、自身标记和模式状态均可存档恢复。

[Inferred，生命周期组合] 模式退出移除该模式管理的 HP 监听与剩余移动限制，重新进入会重建这些实例，独立的永久 Awake 标记和技能计数保留。大帧中多个无副作用的失败检查合并，保留周期相位；源慢速标志使用现有行动时钟。施法开始后的眩晕/冻结目前沿引擎暂停约定，后续麻痹等异常的完整原生中断边界尚未闭合。模式 1 的属性、周期事件与元素伤害由下面的完整组消费，不能据此记整敌完成。

## 模式周期事件与具名能力

[周期能力合同](../../work/enemy-periodic-ability-contract.json)复用苏醒合同的两成员完整图，仅定点补齐遗漏的 CircleCollider2D、父 Transform 与新的原生入口；原合同及技能组件队列的指纹不变。源快照、逐文件哈希、字段、枚举和已不可读入口均随该合同冻结。`enemy_periodic_abilities.py` 同时接受 Revive 的属性/自伤/周期调用、Scream 的选择器/具名动作、EP 天赋与模式 1 普通攻击根；任一必需兄弟节点、标志或命名空间不匹配，整组拒绝导出。

[Verified，源配置与原生属性公式] `revive.move_speed=5` 位于 MOVE_SPEED 的 MULTIPLIER 层，即基值乘以 `1+5`，单独效果为 **×6**。两成员基础移速 0.3 对应 1.8。不能把数值 5 当最终倍率；运行层保留基础移速，和同层属性加成相加后参与实际移动。

[Verified，源配置与 DamageViaMaxHpRatio 原生] 自伤每秒触发，等待第一个完整间隔；每次取当时最大 HP 的 `revive.hp_ratio`（默认 0.04）。PURE、`skipModifierEvent=true`、`ignoreForSp=true`、`isUndeadable=false`，具有伤害来源且可以致死。共享入口跳过普通伤害修正及受击回调，保留死亡结算。周期 Buff 的标志允许它独立于普通攻击动作和眩晕行动门推进。

[Verified，完整调用和几何配置] 另一个周期器按 `scream.interval`（默认 1 秒）直接调用 ScreamAttack，`waitFirst=false`。选择器不限目标数，圆形半径 **2.5**、偏移 0，父 Transform 不改变该范围；普通攻击倍率 0，元素类型 SANITY（现有运行语义 nervous），`scream.ep_damage_ratio` 默认 0.2。普通模式 1 combat 动作使用独立 EP 比例 `epdamage.attack@ep_damage_ratio`，默认 0.1。原生基础攻击构造独立的 EP 节点；该源组没有 ON_OUTPUT_DAMAGE 图，不能再追加一份造成伤害监听。

[Inferred，执行桥接] 具名能力直接对当时范围内有效的已部署干员/召唤物累计神经损伤，不占用或推进普通动作的前后摇；零普通倍率不走最低一点 HP 伤害。两种 EP 都采用当前攻击力乘对应比例，再交给已有元素累计和抗性接口，独立于普通防御与法抗。EP 的三个原生公式重载及 TriggerAbility 内部入口仍不可读，因此完整公式与调度组合不能标为原版已完全验证。圆形配置映射到现有格点中心距离的碰撞近似也保留此边界。

模式挂载时建立独立周期相位；立即回调在进入模式后派发，退出时清除该模式计时，重新进入重建。大帧内按到期时间合并事件，同一时点按冻结源顺序先结算自伤；死亡后停止后续回调。模式清理、同时点顺序与按当前帧位置处理跨帧目标是本地执行约定，尚无完整原生更新顺序证明。周期状态只保存稳定 ID、时间和次数，主机 JSON 存档能够恢复相位，不保存实体引用。

导入回执的 `periodicAbilities` 和工作单的 `alreadyBoundPeriodicGroups` 独立记录这两组共用能力。它们不是新的 EnemySkill，不抵扣原 27 技能组件，也不减少整敌待办。验证覆盖两个真实变体的动态移速、范围与召唤物、首个间隔、可致死自伤、零普通伤害的直接 EP、普通 EP 不重复，以及主机周期中保存恢复。

## 冷却型范围近战技能

[范围近战合同](../../work/enemy-area-melee-contract.json)从固定技能子类取完整 CircleAttack：模式 0 已有出生入口，EnemySkill 与 MeleeAttack 的兄弟组件只有表现用 UberEffectEmitter，没有额外 Buff 或动作图。`enemy_area_melee_skills.py` 同时检查技能、模式归属、选择器、范围参数、源动画与全部字段；这个完整子类可以消费源 BOSS 记录，专用 Boss 或投弹执行器仍保留所有权。锏的其他技能、复活和模式 1 没有随本条完成。

[Verified，源配置与枚举] 技能使用 SelectorTrigger，初始冷却与冷却均为 15 秒，消耗 0 SP；技能黑板 `atk_scale=1`、`range_radius=1.5`。选择器不限数量；MeleeAttack 的 `_selectTargetSource=1` 为 FROM_OWNER，`_selectTargetTiming=1` 为 BEFORE_SPELL_START，`_alwaysIncludeTarget=1`、`_allowNoTarget=1`。目标集合必须在出手前重新按施法者范围确定，不能照搬圆号手的整组起手锁定目标、半格扩张和阻挡者优先规则。

[Verified，已有原生动画分支] `_timeMode=0` 为 FROM_ATTACK_SPEED，get_cooldown 读取 owner.attackTime；UpdatePlaybackSpeed 将 `owner.attackTime / 原动画时长` 限制到 **0.1～1** 后用于时长缩放，上限来自 `_maxAnimScale=1`、下限来自已读原生浮点常量。因此普通攻击间隔较长时，这个技能保持原动画时长；间隔较短时才同比缩短出手与结束时点。不能仅从枚举名字推成“原动画直接除攻击速度”，也不能把技能动画总是拉长到普攻间隔。

[Verified，原生计时器] EnemySkill.CastToTarget 成功路径调用 PeriodicTimer.Next；Next 在就绪时将 remaining 重设为 period，随后成功施放计数增加。这是通用 EnemySkill 路径，两个已接的选择器子类因此统一在成功起手时重置技能冷却，动画结束不再重置一次。技能计时在施法期间继续、模式外暂停属于当前调度桥的 Inferred 约定。旧 SP 合同作为历史源快照不改哈希，新的计时证据与修正记录保存在范围近战合同。

[Verified，原生基类选敌] AbilityStandard.UpdateTargets 对仍存活、Unity 非空且不在新列表中的原 inputTarget，不再检查范围或隐匿：新列表非空时先删除末项，再加入 inputTarget。这不是简单追加。当前沿用该基类行为，并用仍在战斗中的未移除实体映射 Unity 非空；范围结果的稳定顺序采用当前战斗列表。MeleeAttack 的覆写入口不可读，因此该继承关系桥接、具体排序和 Unity 实体映射保留 Inferred，不宣称恢复了全部原生选敌实现。

运行层复用已有 `externalSkills`、普通受击伤害入口和主机目标重绑；新类无需伪造 SP 系统。参数使用技能自己的黑板命名空间，正数倍率/范围与非负冷却按完整支持边界校验，非法值明确拒绝，不覆盖成默认值。源 CircleCollider2D 半径为 1，而本技能的明确范围参数为 1.5；原生 `_GetRangeRadius` 缺键回退的是 owner 模式范围，不是 collider 半径。因此显式提供的技能记录若缺 `range_radius`，当前整类拒绝启用；完全未提供技能记录时才使用完整编译快照。范围与倍率随施法保存快照；非中断式模式卸载保留未完成施法，不重新计次。出手使用普通伤害、受击事件和受击 SP，该源技能没有普通攻击的 EP 包，不能从旧 `epAttack` 再补一份。

完整源字段和已读原生证明与本地组合时序分开记录。起手不等待普通攻击冷却，但等待已有动作完成；施法期间普通冷却沿已有暂停约定，目标有效性和格点中心范围沿当前战斗接口。攻击速度变化在起手时读取并确定本次动画时长，中途重新调整播放速率尚未接入。这些调度、几何和动态更新边界为 Inferred，不能用本项目测试自证原版一致。

验证覆盖真实遭遇配置的 15 秒初始冷却、普通动作占用、缩放上下限、半径边界及前摇进出、召唤物、原目标替换而不增数、无普通 EP 串入和主机前摇存档恢复。额外模式切换仅用明确标注的生命周期 fixture，不能作为原版模式 1 已实现的证据。旧远程技能的非零冷却覆盖、苏醒链、周期组及现有模式通道回归均通过。

## 攻击回复 SP 与带 Buff 的标签远程技能

[完整标签远程合同](../../work/enemy-tagged-ranged-contract.json)沿固定 27 组件表补齐 `IronSandStorm` 模式 0 的选择器、动作、弹体、数据库 Buff 和 owner SP。`enemy_tagged_ranged_skills.py` 按完整结构编译，绑定数据库精确键 `ironsandstorm`，不按敌人名称选择实现。该组复用公共技能调度、动画时钟、投射物和异常状态入口；`ArmorPiercing` 的技能本体另见下节，自动阶段与复活仍分别保留。

[Verified，SP 配置与原生事件链] owner SP 为 `INCREASE_WHEN_ATTACK`、初始 0、上限 3、回复增量 1，技能消耗 3，初始冷却与冷却均为 0；这里没有圆号手的充能 Buff。AbilityStandard 在前置等待结束后调用 OnSpellStart，DoCastOnTargets 成功且 `spellCnt==0` 才发 OnOutputAttackOrHeal；经 Entity 到 SpController，以 `force=false` 尝试回复。因此一次成功施法输出只回复一次，不按目标数、命中数、投射物到达或闪避结果计数。EnemySkill 注册期间默认贡献 `SP_RECOVER_STOPPED`，技能也发同类事件但回复被阻断，不能简写成“原生事件只接受普攻”。

运行层在第一次有效出手时桥接该事件，先记录已派发，再判断停止回复；被阻断的事件不会在结束后重试。技能起手扣费，施放期间保持停止回复；两模式普通动作及已接技能共用 owner SP。事件与动画 OnAttack 的最终桥接为 Inferred，沿源 `_waitForAttackEvent=1` 和现有动作时序；并非前摇开始便回 SP。

[Verified，选择器与范围] AdvancedSelectorWithTagAndBuffKey 取地面目标，按 HATRED_DES 排序，排除精确标签 `prison`，源 `max_target=2`；空 Buff 条件不合成额外过滤。`_onlyIgnoreSomeOfTargetFreeCase=0` 下，占位 abnormalFlag 不激活局部忽略条件。CircleCollider2D 初始半径为 2.25，但原生 CircleRange.InitCollidersIfNot 在 `_scaleble=0` 时以非负 options.radius 直接覆盖它；本组实际读取当前 owner 模式范围 2，不附加半格。FROM_OWNER、AT_BEGINING 使本次目标在起手选定，途中失效不换人。

本地地面判断为 `!flying`，`sourceTags` 数组消费明确源标签，不能根据名字猜标签，也不能把高台部署位置当飞行。仇恨并列按部署时间及稳定顺序消歧，沿现有已部署/隐匿/不可选过滤。这些实体、仇恨及格点几何映射仍为 Inferred；测试中的 prison 标签是明确注入的选择器样例，不代表卫戍已接入监狱装置提供者。

[Verified，动画、弹体与加载后的 Buff] 源 C1_Skill 时长 2.0667 秒，OnAttack 为 1.4667 秒，FROM_ATTACK_SPEED 沿前节 0.1～1 的时长缩放。`projectile_enemy_jakill_s1` 弹速 10、寿命 10 秒、最多命中一次，配置允许到期强制到达、结束命中原追踪目标，来源失效不停止。伤害为法术、倍率 1；RangedAttack 的 active Buff 引用 `stun` 且 `loadFromDB=1`。加载后的数据库定义才是最终字段：`isDamageMissable=true`、异常 STUNNED、durationKey=`stun`、默认 3 秒；AUTOMATIC 的原生状态抗性数组包含 STUNNED，因此接受状态抗性。prefab 的 `isDamageMissable=0` 是占位值，不能据此使闪避后仍眩晕。Projectile.ActionController.OnHitTarget 调用附 Buff，效果发生在命中而非发弹时。

原生 RangedAttack.OnCastEnd 仅在等待弹体结束且未声明保留时清理弹体；本组 `_waitForProjectileInvalid=0`，因此正常施法结束不会清除已发弹体。不能只看 `_notClearProjectileWhenCastEnd=0` 便反向推成结束即清除。

运行层将伤害类型、眩晕参数和弹体规则随本次发射保存；后续改黑板、切模式或施法者死亡不改已发弹体。命中时沿现有闪避、伤害和状态入口处理，技能不串入普通攻击 EP；来源死亡仍可飞行，失效的原目标不被旁边单位替代。寿命到期的有效追踪目标命中、状态抗性按现有 0～1 比例缩短时长、重复眩晕取较晚到期时间及同次命中先伤害后 Buff 仍标 Inferred，不宣称恢复了全部原生 Buff 叠加与逐帧顺序。弹体只额外保存普通 JSON 效果包，主机继续复用 owner/target 重绑，复用池显式清理效果包。

验证已覆盖真实遭遇记录的三次普通输出充能、全闪避仍回 SP、技能双目标不重复回 SP、模式 1 普通动作共享技力、地面召唤物与标签/半径边界、源动画上限、技能参数及抗性缩短、免疫、发射后切模式与修改黑板、普通 EP 隔离、寿命到期及失效目标、弹体池清理和双弹体在途主机存档恢复。新战斗验证首次通过，完整编译组及拒绝边界通过；原有远程、范围近战、周期能力与模式通道回归通过。这些结果证明本地合同的实际消费者，完整自动阶段和复活仍待推进。

## 施法期间 Buff 与间隔多段近战

[完整多段合同](../../work/enemy-multi-melee-contract.json)复用上一组已冻结的 `excludedCandidates`、数据库、动画、完整组件归属和 SP 合同。本批只增加三个缺失的 BuffDuringCasting 原生入口，未重新提取全表、重复探测不可读方法或查询每只敌人的文字描述。编译器 `enemy_multi_melee_skills.py` 按完整结构接 `SelectorTrigger → 输入阻挡目标 → MultiMeleeAttack + BuffDuringCasting`，专用 Boss 执行器仍优先。

[Verified，源字段与原生] 当前绑定是模式 1 的 `ArmorPiercing`：消耗 3 SP，冷却 0，`times=2`、`def_penetrate=.6`，物理倍率 1，不分摊伤害，没有普通 EP 或附加伤害；输入目标在起手确定，途中不重新索敌。`C2_Skill` 动画长 1.1333 秒，唯一 OnAttack 在 .3667 秒；后续命中由 `_triggerDelta=.2` 调度，而非第二个动画事件。`_maxAnimScale=-1` 取消时长缩放上限，下限仍为 .1。完整命中 Buff 模板只有 CreateEffect，且 `_onlyFeedActiveBuffToLastOne=1`。

`BuffDuringCasting.OnCastStart` 清除自己上次持有的 Buff ID，然后使用能力黑板给 owner 添加 Buff；OnCastFinish 再清除这些 ID。原生片段与哈希保存在 `work/client-logic/native-enemy-cast-buffs/`。metadata 解得 `DEF_PENETRATE=17`、公式项 `ADDITION=0`，声明为绑定能力生命周期的 Buff，没有其他异常状态。CN 导出 `.2` 与 JP `.20000000298023224` 仅为同一 float32 的表示差异；编译器只在这一个字段、相同已解析 GameObject/祖先链且其余字段一致时接受，其他差异继续拒绝。

[Inferred，执行桥接] 复用固定社区属性/伤害公式，将比例穿透作用于目标 DEF；未取得完整原生伤害流水线顺序证明。第一段随源动画缩放，后续每 .2 个施法时钟秒输出一次；MultiMelee 协程的实际逐帧时钟仍不可读，不宣称精确前后摇一致。输入选择器没有自带选择器，本地由当前真实阻挡者提供输入；途中移除的原目标不替换为邻近单位。动态攻速在起手取快照，中途不重算时长。简易交叉斩痕只表示末次命中，未恢复原版粒子素材。

运行状态保存次数、下一次命中游标、当前施法 Buff 和末段效果，结束/打断/死亡均释放 Buff；源 `interruptOnDetach=false` 时切模式保留同次施法。穿透随当前直接攻击取值，不污染已发射的旧弹体或后续普攻。两段分别受闪避、受击事件和受击 SP 处理；技能期间自身回复仍被共享停止标记阻断，不按两次命中额外回技力。普通攻击 EP 不串入这份完整技能载荷。大帧逐次处理到期输出，第一段导致施法者死亡后停止剩余输出。

验证使用真实遭遇记录，但**显式选模式 1**：自然三次普通输出充能、700 ATK 对 100 DEF 每段 660 伤害、两段独立输出、末段特效、闪避/目标移除、跨模式施法、死亡与打断清理、普通 EP 隔离、大帧和两段之间的真实主机保存恢复均通过。完整编译及拒绝边界、旧标签远程/范围近战/周期/模式通道回归通过。这证明技能本体的本地执行，**不证明 Reborn 自动进入模式 1 已完成**。

Reborn 的真实入口、回复状态和有序 `ModifySp → SwitchMode` Buff 链仍待接。进度工具在已接组件之外保存 `boundEntryPendingSkillIDs`，避免本体完成后把入口任务丢掉；整敌与人工清单未勾选。

## 环境门控与派工

冻结的 [read 三成员](../../work/enemy-explicit-read-contract.json)需要剧情拍摄标记，[奇美拉双成员](../../work/enemy-explicit-chimera-contract.json)需要源石/风暴标记。当前卫戍活动、源关卡、生成输入及运行消费者未提供可达入口；奇美拉模式 1 自己产生的源石标记不能自举模式 0 的第一次转换。因此这些技能保留未接状态，并单列为环境门控暂缓，不用空的具名接口冒充接入。

`enemy_skill_dispatch_status.py` 校验两份合同的源指纹，输出未接总数、环境门控暂缓与可继续推进列表。来源变化或出现新的标记生产者时重开相应组，未发生变化时不重复搜索同一调用者。实际数量以生成的覆盖表为准。
