# 敌人普通动作：模式、通道、事件门控与连击

更新至2026-09-18。本专题说明通用动作消费者与剩余边界；当前数量见[当前计划](../plan.md)，分类复用[动作固定表](../generated/enemy-action-templates.md)，旧批次统计不能替代当前导入回执。

## 普攻动作与行走冷却分离（2026-09-18）

本次用户反馈武装飞行单位原地持续攻击，已在真实妖怪MKII和地面绯红歌伶的自然攻击循环中复现。旧公共执行器把动画总长无条件拉到攻击间隔，同时在动作期间扣减冷却，导致动作结束后立即再攻、没有可行走帧；与飞行单位是否占阻挡位无关。

**Verified（已有源字段及JP 36.7.22原生基础分支）**：`AbstractAnimatedAbility.get_cooldown` 在`FROM_ATTACK_SPEED=0`读取`owner.attackTime`；`UpdatePlaybackSpeed`计算`max(攻击间隔 / 原动画时长, 0.1)`，源`_maxAnimScale`非负时再取上限。MeleeAttack与RangedAttack继承这一基础分支。妖怪MKII字段为`_maxAnimScale=1`，源动画长1秒、OnAttack位于0.2666667秒、基础间隔3秒，因此不能拉长为3秒动作。字段、继承和汇编来源统一保存在[动画时序证据](../../work/enemy-animation-playback-evidence.json)。

**Inferred（跨快照及执行桥接）**：CN动作配置消费JP基础分支；明确类型与字段的同类动作由编译器批量附加`playback`合同，运行层区分动作占用与攻击冷却。无阻挡且不在等待、控制或特殊静止状态的单位，动作完成后沿原路径行走；被阻挡的地面单位仍原地等待。最大缩放为负的源动作保留取消上限语义，不承诺所有单位每次攻击都有行走空档。连击、链式弹体完成回调、首攻/连攻专用供应器保留各自合同。动态中途变速与完整原生FSM仍不在本次验收范围。

旧`_flying_block_smoke.js`在检查移动前人为结束动作并设置`cd=999`，仅能证明无攻击时不占阻挡，不能证明持续有目标时正确行进。本轮移除这段绕过，使用真实源属性、持续存活目标和自然冷却，验证“起手停步→伤害→冷却期间行进→再次攻击”，并保留三只地面敌人阻挡位及两种数组顺序的检查。公共时序枚举、上下限、连击和主机保存恢复由`_external_combat_smoke.js`验证；后续修改该公共执行器须使用这些自然循环回归，不再用强行改冷却替代。

批量结果：1327个源敌人、1665处模式/通道时序附带此合同，实际出场池为125敌、145处时序；这是配置覆盖数，不是新增完成敌人数。跨模式比较现在包含动画上限，原始时间相同但上限不同的动作不再错误压平。六个不在历史缺口缓存内的双通道成员由已加载完整根记录统一补编译，保留近战上限1.1与远程上限1.0；不按ID写分支，也不重新逐敌提取。普通动作既有缺口仍为全库433、实际池13。未知类型与缺失合同保留明确分类，首攻/连攻供应器独立消费。

生成链同时修正两个精确依赖边界：Bomb候选缓存仅元数据或无关候选变化时，必须确认本合同冻结的完整候选逐字段相等，且其余原始/原生输入逐哈希相等；Hover的两个已知源schema仅允许移除新增`sourceTags`后完整重现冻结字节哈希。目标字段、其它原始数据或证据变化仍拒绝；未篡改旧合同哈希。只因派生元数据更新而重新提取整批的路径已消除。

未扩大验收：动画批次没有完成所有原生选敌、阶段或动态变速；平铺动作按射程猜配送的问题由下面的独立公共批次补齐。上述普通动作缺口统计并不等于所有运行行为缺陷数。

## 实际卫戍池的平铺动作配送（2026-09-18）

**Verified（配置观察）**：妖怪MKII的完整模式根指向同一MeleeAttack组件，没有弹体键；配置仍允许远程选敌。旧导入产物只有时序，`attackTiming`未给平铺动作传递配送方式，`performEnemyBasicHit`因射程大于零而发出箭弹。射程用于选敌，不能证明攻击会生成弹体。

**Inferred（共享类型到执行器映射）**：`tools/enemy_attack_delivery.py`统一读取已缓存完整根与唯一MonoScript类型。明确的MeleeAttack/MultiMeleeAttack且无弹体键映射为直接命中；RangedAttack/MultiRangedAttack须有匹配的已支持弹体合同。所有根必须一致，且已有平铺时序。模式、双通道、链式、首攻供应器以及专用Boss保留原有执行器，类型缺失、混合根与特殊弹体不选第一根或按射程猜测。本次不重新提取APP，也不逐敌补参数。

新增绑定严格限定[实际出场池](../../work/garrison-encounter-scope.json)的158种敌人：86种直接命中、25种弹体，共111种。其余分类为已有独立合同14种、源无需普攻12种、本分支未绑定21种；后者包含专用Boss等，不能与普通动作13种缺口相加。所有ID、类型及拒绝原因在[导入回执](../../work/external-combat-import-report.json)的`flatAttackDelivery`中。这里只完成配送映射，没有增加整敌完成勾选。

配送方式在起手时写入现有`atkSchedule`，随战斗快照保存；显式时序/弹速、通道、模式和专用Boss优先级保持。`_external_combat_smoke.js`通过真实源spawn验证MKII在0.2666667秒事件直接扣血且无弹体、绯红歌伶先发弹后到达扣血；枚举111个产物、混合根拒绝和主机命中前恢复一并通过。Python覆盖完整根、缺失或不匹配弹体、未知类型和专用合同边界；不以这些测试自证原版完整行为。

## 全局选支、多次发射与范围命中（2026-09-18）

`enemy_selectable_attacks.py` 一次编译完整 `AbilitySelectableGroup`、同对象SelectorTrigger、两个选择器、两份MultiRangedAttack及弹体所有组件。当前只接受 `enemy_9021_acduml_2`；基型有第三个启用的攻击兄弟节点，整图拒绝，不能忽略后把两者一并算作完成。[冻结合同](../../work/enemy-selectable-attack-contract.json)保存原图哈希、完整字段与具体拒绝原因。

**Verified（完整配置）**：首分支全图查找 `enemy_9023_acdums` 的source mode 1，备选分支全图选择对立实体，均按仇恨取一个目标；不是源等级或半径内最近单位。共享攻击冷却；原动画3.3333333秒、首事件0.8333333秒，另外两发分别在首发后0.25/0.5秒。额外观测到的动画事件不能再次当成伤害次数。每发为法术伤害、速度10、生命10秒、半径约1.8的到达时圆形命中弹体。mode 0没有combat根，因此负半径和被阻挡均不能凭空切成通用近战。

**Inferred（调度与跨来源语义）**：运行层按源分支顺序取首个合格分支，起手锁目标，后续目标失效不换目标；仅有attack根的此族在被阻挡时仍执行该根。圆形受击集合是对立实体，加上弹体结尾强制命中的有效trace目标并去重，后者可以同阵营。此解释有源 `ALL+enemyKey+mode`、`alwaysHitTraceTargetInTheEnd` 及原图鉴“优先攻击暗色余音”交叉支持，仍不冒称已还原原生选择/结束方法。

同一动作沿现有CD、事件游标与弹体队列执行，存档保存分支、游标、冻结伤害包及对象引用。受控/来源死亡取消未发部分，已发弹体按自身生命继续；超时强制抵达最后目标位置。法术防御、受到伤害、死亡沿真实消费者；同阵营trace不会伪造干员普攻、攻回SP或干员击杀归属。`notClearProjectileWhenCastEnd=0`与弹体独立管理字段所涉及的完整原生清理层尚未读通，此处采用已发弹体独立的明确模型。

本项只闭合上述普通动作执行合同。余音目前只有基础时序/投递，**自然变形到mode 1、受击次数与反击尚未接入**；mode 1 fixture只能验首分支接口，不能代替自然阶段闭环。原生分支选择顺序、精确帧、完整模组及阶段链不在本项验收内。

## 独立模式与出生选择

`enemy_mode_profiles.py` 已将冻结模式队列中的每个模式独立编译，保留伤害类型、倍率、直接/弹体类型和空通道。`ArkExternalCombat.setMode` 选择已编译模式，清除当前未完成攻击，已发出的弹体和当前冷却保留；真实触发者负责切换时点及额外状态。没有通道的模式不会回退为旧通用普攻，模式未知时不拿另一套配置代替。

一次攻击锁定其目标和通道；阻挡关系变化只影响下一次选通道，不会因新通道为空而误取消当前动作。显式模式切换、禁用和已有中断规则仍可取消。冻结目录会同时校验 prefab、脚本类型来源和资源别名，输入改变时拒绝混用旧初始模式依据。

`setupEnemy → ArkExternalCombat.configure` 已接出生模式：完整组件子树内所有可能默认 getter 为负索引、CN 对应字段/脚本匹配，且模式 0 的动作可编译，才采用原生基础分支的默认 0。完整目录由既有 JP 逻辑库的 Unity 归属补回。跨快照关系标为推断，非负默认覆盖不猜活动顺序。显式状态/存档和专用 Boss 优先。

当前模式内动作、自动出生模式、自动切换链和完整阶段分别计数；以下阻挡与受约束 HP Buff 链已接入，复活、其他血量开关及切换后强制施法等继续保留缺口。后续只读[固定 7 类模式表](../generated/enemy-mode-dispatch.md)和[完整源证据](../research/enemy-mode-dispatch.md)，不重复逐敌扫描。模式属性、范围、一般能力和原生切换中的额外副作用不由当前普攻模块代管。

## 阻挡 Buff 模式事件

`enemy_mode_events.py` 编译完整事件图：保留动作顺序、目标范围、参数来源和重启标记；空事件数组是无操作，未知兄弟动作、嵌套分支或无消费者的非空事件会拒绝整图。原生确认的 `mode` 键缺失时回退节点值，恢复默认分支使用目标已绑定的默认模式。读取不到某个模式的完整动作时，不输出可执行切换图。

`enemy_mode_blocked_provider.py` 按组件合同统一筛选根挂载、同源归属明确、属性为空且只有一个受管理 Buff 的开关。当前编译器匹配到两辆瓦斯车，漂泊颂偶缺模式 0 动作而被拒绝；糖果车和赞索斯的额外动作仍完整保留在候选表。瓦斯车模式 0 的光环、选择器等依赖另列，当前完成范围仅为这条模式切换链。

[Verified，条件和参数；Inferred，跨版本与挂载上下文] 敌人阻挡值来自真实 `blockerOf` 的 0/1，按原生 `cnt` 覆写 min/max 后比较，读取失败使用配置阈值。本项目对缺少 `cnt` 使用回退；已有非整数或重复键保持待解析，不猜转换。`sourceTalentBlackboard` 作为 checker 输入、自挂载 Buff 的 TARGET 指向 owner，以及沉默时移除/恢复载体 Buff，均明确采用[证据中的有限推断](../research/enemy-mode-dispatch.md)。

战斗在已分配阻挡关系后、行动控制跳过前检查条件。只有状态边沿派发 START/FINISH；持续阻挡不会每帧重启攻击。沉默载体天赋会移除 Buff，恢复后重新判断；晕眩/冻结不停止这份被动检查。切换沿用已有模式 API，取消旧模式的未完成攻击、保留冷却和已发弹体。当前 provider 只接受 `restartFSM=false`，不忽略请求完整状态机重启的配置。

`externalModeProviders` 保存各 provider 的 Buff 活动状态，与模式索引一同进入主机快照；恢复后只处理新发生的边沿。浏览器与主机 VM 验证已覆盖两个真实配置、直接/弹体攻击切换、阈值 0/2、沉默、晕眩、重复帧、完整事件拒绝和活动 Buff 中途恢复。现有模式、连击与弹体回归通过；不将本项目测试作为原版证明。

## HP 条件与多 Buff 效果

`enemy_mode_hp_provider.py` 共用根被动上下文校验，`enemy_mode_passive_effects.py` 编译每一份声明的完整动作和属性。任何一份 Buff 有未支持的兄弟动作，都拒绝整个 provider；通过后才按原序派发模式事件，并一起启用/移除全部效果。原特效与音频键保留在元数据，当前没有复刻这些原始资源表现。

本轮整组评估固定表的 10 份 HP 组件、8 个敌人，接通剧作家的根半血链；其余缺模式、需要技能触发、单次锁存、模式移除或 FSM 重启的合同继续留在机器拒绝表。剧作家同一开关有两份 Buff：`switch_mode` 与 `damage_scale[out]`；后者同时声明 DEF、法抗百分比加成。基准数据对应半血阈值 0.5、输出伤害 ×1.5、DEF +100%、法抗 +80%，运行时均从 `rage` 命名空间读取，不按敌人 ID 写死数值。

[Verified，原生规则；Inferred，跨版本/作用域/精度] HP 黑板键 `hp_ratio` 按 `_loadMinHpRatioFromBlackboard` 覆写 min 或 max；`delay` 覆写恢复延迟。当前只执行有效 delay=0、没有单次锁存和强制初值的根 provider。比较保留 MathUtil 的严格形式：`hp > min−EPS`，上界分别为 `hp < max−EPS` 或 `hp < max+EPS`；FP 初始化不可读，EPS=1e-5 是明确推断。carrier 名称到黑板前缀、自挂载目标和挂载顺序也保留推断，详见[HP 合同](../../work/enemy-mode-hp-contract.json)。

DEF/法抗通过公共属性读取函数计算，原基础属性不反复乘写；状态退出时自然撤销。输出倍率接在本项目共用伤害包计算中，DEF/RES 之后应用，发出的弹体保留已结算包；这个流水线绑定仍标推断。HP 在 `inflictDamage` 扣除后立即重评估，同帧后续命中可以读取新防御。周期检查处理生命恢复，活动状态及已解析效果随主机快照保留。完整模式的其他属性/技能仍不计入这条链。

## 近战接触与远程通道

[Verified，配置观察] Tim 固定快照的 `entity._modes → mode._combat/_attack` 是两个独立引用。以萨卡兹枯朽战车为例，`_combat` 指向 Attack2 的直接攻击，`_attack` 指向 Attack 的发射弹体动作；两者的事件时间不同。旧平坦导入要求所有根时序相同，无法消费这种已具备完整数据的组合。

`tools/enemy_mode_channels.py` 对本轮起始的 609 个缺口一次保存完整模式通道、字段和动画别名，缓存为 [enemy-mode-channels.json](../../work/enemy-mode-channels.json)。外部 PPtr、歧义 PathID、自定义/组合根、空通道和模式间不同合同不猜选。只有每个模式中的同一通道时序、直接/弹体类型及弹体 key/速度都一致，才生成两套通道。不会默认选 mode 0，也不宣称阶段转换已经实现。

[Verified，局部原生观察] JP 36.7.22 的 `Enemy.get_isInCombat` 基础分支以 `Enemy.get_blocker != null` 判断接触战斗，前面另有 XLua 覆写入口。地址、二进制 SHA 与汇编见[通道证据](../../work/client-logic/native-enemy-channels/evidence.json)。本次所查攻击选择方法体仍不可读，不据此证明所有原版分派分支。

[Inferred，消费规则] 引擎在被阻挡或执行既有近战接触攻击时选 combat，否则选 attack；采用该通道的时序和发射方式。动作开始时把通道、直接/弹体类型、弹速写入 `atkSchedule`，整个动作保持选择，主机存档一同保存恢复。显式时序/弹速配置和专用 Boss 执行器仍优先。2026-09-18起，明确附带`playback`合同的动作按上述原生缩放分支计算时长；未具备合同的旧路径继续保留社区模型和具体缺口，不能称为原生完整调度还原。

## 等待攻击事件时忽略配置预延迟

[Verified，JP 原生分支] `AbstractAnimatedAbility.TimeMode` 的压缩常量依次为 FROM_ATTACK_SPEED=0、FROM_ANIMATION=1、SPECIFIED=2、LOAD_FROM_BLACKBOARD=3。`UpdatePlaybackSpeed` 在 `_waitForAttackEvent=true` 时跳过配置 `_preDelay` 的数值支路；`EasyToStartAbility.OnWaitForPreDelay.MoveNext` 直接调用 `WaitForNextEvent(ON_ATTACK_EVENT=19, cachedDuration)`。配置预延迟既不加到事件时间上，也不作为事件时间下限。汇编和枚举证据位于 [native-enemy-timing-gates](../../work/client-logic/native-enemy-timing-gates)，完整来源摘要亦保留在[导入回执](../../work/external-combat-import-report.json)的 eventGates 中。

[Inferred，跨快照应用] CN prefab 中同一字段合同复用上述分支。`tools/enemy_timing_gates.py` 只验证 mode 0 等待首个攻击事件的入口；后续是否重复由能力类型和连击配置另外判定。其他时间枚举、缺事件、延迟直接触发和自定义覆写继续留作缺口。根选择仍由原编译器负责，不能凭门控函数通过就把自定义伤害能力算作完整实现。

始海穿刺者与萨卡兹百夫长均配置 `_preDelay=1.134`，所选源动画事件分别为 0.6s 和 1.1333s。它们都直接使用事件时间，2026-09-18起随明确源`playback`合同缩放，不再强制归一化到整个攻击间隔。两者已从普通动作缺口移除；这只收尾此门控类别在卫戍池内的两项，整个卫戍池仍有其他公共动作类别待补。

## 按能力类型选择事件

[Verified，来源观察] 完整 prefab 保留 `scriptPathID`，可与本地 MonoScript 表中的唯一类型关联。原生 `AbilityStandard.CheckAnotherSpell` 在无 XLua 覆写的基础分支返回 false；MeleeAttack/RangedAttack 的方法表没有此覆写，而 MultiMeleeAttack/MultiRangedAttack 有覆写。RangedAttack 的基础 GetEventActions 返回 null。地址、文件哈希、已读与不可读方法见[命中序列证据](../../work/client-logic/native-enemy-hit-sequence/evidence.json)。CN prefab 与 JP 类型表的应用属于跨快照推断，Multi 方法体仍不可读。

[Inferred，公共消费规则] `tools/enemy_hit_sequences.py` 对普通 MeleeAttack/RangedAttack 只选首个 OnAttack；对固定 Multi 能力，要求事件数等于 `1 + _additionalTimes`、逐次等待事件开启、无拆分伤害、动态次数、额外动作或目标刷新，才编译全部命中点。澪使用两个事件；W 的普通 RangedAttack 虽有两个动画事件仍只执行一次。碎骨远程通道的 0.26 攻击倍率在防御结算前应用。

连击游标、已推进时间和目标随 `atkSchedule` 保存。一个帧跨过多个事件时逐次结算；目标死亡时不继续伤害，中断时清除序列，中途恢复只执行剩余事件。固定事件间隔、拆分、附加弹体与改变目标的多段仍是缺口；原字段及事件已一次保存在导入回执 `hitSequences.unresolved`，后续直接按这些字段补公共规则。

同时修正两类旧统计误报：已知 Multi 类型不能因只找到一个动画事件而走普通单击；不同阶段的伤害类型、攻击倍率、连击参数或弹体有无不能因时序相同而判为动作完整。跨模式一致的时序仍可作为部分数据消费，但阶段差异保留 `mode-dependent-basic-action-contract`，不能据此取消待办。

## 批次记录与验证

### 链式命中与弹体完成

链式攻击共用一套弹体合同和动作完成回调，源与推断见[链式弹体证据](../research/enemy-chain-projectiles.md)。首弹到达后按冻结的最大目标数、跳跃范围和伤害衰减执行，每个目标独立结算法术及元素损伤。动作等待弹体完成，冷却仍推进；失效、超时和存档恢复均保留施法序号，旧弹不会结束新施法。链属性与伤害包在发射时保存，当前模式或攻击力后来变化不改写已发弹体。

同构无命中 Buff 组批量接入 3 敌，其中卫戍 2 敌；带寒冷 Buff 的 2 个同族候选保留明确拒绝。这里只闭合普通攻击合同，未把其他死亡/技能机制记为完成。当前缺口和完整成员由实时覆盖表及 `work/garrison-foundation-priority.json` 维护，原 38 个池内动作成员保留稳定 ID。

两通道公共合同接入 34 个敌人，其中卫戍 7 个；门控公共合同实际再接入 10 个敌人，其中卫戍上述 2 个。冻结门控摘要的初始候选为 8 个，正式编译器按完整动画匹配规则实际接通 10 个；初筛不代替当前导入回执。新增共 44 条可消费时序，原有平坦时序/弹速字段均保持。普通动作缺口 609→565，卫戍池 46→37。差异见[本批回执](../../work/enemy-action-channels-delta.json)。

验证包括引用与模式共识边界、原生事件门控代表、两个真实门控敌人的事件前/后伤害、同一敌人被阻挡时直接攻击/未被阻挡时发射弹体，以及浏览器和主机 VM 的选择状态与弹体快照恢复。未重跑 DPS 或全仓测试。

上述为前批通道/门控记录。本轮新增显式模型映射与能力类型序列；最终新增、撤销和净变化见[差异回执](../../work/enemy-metadata-hits-delta.json)，当前队列只看实时表。旧单击和阶段误报已重新列入对应公共类别，不能用前批数字继续判断完成度。

本轮验证覆盖单次施法与固定连击、事件数不足、方向动画冲突、跨模式后续事件/伤害/发射差异，以及实际浏览器内两次近战命中、三发远程弹体、跨帧、死亡、中断、倍率与主机 VM 连击中途恢复。没有重跑 DPS 或整仓测试。

生成链为 `动画补充层 / enemy_mode_channels / enemy_timing_gates / enemy_hit_sequences / enemy_mode_profiles / enemy_mode_blocked_provider → build_external_combat_data → external_combat_data.js → external-combat.js / engine.js`。模式来源还依赖冻结分类、ownership overlay、候选表和完整 Buff 事件图。状态表由 `classify_enemy_action_templates.py` 刷新，统一摘要与模式分表由 `advance_community_templates.py` 在不重算 DPS 时刷新。

## 敌方持续光环与空普通模式（2026-09-18）

`enemy_1234_dsubrl`/`enemy_1234_dsubrl_2`共用`enemy_auras.py`与`enemy-auras.js`，完整三Talent图和唯一空普通模式一起校验。普通模式双通道空且`sourceNoBasicAttack`抑制旧兜底；不篡改基础数据库可攻击字段。源完整合同见[enemy-aura-contract](../../work/enemy-aura-contract.json)，精确停顿覆盖依据见[sluggish模板](../../work/enemy-aura-sluggish-source.json)。

显式圆半径0.5，父子/root变换均单位缩放零偏移，不用普通数据库rangeRadius=1.6替换。各来源保存成员加入时间与下次周期，进入后1秒首跳，退出/不可选/源死亡清理，重入重新等待；目标坐标沿实际干员col/row，敌来源使用稳定visualId，状态纯数据进入房间恢复。

每跳走实际法术承伤、闪避和盾，ignoreForSp=true不制造受击技力。公共正伤害事件只派一次神经损伤，量为来源当前攻击力×源比例，而非实伤量；完全吸收或skipModifierEvents不派。自身状态抵抗加入现有覆盖候选，标准精确sluggish按源优先级抑制新施加和已有贡献，其它键减速继续生效。

静态范围跨版本对应、首次周期/补跳相位、正伤事件门和override胜出均为已标明模型；未据此宣称原生帧等价或整敌完成。实际两成员spawn、0.4/0.6范围、周期/多来源/退出重入、法伤/护盾/神经/抵抗/免疫及双来源中途鉴权恢复见`tools/_enemy_auras_smoke.js`和[验收回执](../../.runtime/enemy-auras-receipts.json)。

## 延迟固定落点弹体（2026-09-21）

完整RangedAttack→SecondaryFilterAdvancedSelector→AttachToTarget/HitBehaviour图通过公共编译器接入，实际卫戍成员为帝国炮火先兆者。两普通动作通道共用相同合同；未知字段/兄弟组件、缺失所有权、跨快照非默认差异拒绝整根。来源见[冻结合同](../../work/enemy-attach-projectile-contract.json)，原合同的boundRuntime=false记录冻结时尚未实现；当前实际绑定以[生成回执](../../work/external-combat-import-report.json)attachedProjectiles和[限定验收](../../work/garrison-enemy-batch-acceptance-20260921-2.json)为准，不回写冻结原始观察。

实际当前射程2替换预制体fallback4。选敌保留未标记回退；同名mark_neutral[effect]优先，然后仇恨及稳定部署顺序。来源证明SPECIFIED_BUFF检查ContainsBuff且保留未匹配项，但最终比较器先后未恢复，排序是显式模型；当前无自然环境标记生产者，标记优先仅fixture，不计环境机制完成。

选敌在普通动作开始；OnAttack冻结目标当时二维位置和攻击数值。INPUT_VECTOR3、followTarget=0、delayToStart=3、半径约1.2及伤害枚举1=物理来自缓存源。3秒后仅结算当前圈内合格对象，追踪对象移走/死亡不强制补伤，隐匿不阻止范围命中，targetFree仍排除。发出后的弹体独立于来源死亡，未发出动作眩晕时取消；原生精确输入捕获帧、高度投影与退场清理保持实现约定。

复用现有弹体池、源数值伤害入口和主机序列化；新增圈形落点提示及轮末等待，最后敌人死亡不能跳过尚未落下的伤害。动画占用仍按源1.1666666秒上限，动作结束后冷却内自然行走，不能等3秒爆炸才释放单位。7组编译测试、真实双通道、范围/来源失效/池清理、冷却内行走和3次完整战斗/RNG恢复通过。普通动作诊断10→9，仅新增一个限定主体，不勾整敌、标记生产者或完整阶段链。
