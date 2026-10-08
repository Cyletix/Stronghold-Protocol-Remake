# 敌人模式：完整组件归属与公共执行

2026-09-14。后续入口为[固定模式表](../generated/enemy-mode-dispatch.md)，推进顺序只在[计划](../plan.md)维护。本批没有重新解包 APK，也没有逐敌编写适配器。

## 七类合同与统一推进

当前出场范围与历史研究目录分开，见下节；原表的成员 ID 与源合同不因重新排序而删除。

### 卫戍出场优先范围

2026-09-15，用户指出卫戍协议没有杰斯顿。复核发现旧优先工具直接把 `web/enemy_encounters.json.enemies` 全部键当作遭遇池；其生成器 `tools/build_enemy_encounters.js` 实际合并了 `common.randomEnemyAttributeDict`、两季敌群身份及属性覆写引用。因此，属性有数值不等于该模式会生成这个敌人。这是旧派工口径错误，既有关于“池内”的历史数量不能继续指导开发。

当前工具 `tools/garrison_encounter_scope.py` 从已有生成源建立可追溯投影，原始源哈希及每个身份的字段路径存于 [范围回执](../../work/garrison-encounter-scope.json)：

- `enemy_encounters.json.seasons`：正权重敌群的主敌和随从；按模式分类选池与难度禁用确认至少一个可选入口。
- `source_battles.json.seasons.modes` 引用的关卡：只取波次中的正数 SPAWN；不把关卡敌人属性表当作波次，也不加入未引用关卡。
- 轮次引用的 Boss：取战斗 `enemyId`，不加入图鉴显示别名。
- 策略 `bands` 的明确敌人生成字段；其他隐式召唤/分支身份需要另行追溯可达生产者，不能凭名称推定。

**Verified（源引用）**：本快照中杰斯顿 `enemy_1516_jakill` 没有上述出场引用。`decisionEffects` 中有 `enemyeffect_b_9` / “杰斯顿·威廉姆斯·悬赏”的声明，包含 `add_enemy_kill_gain_coin` 和该 enemy_id；但 `build_source_battles.js` 已明确保留这些声明与未知服务器事件选池的边界。**Unknown（实际启用）**：不能仅从这一声明证明原版启用了该悬赏。结合用户反馈，将其放入声明待确认类，暂停 Reborn 开发，不据此反驳用户或扩大卫戍任务。

**工程决策**：优先级、共享工作单、模式表和覆盖统计均使用相同出场投影。混合公共任务只派工投影内的稳定 ID，源成员、池外合同与人工验收照常保留。投影不是敌人完整行为或每轮真实触发的证明，也不是完整召唤图；新增明确引用会重新进入优先范围，无须改写硬编码排除名单。

回归验证覆盖属性目录误入、未引用波次、禁用/零权重、Boss 图鉴别名、仅悬赏声明、混合任务成员隔离及稳定进度保留；这些检查证明本工具按上述规则筛选，不代替原版出场实测。

### 原有模板与运行合同

七个主类和 189 个稳定成员保持不变；`enemy_mode_reborn_plan.py`、`enemy_mode_trigger_plan.py`、`enemy_mode_selection_plan.py` 只消费已有字段与归属缓存，补齐子类、源引用、条件/动作/目标/生命周期缺环。`enemy_mode_template_contracts.py` 保存各类的输入、闭合条件及代表边界；`build_enemy_mode_template_plan.py` 合并跨主类算子，生成 [统一机器计划](../../work/enemy-mode-template-plan.json)。所有成员都有细类，不能再把“其他模式选择”作为逐敌调查队列。

`advance_enemy_modes.py` 先复用该计划，再用 `enemy_mode_buff_bindings.py` 按去重模板键从现有 CommunityStore 一次查询同一 Tim 提交的记录。来源 origin、导入文件 SHA256、每个 payload 哈希和原 URL 随 [Buff 绑定层](../../work/enemy-mode-buff-bindings.json)保存。它保留完整 `eventToActions`、嵌套分支、前后兄弟动作、使用位置及各自黑板，不跨使用位置拼参数。缺失模板不会改用其他版本。

[Verified，源字段关联] 已请求的模板全部取得，其中部分直接含 `SwitchMode`；当前模板、引用、敌人和参数候选数量见固定表。原先的“模板图不在模式缓存里”只描述该缓存，不是数据库缺失。已接回图的请求从下一批补源队列移除，改接事件派发、目标作用域和完整动作。声明名只匹配到 GameObject 时仍保留全部附属组件和歧义，不能当作活动能力唯一绑定。

[Verified，节点参数；Inferred，使用位置绑定] SwitchMode 的实际黑板读取键现已确认是 `mode`，失败回退节点 `_modeIndex`；局部值与传入黑板的作用域仍分别核对。TARGET/BUFF_OWNER/ABILITY_OWNER 上下文和切换副作用见下方[阻挡开关原生合同](#阻挡开关原生合同)。模板图存在不证明整条入口已执行。例如 `jakill_reborn` 的 ON_BUFF_START 同时有 ModifySp 和 SwitchMode，不能丢弃前一动作只调用切换。

下一份 [公共批次工作单](../../work/enemy-mode-next-batch.json)以算子为单位，携带受影响成员、主类、源计划和图路径；四批依赖为绑定、条件、有序动作、生命周期。一个公共能力修好后同步推进所有相关主类；不要求其他缺源敌人全部完成才允许已有完整子集继续。已识别 Buff 事件链的成员先接现成链，泛化实体调用查找延后，避免重复查源。

运行 `python tools/advance_enemy_modes.py`；`--batch` 选择准备的公共批次，`--refresh` 仅在固定输入或规则变化时重建一次。输入未变时不再分析组件、不再查询模板正文，只检查轻量来源元数据并刷新表与回执。它不重算 DPS，不自动启用新阶段，不修改人工验收勾选。七类表完善、源图关联、运行时执行分别计数。

既有原生预算/预设结论也已进入复活分析器：有效最大次数小于零允许继续、条件通过后递增、按递增后的 `count-1` 选预设，否则回退默认数据。待补的是 AssignData 的实际次数覆盖键、激活/重置及生命周期，不重新研究已经读出的这些分支。

## 已保存的数据与生成路径

1. `tools/inspect_enemy_mode_dispatch.py` 将起始 189 个模式缺口冻结为 7 个主类，保留 8,793 个组件的完整字段、模式索引、对象引用和序列化动作。产物是 [enemy-mode-dispatch-catalog.json](../../work/enemy-mode-dispatch-catalog.json)；默认调用命中缓存，`--refresh` 才重读固定成员的来源，`--include-new-gaps` 才扩队列。
2. `tools/overlay_enemy_mode_ownership.py` 从已有 `ClientLogicStore` 精确连接 assetKey、实体/模式 PathID、MonoScript、共享字段和 Unity 父子关系。产物是 [enemy-mode-ownership-overlay.json](../../work/enemy-mode-ownership-overlay.json)；缺失或冲突不强行拼接，新增/删去的 schema 字段另存。
3. `tools/enemy_mode_profiles.py` 编译每个模式的近战/远程通道及受约束的初始模式，主生成器写入 `web/external_combat_data.js`。`external-combat.js → engine.js` 在真实生成敌人和攻击时消费；当前数量由[实时覆盖](../generated/community-coverage.md)生成。
4. `tools/render_enemy_mode_progress.py` 只读统一机器计划、Buff 绑定层和导入回执，生成合同、共享依赖和稳定 ID 的当前状态；`advance_community_templates.py` 自动调用它，不再读取两个合计约 58 MB 的原始模式缓存。

来源固定为 Tim `d2f6d76a7172cedc7583fc0a4eb998699abf25f5` 的 CN prefab（SHA256 `ebe89ba77e15541b52bf117820ecf65838c840fee6e65d397ebc46c601c17ef8`）与本地 JP 36.7.22 逻辑库 `jp-36.7.22-client-logic`（数据库 SHA256 `36d499444dd469cdf5b188e9e2a245a523f3472c470aa94818644aebf5618095`）。归属层指纹为 `b334b7ca7aa3d6245deaf8a840d5b72f8a0201a9772beaaee769670fe5ccbd6a`，脚本补充、类型继承和对象索引来源随该产物保存。

## 归属与默认模式依据

[Verified，源结构] Tim 紧凑导出删去了 `m_GameObject`、`GameObject.m_Component` 和 Transform 层级，缺少 PPtr 入边不能证明天赋无效或全局挂载。完整 JP 逻辑库保留了这些关系，本批成功连接 157 个敌人的实体和所有模式锚点，其中卫戍 20 个；6,933 个组件可复用结构归属。其余 16 个资产缺失/歧义、16 个锚点不符，分别保留原因。

173 个 JP 资产完成天赋/技能组件枚举；紧凑逻辑库漏存的 517 个对象引用经本地对象索引确认为 MeshFilter、MeshRenderer 或 SpriteRenderer，因此不影响 MonoBehaviour 枚举。未知类型、缺失 MonoBehaviour 或破损父链仍不能通过。605 个 BasicTalent/BasicSkill 家族组件和 326 个 EnemySkill 分开保存；当前这些资产没有 BasicSkill 后代，EnemySkill 自身也不继承 BasicSkill。

[Verified，原生基础分支] 本地 `libil2cpp.so` SHA256 为 `d95820e25938778b8865571741c7d626d70662f82bc5bb3badf058fbd1e595af`。已读方法及字节摘要见[方法清单](../../work/client-logic/native-enemy-mode-dispatch/methods.json)。`Enemy._GetDefaultModeIndex`（RVA `0x21d94b8`）先设索引 0，再遍历活动天赋，以最后一个合法的非负默认索引覆盖；多个合法覆盖会告警。`Talent.get_defaultModeIndex` 读取 `_defaultModeIndex`（偏移 84），BasicSkill 对应偏移 40。`Enemy.get_defaultMode`（`0x21cc31c`）以该索引访问 `_modes`。

[Inferred，跨快照执行] 对锚点相同、完整子树所有可能 getter 都返回负索引、CN 同字段与脚本也匹配的资产，活动子集和遍历次序不会改变默认 0。151 个敌人满足该数据条件；只有初始模式的动作也成功编译时才接入运行入口，其余保留明确缺口。非负覆盖、不完整目录和跨版本冲突不猜选。此规则不证明 XLua 热修或服务器覆写与所读基础分支一致。

## 已执行的范围

每个可编译模式独立保留攻击事件、倍率、伤害类型、直接命中/弹体和空通道。原生 DamageType 的 PHYSICAL/MAGICAL/PURE 分别为 1/2/3；类型证据见 [damage-type.json](../../work/client-logic/native-enemy-mode-dispatch/damage-type.json)。攻击开始时固定本次伤害与弹体配置；切换取消未完成的当前普攻，保留已有冷却和已经发出的弹体。调用方仍负责实际切换触发与冷却政策，不能以这个 API 代替完整的原生 ActivateMode/InactiveMode。

出生时 `setupEnemy` 消费受约束的 `initialMode`；显式选择或恢复状态不被重置，专用 Boss 执行器优先。没有初始模式依据的敌人只保存独立模式配置，等待真正触发者调用。时序归一化仍沿社区模型，模式属性、范围和一般能力另计。

## HP 开关与同源黑板合同

[Verified，JP 36.7.22 原生基础分支] [HP 合同](../../work/enemy-mode-hp-contract.json)复用已保存的四个 HpRatioToggleChecker 方法，并追加必要的比较函数、字段、字符串和 DamageScale 节点证据；逐文件哈希与版本随合同保存。`LoadData` 先复制序列化 min/max/delay，清除 `m_hasToggleChanged`，再从传入黑板读取 `delay`。`_loadMinHpRatioFromBlackboard=true` 时用 `hp_ratio` 覆写 min，否则覆写 max；缺键才回退对应字段。此方法本身不选择天赋命名空间。

条件先检查 owner 的 `alive`，再比较 HP 比例。`_useLTForMax=false` 使用 `MathUtil.Between=GE&&LE`；原生 `GE(a,b)` 为 `a>b−FP_LARGE_EPS`，`LE(a,b)` 为 `a<b+FP_LARGE_EPS`，`LT(a,b)` 为 `a<b−FP_LARGE_EPS`。正容差下 Between 包含两个精确端点，不能当作无容差比较。metadata 的浮点 `LARGE_EPS` 约为 `1e-5`，但 `FP_LARGE_EPS` 初始化方法不可读；以 `1e-5` 复刻这些公式属于 **Inferred 数值近似**。

`CheckInitialToggled` 仅在 `_setInitialToggle=true` 时直接返回 `_initialToggle`，否则计算当前条件。`_toggleOnce` 限制的是第一次条件与当前 checker 状态的差异，两个方向都可能；先设置 latch，再调用 setter，不能概括成“低血后永远开启”。已确认 LoadData 清除 latch，没有证据说明每次挂载都重置它。有效非零 `restoreDelay` 的调度和 provider 复合生命周期仍未闭合，本批最小消费范围为 delay=0、once=false、强制初始开关关闭。

[Verified，源字段；Inferred，命名空间绑定] `enemy_2020_cswrtr` 的同源 level 0 黑板明确含 `rage.hp_ratio=.5`、`rage.damage_scale=1.5`、`rage.def=1`、`rage.magic_resistance=.8`；完整归属中的 carrier GameObject 为 `Rage`，`_overwriteTalentKey` 为空。以唯一相同前缀匹配 carrier 小写名是有源字段约束的推断；必须保留 `rage` 作用域、检查等级继承与歧义，不能用扁平黑板缺键将阈值静默回退为 1。同一 provider 同时包含切换 Buff 和带两个属性 modifier 的伤害 Buff，完整消费时必须保留这两项。

[Verified，节点基础分支] `DamageScale.Execute`（`0x268a4a4`）普通分支读取非空 `_customKey`，否则读取 `damage_scale`，缺键回退 FP 1；自定义键缺失不会再尝试默认键。无叠层时直接乘当前 `snapshot.modifier.value`；`_isOneMinus` 使用默认键 `damage_resistance` 和 `max(0,1−value)`。本轮只复用普通、无过滤/叠层/额外写回分支。该节点不能单独证明事件处于 DEF/RES 前后或弹体何时取值；把 ON_OUTPUT_DAMAGE 用作最终伤害包倍率仍保留 **Inferred 流水线绑定**，属性公式亦与节点取键证据分开。

以下本次定点入口均为 0 条可解码指令，已缓存到 `work/client-logic/native-enemy-hp/`，同一快照不重试：`MathUtil..cctor`、`BasicTalent.get_talentKey`（`0x211d2d8`）、`BasicTalent._CreateBlackboard`（`0x211da0c`）。此前 provider/Buff 不可读边界继续适用。本合同只证明这组公共参数与条件，不把其余 HP 配置或该敌人的所有能力标成完成。

## 阻挡开关原生合同

[Verified，JP 原生基础分支] 本轮定点读取结果、RVA、字段偏移和逐文件 SHA256 保存在 [SwitchMode 合同](../../work/enemy-mode-switch-contract.json)，原生片段位于 `work/client-logic/native-enemy-switch-node/`。`Nodes.SwitchMode.Execute`（`0x2646d88`）在 `_loadModeFromBlackboard=true` 时调用 `TryGetInt("mode")`，失败回退 `_modeIndex`；随后 `_restoreDefault` 优先调用目标的 `SwitchToDefaultMode`，不硬写 0。非法模式索引不切换，节点仍返回成功。同模式且 `force=false` 时不重启；真正切换时，`_restartFSM=true` 且状态机正在运行才执行保存 `currentStateId` → Stop → Start(原状态)。本轮 provider 只消费 `_restartFSM=false`，不据此声称已实现全部状态退出/进入效果。

[Verified，条件] `BlockedToggleChecker` 对 Enemy 调用 `get_isInCombat`，其原生实现就是 `get_blocker()!=null`；以这个 0/1 比较 `value>=min && (max<0 || value<=max)`。`LoadData` 的 `_useBlockAsMin=true` 用黑板键 `cnt` 覆写 min，读取失败回退 `_blockMinCnt`；false 则覆写 max。它不读取干员剩余阻挡数，也不读取敌人的阻挡重量。三份候选配置均为 min=1、max=-1、use=true；仅在实际 checker 黑板没有 `cnt` 覆写或值为 1 时，条件等价于存在真实阻挡者。

[社区代码观察，不能替代原生] 当前 Tim `buff_templates.py` 使用 `mode_index`、恢复默认硬写 0，并忽略 `_restartFSM`；旧 `action_nodes.py` 用 `_modeIndex or _mode`，还会丢失字面 0。以上近似已由本轮节点合同纠正。Tim 的 Buff START/FINISH 将缺失 TARGET 回退 owner，不能当作原生上下文证据：原生目标枚举值已取得，但 `GetActionTarget` 的跳转表未恢复，且 Buff 事件创建快照的入口不可读。

[Inferred，限定 provider] `enemy_2013_csbot`、`enemy_4001_toxcar`、`enemy_4001_toxcar_2` 的同一公开配置链为根 Talent → ToggleablePassiveBuffAbility → BlockedToggleChecker → `switch_mode` Buff。运行时约定把这份自身 Buff 的 START/FINISH TARGET 绑定挂载 owner，按条件挂载、移除并派发模式动作；黑板传入作用域、provider 完整挂载顺序和 TARGET 快照来源未取得完整原生证明。两个 toxcar 的 carrier 是 `_isSilenceable=1` 的 SilenceableTalent，因此约定沉默时移除该 provider Buff，恢复后重新检查条件；Buff 自身 `isSilenceable=0` 不能使 carrier 免疫沉默。`_setToggleFalseOnDetached=0` 也不能证明移除时保留 Buff。CN 配置应用 JP 原生合同仍标为跨版本推断。

以下新入口已记录不可读，不重试同一快照字节；继续消费上述已知条件与节点合同，未闭合项保持推断或缺口。

| 范围 | 已尝试的不可读入口 |
| --- | --- |
| Buff | `OnStart`、`OnFinish`、`_RunActions`：均为 0 条可解码指令 |
| ToggleablePassiveBuffAbility | `DoSetData`、`DoAttach`、`OnAttached`、`OnDetached`、`OnToggleChanged`、`_SetToggledInternal` 为 0 条；`OnTick`、`AddPassiveBuffs` 仅有无效单指令 |
| GetActionTarget | 主体分支可读，跳转表字节无法映射到有效分支；不能凭排列猜目标枚举分派 |

## 固定的未完成类别

新增的施法期 Buff 原生证据已接入[多段近战合同](../../work/enemy-multi-melee-contract.json)。`BuffDuringCasting.OnCastStart`（方法 77548，72 条指令）清除旧 IDs 并按能力黑板向 owner 添加 Buff；OnCastFinish（77549，7 条）调用清理，`_ClearBuffs`（77552，46 条）移除自己保存的 IDs。完整反汇编和哈希保存在 `work/client-logic/native-enemy-cast-buffs/`。这只闭合能力所属 Buff 的生命周期；不改变下列 Reborn 边界，也不将已编译的模式 1 技能本体视为自动阶段已达。

- 复活族已有 52 敌/64 个 RebornTalent 配置；48 个组件要求额外处理能力，另有多次/无限次数、波次等待、Buff 条件与预设。`AssignData`、`CheckReborn` 和复活状态部分方法已读并保存在同一原生目录。回复过程含黑板参数和动画/tween；不能把 `_hpRechargeRatio` 直接当最终回复生命比例，也不能套现有“半血立即复活”宣布完成。
- 唯一直接挂到模式根的切换链（`enemy_15031_dqhlti`）包含连续的 SwitchMode 和 TriggerEnemySkill(BlockedBoom)。后者没有接通前，整个复合链保持未完成，不只执行切换半段。
- HpRatioToggleChecker 的基础条件方法可读；检查器存在不代表已经连接模式动作。Buff/状态开关、黑板消费者和其他切换入口全部保留在固定表及完整归属层，下一步连接公共触发链。

`Unit._InitUnitModes`、ActivateMode、InactiveMode、DoReborn 的本地方法体目前不可读；已经记录，不重复尝试相同字节。后续应消费已有完整配置/动作或补不同来源。各方法的可读性不能推广成“没有原生代码”或“已恢复全部状态机”。

## 本批验证

验证覆盖唯一引用/模式索引、跨版本共享字段、组件完整性、负默认索引门槛、脚本类型版本改变拒绝旧缓存、不同模式伤害/弹体/空通道、真实生成入口、切换时取消旧攻击、已发弹体保留，以及浏览器与主机 VM 快照恢复。新增/解除阻挡不误取消已锁定通道，空通道只禁止下一次攻击；两个方向的回归通过。专用 Boss 攻击回归通过。测试证明本项目实现契约，不证明原版所有阶段一致；没有重跑 DPS 或全仓。

差异与执行范围保存为 [enemy-mode-profiles-delta.json](../../work/enemy-mode-profiles-delta.json)，当前导入状态以固定表和回执为准。本轮阻挡 provider 按上述明示推断执行，不把其他自动阶段缺口或人工验收清单一并勾选。
