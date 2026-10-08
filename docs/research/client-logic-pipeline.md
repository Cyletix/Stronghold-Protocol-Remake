# 客户端逻辑批量提取与三项目共用入口

核查：2026-09-14。推进顺序见[当前计划](../plan.md)，本页记录来源、已取得的内容与尚未解决的边界。**配置已提取、函数已定位、执行器已实现、行为已验收是四件不同的事。**

当前入口已补上[现成成果批量接入](community-batch-integration.md)：共享库、完整社区 DPS 核心和敌人公共动作已实际接线。后续先查现有回执与[当前队列](../plan.md#当前队列)，仅新增来源或确需更新消费者时运行 `tools/import_community_batch.py`。本页的原生提取只用于现成来源仍未解决的公共能力，以下27图/110映射是当时事件模拟层基线，不是当前卫戍执行数或全部DPS可算范围。

## 本轮定位到的方法问题

2026-09-14再次核查执行路线：此前的“批量编译”说法过宽。`compile_client_stat_buffs.py`只对标准加攻图做严格模板匹配及少量已核变体；607个组件不同、228个控制字段不同是执行器适用范围诊断，不等于相应原生实现均不可获取。690个诊断分组中600个只有一个预制体，继续按组逐项研究会重现原来的效率问题。组件/动作应按真实类型建立反向引用，见[执行复用报告](../generated/client-execution-reuse.md)；它只复用已提取配置，不重新读取APP。主线改为公共控制器/事件/节点执行层及自动配置绑定，具体队列以[计划纠偏](../plan.md#唯一执行路径)为准。

该路线首批已实际执行：新公共程序编译27/893图，Web和DPS消费同一IR，包含六属性四层、多Buff寿命与限定控制/模式证明。Web原25个源ID整体迁移并净增3个；DPS伤害映射107→110。编译图、源绑定、实际运行与整项验收继续分别统计，完整字段契约、原生HP比例依据及剩余拒绝见[本轮公共程序接入](client-program-integration.md)。

“取得原生代码”在这里仅指已经读取的一部分真实方法体及完整得多的定位目录，不能解释为已获得全部解密源码。反汇编失败也不能单独证明一定存在加密保护；失败页、不可用跳表、方法边界或工具解析问题应分别确认。多个技能共用的不可读点统一研究加载/解密/运行时转储或匹配资源，不将同一失败复制成多项永久阻塞。

1. 过去主要消费 `skill_table` 的等级参数与描述，已经可读的技能预制体、Buff 事件动作序列和角色模式没有形成完整批量入口。因此很多工作退回了逐个技能写特判。
2. 旧 `tools/scratch/decrypt_meta_try.py` 仅尝试由前8字节推出周期8字节的XOR密钥。失败只否定了该假设，不能证明客户端代码无法读取。本轮实际识别出分块XOR，成功恢复类型、方法和字段目录，并继续读取原生方法表。
3. 父工作区DPS早期96/1001是当时的自动执行映射数，当前为110/1001，另有3项独立自疗模型；其完整源表已入库。当前数量与保护断点见下方“本批接续：公共程序”。卫戍本地资料是917个不同skillId。两者范围和分母不同，不能把“执行映射少”解释为“只提取到90多个技能”。
4. 现有界面、联机、养成参数和已经验证的机制仍可复用。应替换错误的描述分类与近似执行，不整体推倒重写，也不靠扩大白名单伪造完成度。

## 已得到的原始逻辑

使用本地 `work/アークナイツ_36.7.22_APKPure.xapk` 标签对应的APK/OBB研究快照。版本标签供定位，各资源SHA256才是精确快照依据。来源和结果保存在 `work/client-logic/summary.json`，大体积原始提取物受现有 `work/` ignore保护。

| 数据 | 本轮实测 | 证据位置与含义 |
|---|---:|---|
| 技能预制体根 | 893 | `battle/prefabs/[uc]skills.ab`；6338个MonoBehaviour，包含触发器、选敌、Buff、弹体及动作时序配置 |
| Buff模板 | 7522 | `config/buff_template_holder.ab`；`eventToActions._items[].value.SerializedState`可直接解析为按顺序执行的动作数组 |
| Buff动作类型/实例 | 1219 / 34920 | `$type`包含实际C#节点名；全库含大量敌人、特殊活动节点，不能把数量等同于技能数 |
| 定向逻辑包 | 478 | 440个角色charpack、31个敌方prefab包、7个技能/弹体/装备/环境/通用资源包 |
| 逻辑对象 / MonoBehaviour | 218523 / 77235 | 保留原始对象和PPtr；64位PathID以字符串保存，防止JavaScript精度丢失 |
| 类型 / 方法 / 字段 / 参数 | 42825 / 259848 / 309515 / 221523 | metadata全量名称、token、索引范围、方法所属类型通过结构验证；不代表已还原函数体 |
| 非零原生方法地址 | 237112 | 54个可读取名称的codegen module；非零指针均落在ELF可执行映射内。另有14596个零指针、8140个未绑定程序集方法，28个module未解析/未支持 |

技能源表必须按每级 `prefabId` 关联，不能直接拿skillId当预制体名。当前CN资料库917个不同技能中882个能与此JP预制体快照匹配；32个指定的预制体未在该包命中，另3个技能的源表没有指定prefabId（`skchr_otter_1`、`skcom_assist_cost[2]`、`skcom_assist_cost[3]`）。后者不是解包失败。固定名单345个不同技能中344个命中，但这些都是资源关联数，**不是原版一致完成数**。

从技能预制体直接引用的623个模板沿 `templateKey` 展开，可到752个模板、282种动作节点。这个闭包没有包含全部角色模式、原生回调和动态模板键；它只用于确定公共执行器的优先级，不能当作“282个节点就能完成全部游戏”的承诺。

## 原生代码路线的实测边界

源metadata SHA256：`c3c1a306ef5945be72a68f8c0974ca13429116039c848032e6c373ecd6316ca8`。

源 `libil2cpp.so` SHA256：`d95820e25938778b8865571741c7d626d70662f82bc5bb3badf058fbd1e595af`。

[Verified：本地结构] 此快照第一4KiB及之后每64KiB内 `0x1000..0x4fff` 的分块XOR可恢复目录；第一块中 `0x1000..0x4fff` 的字符串字面量描述符仍未完整解开。`global-metadata.candidate.dat`明确是候选；`global-metadata.no-literals.dat`另将字面量表长度置零以供工具定位，绝不回写原包或当作完整解密文件。

Il2CppDumper已经识别metadata版本29并找到 `CodeRegistration=0xa177248`、`MetadataRegistration=0xa462ae0`，但后续通用解析失败。继续按ELF段和codegen module方法表读取，可把程序集内的method token映射到原生指令。原始失败日志保留在 `work/client-logic/metadata/dump/dumper-run.txt`，不反复盲跑相同失败命令。

已输出 `CreateBuff.Execute`、`SwitchMode.Execute`、卫戍敌群替换相关函数以及澄闪浮游/PRD的带调用名汇编样本。还未得到完整、可直接运行的C#源码。部分库名/数据页受保护，泛型共享、间接调用、实际XLua热修覆盖和运行时最终行为仍需分别核查。

## 可重复命令与输出

日常续做先查询已存在的 `work/client-logic/summary.json`、相关索引或父工作区SQLite。下面的全量命令用于首次建立、提取器实质变化后重建或取得新快照；不是每轮定时任务的起手式。同输入的旧失败记录先查原因，只在输入、方法或工具条件改变后重试。当前提取器绑定已验证metadata/原生SHA，其他版本需先验证配置，不能套用固定地址。

需要既有UnityPy/lz4以及 `requirements-optional.txt` 中的capstone。直接从项目根目录运行：

```powershell
python -B tools/extract_client_logic.py --recover-metadata --enemies --operators
python -B tools/extract_client_logic.py --recover-metadata --native-only
```

提取器为[extract_client_logic.py](../../tools/extract_client_logic.py)，不重建网页资源，不改角色验收勾选，不执行客户端二进制。输出只能位于项目 `work/` 内。

| 输出 | 用途 |
|---|---|
| `summary.json` | 来源版本、逐包SHA、数量、明确失败/不完整边界 |
| `skill-index.json`、`skill-bindings.json` | 预制体对象索引、CN源表SHA、每级prefabId关联；保留资源缺失与源表无prefab的区别 |
| `bundles/**/*.json` | 原对象字段、依赖、资产容器路径与PPtr；保持原始顺序 |
| `buff-templates.json` | 原模板与已解析的顺序动作数组 |
| `component-shapes.json` | 字段布局聚类；相同字段布局不保证相同行为 |
| `skill-template-reachability.json` | 技能模板的静态引用闭包，用于公共动作优先级 |
| `script-types.json` | 单独定位的匿名脚本包中3483个MonoScript；通过外部CAB与完整PathID绑定真实类名，不能按PathID全局乱配 |
| `mechanism-candidates.json` | 联合上述资料、共享DPS编译诊断与当前Web处理器的可重建候选；具体字段差异、实际ID、模板闭包及原生基类方法入口 |
| `execution-reuse.json` | 真实组件/动作类型→prefab→源技能的完整反向引用；按相关语义内容核摘要，范围重叠，不能求和当完成率 |
| `program-compilation.json` | 共享IR的接受图及未接受图完整组件、具体节点/字段阻塞；读取现有JSON/SQLite生成，不重新提取APP |
| `metadata/types.json`、`battle-types.json` | 带嵌套完整名称的类型、字段与方法签名索引 |
| `metadata/method-addresses.json`、`native-summary.json`、`asm/*.asm` | 原生地址、缺失报告与选定指令样本 |

## 缺口获取与落地路径

2026-09-14补齐此前缺少的脚本实名关联：`assets/AB/Android/anon/787628af8cacd60eaae9af1d9c0afa14.bin`（SHA256 `cec3e04633d6166a305bc4fd3c20cc36add42c77caffacdb9cb2c7e069053ea3`）包含被技能文件引用的 `CAB-658d74aab777086fc32b93f385be999a`。原始 `m_Script.m_FileID` 先选同序外部文件，再按字符串PathID读取MonoScript的程序集、命名空间和类名；893个技能预制体的4017个组件实例全部得到精确类名。方法名与原生地址随后沿metadata真实类型及基类关联，不再凭字段形状猜类名；这仍不代表4017个组件的行为全部实现。

常规候选查询使用下列命令，生成报告见[公共机制候选分组](../generated/client-mechanism-candidates.md)。只有脚本表缺失或对应工具变更时才运行第一条定向提取；其余命令只读现有JSON和共享SQLite，不读取APP。

```powershell
python -B tools/extract_client_script_types.py
python -B tools/build_client_mechanism_candidates.py
python -B tools/build_client_mechanism_candidates.py --prefab skchr_glassb_1
```

候选保留DPS编译的实际首失败分类、Web可能部分的处理器登记、完整配置差异与静态引用缺口。组内共用动作集合不证明字段值或时序等价；接入时继续核组内所有消费者。全部原始图/绑定/原生索引与所选共享manifest逐文件核SHA，查询拒绝证据ID不符的缓存。脚本表已另以 `jp-36.7.22-script-types-r1` 导入父项目的2.8MB独立补充库，查询命令见[父入口](../../../docs/client-logic.md)；原有共享证据ID下的SQLite保持不可变，不将新增文件冒充原manifest的一部分。

| 问题类型 | 首选已有入口 | 何时扩展获取 | 结果去向 |
|---|---|---|---|
| 技能/天赋/模组/召唤 | 每级prefabId → skill-index/charpack → 模式、Buff、弹体、动作图；父SQLite按ID查询 | 缺PPtr/动态模板或现有算子不表达时，查对应公共原生方法；缺版本再取匹配资源 | 共享证据、分组编译与各运行时适配；原个体清单 |
| 敌人/Boss | enemy_database源skills/关卡覆写 → 已导出enemy prefab → 模式/事件/阶段方法 | 对未解释技能或状态链定向反编译/实验，不能只按图鉴文本实现 | 敌人处理器/阶段与生成数据；敌人清单 |
| 卫戍模式/经济/机变 | AUTOCHESS_SEASON配置 → metadata中AutoChess/Garrison类与方法 → 现有原生索引/公开热修 | 继续查具体调用、字段写入和输入；仅对真实服务端缺口或静态不确定项采运行证据 | 模式规格、源表消费者和机制取证清单 |
| 动画/路线/装置 | work/inventory.sqlite + 已导出组件/关卡routes与事件 | 缺失资源才定向解包；时间/画面事实优先复用现有录像，再做定向采样 | 逻辑/表现关联与实际画面/路径验证 |
| 跨版本缺项 | 来源SHA、skill-bindings缺失/空prefab分类、公开资源固定提交 | 能取得适用版本时增量导入，保留旧来源；不可取得则写具体恢复条件 | 来源隔离清单，不能静默拼成完整CN/JP快照 |

每批将“未知”的具体字段、组件或方法与已有已实现机制区分，形成能复用的算子或批量配置。新资料只有经解析、语义核查、消费者接入和相关验证才计为完成；不止堆原始文件或反复写研究综述。所有领域与验收条件见[机制取证清单](../checklists/mechanism-research.md)，唯一优先队列及断点在[计划](../plan.md)。

## 三项目接入原则

以下按批次保留实施历史，当前程序和执行数见本节末尾“本批接续：公共程序”，历史数量不能作为当前完成率。

首批已实际落地：父工作区导入约455MiB的SQLite证据索引，DPS严格图匹配编译接入调香师S2、星极S1、伊芙利特S1、铃兰S1、闪灵S1、星熊S1，执行映射96→102/1001个槽位，86项针对性验证通过；956/1001是资源关联数，仍单列。原DPS启动入口直接消费生成模块，旧便携ZIP未重打。父工作区详细命令见其 `docs/client-logic.md`。

2026-09-14后续定时批次在同一严格编译器上新增真理S1和明椒S1：通过真实`Buff.FetchDuration`默认字面量与压缩枚举确认显式持续键和基础攻击间隔加法，执行104/1001、精一82/807。编译14/893，仍拒绝608/246/22/3；父侧67项针对性验证通过。原始依据见[属性与持续时间原生证据](../../../docs/client-stat-buff-native.md)。独立MonoScript补充库用于共同查询，不启用未支持的执行图。

卫戍已用源图和原生分支接入[卡达/澄闪/洛洛的限定浮游主体](../mechanics/funnel.md)，并将[敌人计划与模板换算](enemy-replacement-native.md)接入开局、预览、正式波次、多人共享种子及保存恢复。它们是本轮已验证的机制范围，不代表917个技能或全部敌方技能都已实现。

2026-09-14集成验证覆盖 `tools/check_game.js` 的全部108组（分段执行），包括新增三组敌潮验证。审查发现的房间恢复丢失实战覆写已修复：`enemy_10067_ftsjc` 在指定种子第10轮保持400攻击力，捕获/恢复后不再退回数据库800，RNG不变。旧版休整档保留原有波次，新局启用固定计划；原444个已验限定子项按各自专项复核延续，新增7个浮游限定子项，未勾完整角色或完整技能。

随后定时批次继续增量取证：新增真实MonoScript类名与候选索引，接器物死亡生成/子敌命中次数及源道具市场。该批Web全部113组、候选索引8项及父侧67项专项通过；旧资料库未重建，独立脚本补充已导入。原451项限定验收经相关专项延续，新增24项敌人限定验收；不再把上述已接主体派为从零工作。

上一批从现有角色模式图核全部攻击组件，仅放行红豆S1/S2的限定模式证明：DPS106/1001、精一84/807，严格编译16/893；608/227/24/18类拒绝及具体模式失败均保留。Web严格自增益消费者共用22个ID/13个图/205级源参数，新增六个明确技能主体；九个真实根被动BLOCK_FREE及第一季训练四轮资金/四级26条权重亦已接。训练表此前被旧索引遗漏的90个匿名包隐藏，按AssetBundle内部别名定向定位后复用父项目解码器，不需要重提已获得的478个逻辑包；[具体源对象与三层哈希](../mechanics/shop-items.md)保留NPC和第三轮六槽边界；训练HP/第四轮Boss的当前消费已在下方最新记录纠正。

该批Web119组、父侧63项和候选9项通过；清单保留原6302个稳定ID/475项验收，增加15项有限定子项至490/6317。新模式编译依赖和逐prefab证明/拒绝已纳入候选生成哈希，旧共享SQLite没有重建。该批的下一入口已在下方接续完成；没有新输入时不重审原19配置或重复解码已记录不可读的方法页。

[上一批历史记录；当前诊断与后续成果见下方“本批接续”] 该批已将红豆S1/S2模式证明接Web，并由原生最终属性结算接缠丸S2 DEF=0；DPS107/1001、精一85/807，严格17/893，拒绝608/228/24/16及19项模式失败。Web25ID/16prefab/235级、848身份等级动作与九种鉴权恢复通过，候选689组/161登记并保留mode_graph和attack_constants。可颂时序/天赋仍拒绝，14合同候选与15原生入口直接复用。

同批接acstma/acstmb转伤、训练新局45生命和防暴盾单件有来源命中；第四轮30000生命本来已由关卡生效。定向解出的同版JP活动表也无第三轮缺号，下一入口为具体缺号处理/热修和NPC预置坐标调用方，不再重取相同表。修复合法装备空槽恢复，Web123组、父122项、候选9项通过；原490项沿原范围保留，增加7项至497/6324。具体继续路径见[计划断点](../plan.md#当前队列)，没有把局部成果计作全模式完成。

### 上一批：自疗保护桥与已接公共机制

该批父DPS原自动映射保持107/1001、精一85/807，另有卡缇/缠丸/铸铁S1共3项独立自疗模型；它们恢复实际自身HP，按缺血封顶并输出有效/原始治疗与HPS，不附加攻击，也不增加伤害映射或完整原版覆盖。旧严格图17/893，首失败为607/228/24/16加1项`protected_heal_ability_bridge`，总876；新增诊断分组使候选索引为690组，Web独立登记161项，登记不等于完成。父侧206项与候选9项专项通过，原SQLite实测哈希不变。

`skcom_heal_self`的SelfSelector与ApplyHeal比例算子已可读，但`Heal.DoSetData 0x24fd558`、`NewHealNode 0x24fe750`及事件接线在当前静态工具下没有可用完整方法体，严格编译继续拒绝；保护机制与恢复方法按公共调用链集中调查。施放当帧是模型约定；比例节点绕过CalculateHeal，不代表后续Buff/事件修正也被绕过。完整图、20方法、54源等级及消费者边界见[父自疗专题](../../../docs/client-self-heal.md)与[Web公共增益](../mechanics/common-buffs.md)。`skcom_born_up`已有AppearSkill/ActiveBuffAbility图和三项源绑定，`OnBorn 0x20fe054`、`OnLocate 0x20fe288`、`OnInit 0x20fdad0`、`DoCast 0x20fdd28`保留为部署控制器的定位用例。此前将这三项单独排为下一轮主目标的安排已由本页顶部的公共执行层路线替代，尚未声明其可执行。

Web已将银灰最终防御因子传播到元素/流形平加之后，共用实际承伤、Boss选敌、防御链接与战斗面板，并保持缠丸零因子及结束恢复，见[最终防御消费](../mechanics/client-stat-buffs.md#最终防御常量缠丸s2)。[achunt根标记与死亡清理](enemy-achunt-cleanup-native.md)纠正将永久`achunt_mark`混作动态标记的旧解释，并接入首领最终死亡清理；三子体的TARGET/事件来源仍未确认。炎国短刀单件普通/进阶两版已按成功施法叠层，满层仍消费随机数，移除常驻重复加成，市场映射更新为14件；多件环境实例和完整训练轮选仍未完成，见[道具专题](../mechanics/shop-items.md)。

父工作区 `src/arkresearch` 负责来源隔离的共用证据库、查询和覆盖报告；DPS继续使用其选择的同版本数值源；卫戍继续使用实际赛季/槽位养成。显式导入研究输出，不让父项目运行时隐式依赖本子项目目录，也不把JP快照与当前CN表拼成一个“完整版本”。

### 本批接续：公共程序

公共 `CastSkill → ActiveBuffAbility → Buff` 程序已经实际接入Web与父DPS：同一IR保存六项属性的四层表达式、有限常量/源黑板、多个Buff的独立寿命及控制字段；不同模式只在完整图相等的限定证明下保留消费者既有普攻模型。未知节点/字段、真实模式变化与未消费黑板继续精确拒绝，旧17图作为回归输入保留，没有修改旧严格匹配器使统计变宽。

源编译现27/893图，旧17图全部保留并新增10图；Web实际源绑定28ID/19prefab/265等级，比原25/16/235净增3/3/30，其余原绑定整体迁移。父DPS默认CN绑定92槽位、28个唯一源技能ID、19prefab、878个源等级引用，伤害映射110/1001，独立自疗3项；精一87/807。三个新增执行源为`skchr_acfend_1`、`skchr_udflow_1`、`skchr_yak_2`。`doberm_2`、`swire_2`、`moeshd_1`的`talent_scale`与`acfend_2`的`talent_mult`仍未消费，源绑定拒绝；三个`cdfend`图没有当前CN角色绑定，不能强接。这些口径不能相加或写成整角色完成。

`ActiveBuffAbility`的加Buff、最长寿命和移除实例已有可读方法支撑；原生属性四层及`Entity.OnAttributeDirty`直接分支证明最大生命变化保留当前HP比例。两端已消费该比例，测试另核真实法术承伤与HP链接组合。同步施放、零时长协程yield、动画/FSM优先级仍属模型边界；`interrupt_on_detach`保留，而退出由仿真公共到期/死亡路径完成，`Ability.Detach/DoDetach`派发体尚未恢复。方法地址、文件哈希和契约见[公共程序专题](client-program-integration.md)。

Web878个实际身份/技能槽/等级组合及三个新技能的双归属恢复专项通过；父侧130项相关检查和最后51项定点复查通过。Web运行版本`room-game-20260914.17`，目录指纹`923a32c4b22ef100`。共享SQLite内容身份未变，便携DPS生成模块与Web数据分别由自己的生成器派生，不让父运行时依赖子项目原始目录。候选索引现在单列27图`clientProgram`与精确程序拒绝，旧`dpsCompiledPrefabs=17`只标旧匹配器诊断；Web登记164项仍不是能力完成数。

下一次沿[唯一计划](../plan.md)选择剩余公共节点簇：交叉查询程序完整阻塞和[组件/动作复用](../generated/client-execution-reuse.md)，按真实依赖能闭合的配置批量补执行、绑定和验收。现有CastSkill/Buff主体不再从头迁移；只读索引、逐技能特例或重复提取同一保护页不能代替后续执行能力。

## 外部资料核查

- [ArknightsGameResource](https://github.com/yuanyan3060/ArknightsGameResource)提供客户端战斗模板及Lua热修复；本轮固定公开提交 [`57ef5385c1ab1315fe4f2094f399b5c803bd71fc`](https://github.com/yuanyan3060/ArknightsGameResource/commit/57ef5385c1ab1315fe4f2094f399b5c803bd71fc)（2026-09-11 10:07:52 UTC），完整Git树实查有565个Lua文件和5个名字包含autochess的热修文件。本地GameData目录没有这些Lua文件，不能把“安装了XLua库”推成“大量完整玩法都在现有Lua源码里”。
- [Arknights-RE](https://github.com/djpadbit/Arknights-RE)记录了旧版本metadata加载/转储研究，可作为方向；其中地址属于24.2.21，本轮没有套用其旧地址或保证兼容。
- [Il2CppDumper元数据结构](https://github.com/Perfare/Il2CppDumper/blob/master/Il2CppDumper/Il2Cpp/MetadataClass.cs)用于核查IL2CPP字段布局。DummyDLL/类型声明本身不包含原生函数体，本轮已继续验证真实方法地址及指令。

上述5份Lua已全文读取，源路径均位于 `gamedata/[uc]lua/hotfixes/`；以下链接固定该提交并定位热修注册行：

| 文件 | 覆盖的调用与行为 |
|---|---|
| [act1vautochesstutorialhotfixer.lua](https://github.com/yuanyan3060/ArknightsGameResource/blob/57ef5385c1ab1315fe4f2094f399b5c803bd71fc/gamedata/%5Buc%5Dlua/hotfixes/act1vautochesstutorialhotfixer.lua#L31) | `AutoChessUIPlugin._OnPlaneAnim`：原调用后，在训练模式通知教程binder。 |
| [autochessdragstatehotfixer.lua](https://github.com/yuanyan3060/ArknightsGameResource/blob/57ef5385c1ab1315fe4f2094f399b5c803bd71fc/gamedata/%5Buc%5Dlua/hotfixes/autochessdragstatehotfixer.lua#L14) | `AutoChessDragState._RevertBattleOverlap`：过滤空角色，再调用原方法。 |
| [autochessshophotfixer.lua](https://github.com/yuanyan3060/ArknightsGameResource/blob/57ef5385c1ab1315fe4f2094f399b5c803bd71fc/gamedata/%5Buc%5Dlua/hotfixes/autochessshophotfixer.lua#L57) | `_AddUnusedBackupChar`筛选同棋子等级的未用候补干员；`AutoChessServiceBattleInfo.Reset`仅在原重置后新建`AutoChessBattleSceneData`。 |
| [autochessutilhotfixer.lua](https://github.com/yuanyan3060/ArknightsGameResource/blob/57ef5385c1ab1315fe4f2094f399b5c803bd71fc/gamedata/%5Buc%5Dlua/hotfixes/autochessutilhotfixer.lua#L24) | `AutoChessUtil.CheckModeTypeTrackPoint`：检查同类型且已开放模式的提示状态。 |
| [uichartabgroupinautochesshotfixer.lua](https://github.com/yuanyan3060/ArknightsGameResource/blob/57ef5385c1ab1315fe4f2094f399b5c803bd71fc/gamedata/%5Buc%5Dlua/hotfixes/uichartabgroupinautochesshotfixer.lua#L37) | `_RefreshEquipData`：刷新战斗角色装备信息栏，无卫戍角色实例时隐藏对应条目。 |

[Verified：该公开提交的5份文件] 这些函数没有`RandomEnemyGenerater`、`_GenerateRandomEnemyData`、敌人数公式或敌群计划生成调用；商店热修的战场数据重置不提供敌群生成实现。此结论只覆盖上述5份，不排除其余560份Lua或原生代码中的相关实现，也不把当前公开快照等同于JP 36.7.22。下载原文保留在`work/public-autochess-hotfixes/`，其中[manifest.json](../../work/public-autochess-hotfixes/manifest.json)记录源路径、Git blob SHA、SHA256、字节数和热修注册行；下载内容的Git blob SHA已逐份验证。

以上资料用于定位；本页客户端数量和客户端新结论以本地所列快照的实际解析结果为依据，公开Lua核查只适用于上述固定提交。
