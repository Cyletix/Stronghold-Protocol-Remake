# 公共程序首批接入与边界

2026-09-14。推进顺序只在[当前计划](../plan.md)维护。本页记录本轮共享程序已经接入的执行链、原生依据和未消费范围；原始资料总量见[提取管线](client-logic-pipeline.md)。

## 实际接入结果

父工作区新增[公共编译器](../../../src/arkresearch/client_program.py)，把真实 `CastSkill → ActiveBuffAbility → Buff` 组件与字段编成同一份 `schema_version=1` 程序。Web 与 Python DPS 分别执行这份程序；属性不再被迫压成旧四个平面字段，也没有按技能 ID 新增放行名单。旧严格编译器和17图保留作回归基线。

| 口径 | 本轮确认结果 | 含义 |
|---|---:|---|
| 源图编译 | 27 / 893 个 prefab | 保留旧17图，新增10图的程序表达；不是27个完整技能 |
| Web 源绑定 | 28个源技能 ID / 19个 prefab / 265个源等级 | 原25 ID / 16 prefab / 235等级全部迁入；净增3 ID / 3 prefab / 30等级 |
| Web 实际执行验证 | 878个身份、技能槽、等级组合 | 同一公共技能可能有多个角色引用；不与265个源等级混计 |
| 默认 CN 的 DPS 程序绑定 | 92个槽位 / 28个唯一技能 ID / 19个 prefab / 878个源等级引用 | 角色槽位和共享技能引用分别统计 |
| DPS 自动伤害映射 | 110 / 1001个槽位 | 原107新增3；另3项独立自疗模型继续单列 |
| DPS 精一 | 87 / 807个伤害槽位；73个程序槽位 | 79名至少一项、18名全技能已有执行映射；完整条件估算仍9名，均不代表完整原版还原 |

两端新增可执行源绑定为 `skchr_acfend_1`、`skchr_udflow_1`、`skchr_yak_2`。编译接受但源参数尚未全部有消费者的配置继续拒绝绑定；不能把新增10图说成新增10项实际技能能力。

## 程序契约与消费者

程序保留控制器、每个 Buff 的源键、自身作用域、独立有限寿命、单层实例约束，以及属性表达式。表达式值严格二选一：源黑板 `{key: ...}` 或有限数值 `{constant: ...}`；已证本地黑板常量可按来源代入。六项属性为生命上限、攻击、防御、法术抗性、攻速、基础攻击间隔，四层为 `addition`、`multiplier`、`final_addition`、`final_scaler`。

一次施放创建多个 Buff 时，每个实例按自己的持续时间到期；控制器以最长 Buff 寿命确定技能结束，结束与死亡清理由现有仿真生命周期统一执行。编译器保留 `wait_for_casting`、`wait_for_attack_event`、`pre_delay` 和 `interrupt_on_detach` 字段。当前接入零前摇路径，拒绝尚未实现的真实攻击事件等待组合、无限寿命、未知作用域、覆盖/叠层组合及会改变效果的陌生字段。

| 链路 | 实际文件与作用 |
|---|---|
| 共用编译与校验 | 父 `src/arkresearch/client_program.py` 的 `compile_programs`、`validate_program`、`required_blackboard_keys`；依据真实脚本 CAB/PPtr、完整组件字段与逐模式证明编译 |
| 父派生程序 | 父 `tools/compile_client_programs.py` → `apps/dps/client_program_data.py`；运行时只依赖可导入模块 |
| Web 源绑定 | [build_client_programs.py](../../tools/build_client_programs.py) → `web/client_program_data.js`；按每级 prefabId 和实际角色属主绑定 |
| Web 执行 | [client-programs.js](../../web/src/simulation/client-programs.js)；接入施放、持续更新、结束、实际攻击/承伤、面板及恢复 |
| DPS 执行 | 父 `src/arkresearch/combat_program.py` 与 `apps/dps/simulation_data.py`；原GUI、独立模拟器、命令行、保存重算共用，详见[父消费者说明](../../../docs/client-program-runtime.md) |
| 完整诊断 | `work/client-logic/program-compilation.json` 保存各图的原组件和精确节点/字段阻塞；便携产物保留阻塞定位，不携带未执行的整个原图 |

绑定不仅检查程序所需键是否存在，也检查所选 CN 黑板是否全部被消费，持续时间默认值不能覆盖源黑板。未知程序执行字段、重复/非法值和错误模式属主被拒绝，来源元数据只作追溯。JP逻辑图与各消费者使用的CN数值源分别标识；当前源表能关联不构成跨版本完全一致证明。455MiB共享SQLite和脚本补充库继续复用，原证据库 SHA256 `36d499444dd469cdf5b188e9e2a245a523f3472c470aa94818644aebf5618095` 未变，没有重建或覆盖旧证据ID。

## 原生依据与模式证明

[Verified：JP 36.7.22 序列化及可读原生] `ActiveBuffAbility.DoOnSpellStart`（`0x24fc00c`）遍历 `_buffs`，调用 `Entity.AddBuff` 并保存实例；`StopAffect`（`0x24fb570`）对该实例集合执行 `RemoveBuffs`；`SetLifeTime`（`0x24fbbbc`）读取各 Buff 持续时间并求最大值。无限寿命另有分支，未据此开放。19个方法的地址、可读性与汇编保存在[控制器证据](../../work/client-logic/native-program-controller/evidence.json)。

[Verified：属性公式] `Battle.Attributes._CalculateAttributeValue`（`0x4d3c2fc`）的已读默认路径依次合并四层，随后按属性限界：

```text
((base + Σaddition) × max(0, 1 + Σmultiplier) + Σfinal_addition)
  × Π ProcessFinalScaler(final_scaler)
```

`SharedUtils.ProcessFinalScaler`（`0x37dc8ac`）对负值返回 `1 + value`，非负值保持原值，因此常量0是最终清零。基础攻击间隔的加法在按攻速换算频率之前执行；源秒数不能加在换算后的间隔上。各运行时既有数值上下限仍有模型约定，未声称所有原生限界已恢复。

[Verified：生命比例] `Entity.OnAttributeDirty`（方法56048，`0x4e14844`）的 MAX_HP=0 直接分支可读，不依赖其他属性的不可用跳表。`0x4e14b28 get_hp` → `0x4e14b50 Division(oldValue)` → `0x4e14b5c get_maxHp` → `0x4e14b6c Multiply` → `0x4e14b78 set_hp`，即：

```text
newHP = currentHP / oldMaxHP × newMaxHP
```

程序引起的上限变化按当前比例调整HP，不计治疗/HPS，不复活死亡对象。实际Web验证同时覆盖既有 `skchr_cello_3` 生命链接的独立增量，避免程序更新抹掉另一机制所持有的HP变化。原生定位见[属性证据](../../work/client-logic/native-program-attributes/evidence.json)：原生库 SHA256 `d95820e25938778b8865571741c7d626d70662f82bc5bb3badf058fbd1e595af`，用于定位的候选metadata SHA256 `2f96360fb0661d1ca323a2210eb859430f874887bc5e98c5af473d2ccf267819`；后者不是原始加密metadata的哈希。

[Verified：限定模式等价] 原 `all_serialized_modes_preserve_attack` 证明保留。新增 `all_serialized_modes_preserve_existing_combat` 只在同一角色全部实际序列化模式的攻击、选择器及同属组件图相等时成立，保留每个模式路径和图摘要。局部 PPtr 仅在引用内容已展开比较后归一；已核视觉效果资源名允许不同，但字段形状、事件顺序和延迟仍参与比较。实际模式间伤害类型、弹体、目标或其他字段不同继续拒绝，未知动画/FSM不静默丢弃。

[实现约定] 新的模式等价证明允许沿用消费者现有基础普攻模型，不宣称该角色所有基础攻击组件已被原生级完整实现。`waitForCasting=true / waitForAttackEvent=false / preDelay=0` 的已读协程分支可映射到当前施放主体，仍采用同步施放时点；原生零时长yield、动画/FSM优先级和精确帧序未复刻。`interrupt_on_detach` 保留在程序中，当前消费者沿公共到期/死亡清理路径退出，没有按该布尔值还原两套原生detach派发；`Ability.Detach`、`DoDetach` 等方法页仍无可用指令。可读的 Buff 移除不能据此升级为完整退场链已经解出。

## 拒绝范围与下一次输入

当前27图外的866个图保留首阻塞：组件608、字段208、模式证明39、属性算子9、黑板回退1、程序结构1。这是诊断口径，同一图可能还有后续未知节点；它们不构成866个逐图任务，也不是已确认缺原生源码的数量。

| 已定位的未消费范围 | 当前处理与恢复条件 |
|---|---|
| `skchr_doberm_2`、`skchr_swire_2`、`skchr_moeshd_1` 的 `talent_scale`；`skchr_acfend_2` 的 `talent_mult` | 图能表达自身属性，源表还有未消费天赋参数，所以整项源绑定仍拒绝；补公共天赋/源黑板传递链后重跑全部实际引用 |
| `skchr_cdfend_1/2/3` | 3图已编译，当前CN无对应角色等级prefab绑定；不能按名称强接，取得适用源绑定/版本后重建 |
| 真正变化的模式、其他控制器、条件/事件/选敌组件 | 保留完整组件与字段路径，按公共类型反向引用及依赖闭合数量选择下一节点簇；未知效果不得只删除字段后放行 |
| 不可读事件、Heal/Ability桥与共享页面 | 复用已记录地址，合并调查实际加载/解密、匹配资源或运行时输入；没有新字节/方法不逐技能重复扫描同页 |

下一批选择遵循[唯一计划](../plan.md)：用[组件/动作复用查询](../generated/client-execution-reuse.md)与新程序的完整阻塞交叉定位公共能力，补一处执行语义后自动重编所有源引用，再核源参数消费与两端运行；不回到原690个诊断组逐个实现，也不将保护页边界抹去来增加数字。

## 本批验证

编译专项7项及生成 `--check` 通过，覆盖旧17图延续、六属性×四层、常量/黑板、多 Buff 寿命、非法字段与数值、未知源上下文、等待条件、模式证明和真实模式差异拒绝。Web878个实际身份/槽位/等级组合通过，包括三个新源技能全部十级、三个新技能各自双归属房间恢复，另核四层、多 Buff 独立结束、死亡、真实法术承伤与面板、HP比例和既有HP链接共存。父DPS130项相关检查及最终51项定点复查通过，覆盖两CN来源、原107槽位、原GUI/Qt/快照和精一边界。Web运行版本为`room-game-20260914.17`，目录指纹`923a32c4b22ef100`。

这些是程序实现和回归证据；原版结论由上方源图/原生证据支撑。多 Buff 合成专项不表示当前27图都含多 Buff，也不把有限定机制验收升级为全角色、全技能或全部模式完成。

```powershell
# 本项目根目录：仅核现有证据和派生程序，不重新提取APP。
python -B ../tools/compile_client_programs.py --check
python -B tools/build_client_programs.py --check
node tools/_client_programs_smoke.js
```

## 验收与增量复核

本轮Web最终选择67/132组，全部通过；选择理由在 `work/program-impact-final.json`，实际命令和结果在 `work/program-passed-checks.json` / `work/program-checks.log`。先前失败的医疗及基础攻击测试只依赖旧效果列表，已改为验证程序下的实际治疗与攻速，未降低结果断言；通过的无关组没有反复重跑。其余未选组未宣称本轮执行。

原501项人工记录保持原样，新增3个技能主体，当前504/6331。共享文件变化涉及的491个已验范围，通过[集中复核模块](../../tools/lib/checklist-revalidation.js)续接：`work/program-checklist-revalidation.json`同时绑定完整代码/数据SHA、每个ID的旧/新basis、登记测试的完整参数和实际通过日志。记录只续接原限定范围，不能自动验收新行为。每条旧notes不再复制同一段批次说明。

新一批先用 `node tools/check_impact.js --snapshot <新目录> --files <实际修改路径>` 保存基线，包括拟新增文件；修改后用 `--list --before <目录>` 查询影响，必要时 `--run`。选择器按具体函数/模块登记依赖，未知共享逻辑保守扩大；纯版本声明及换行符差异不会误当战斗逻辑重写。`work/checklist-acceptance-map.json`提供当前验收的测试导航，不能单独证明无影响。

需要续接旧验收时，先跑实际依赖检查，再构造明确的集中凭据，以 `node tools/audit_implementation_checklist.js --revalidation <凭据路径>` 生成；哈希、参数、ID或双basis不符就拒绝保留。没有凭据时仍按默认规则重开受影响条目。普通 `--check` 只检查当前稳定输出，不自动认可历史凭据。后续仍需扩充真实依赖映射，不能把未选中测试直接解释为未受影响。
