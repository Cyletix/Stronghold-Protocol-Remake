# 未决领域的原始逻辑入口

核对日期：2026-09-14。本页维护可复用的来源与下一次取证问题，不另排开发优先级；顺序见[当前计划](../plan.md)，跨领域闭环条件见[机制清单R01–R12](../checklists/mechanism-research.md)，已实现范围见[数据清单](data-inventory.md)及[实施清单](../checklists/README.md)。

**Verified（定位）**：以下组件、方法名、method index与RVA来自现有`work/client-logic/`，原生快照是JP 36.7.22。方法入口存在只证明可以定向阅读，不证明函数语义已还原，也不证明同名本地教程分支等于正式多人规则。哈希、提取范围、CN数值表和热修版本边界统一见[客户端逻辑管线](client-logic-pipeline.md)。

## 现有输入

| 输入 | 用法 |
|---|---|
| `skill-index.json`、`skill-bindings.json`、`skill-template-reachability.json` | 从源`prefabId`找到技能根、关联角色模式和可达模板；存在关联不等于可执行 |
| `bundles/charpack/*.ab.json`、`bundles/battle/*.ab.json`、`bundles/battle/prefabs/*.ab.json` | 按`nodes`中的字符串pathId追本文件引用；`m_FileID`非0的引用继续核对`externals`，不能把未解析引用当空行为 |
| `buff-templates.json`、`action-node-counts.json`、`component-shapes.json` | 保留事件、顺序动作、条件和组件字段，以共同结构划批；字段形状相同不能单独证明脚本相同 |
| `metadata/types.json`、`metadata/method-addresses.json` | 以fullName、参数、method index定位对应原生地址；RVA是该版本地址，不能套到另一APK |
| `metadata/asm/`、`native-enemy/*.asm` | 直接复用已生成的函数与调用样本；未展开的目标只补相应函数/调用边，不重新解包 |
| `web/mode_rules.json`、`source_battles.json`、`enemy_encounters.json`及各生成器源路径 | 对照本地CN数值、模式/关卡覆写和实际消费者；生成产物是索引与实现输入，客户端结论仍回溯其原始字段 |

## 可直接开始的领域

| 领域 | 已定位入口 | 下一次有界工作与验收结果 |
|---|---|---|
| 敌方技能调度与条件触发 | `Torappu.Battle.EnemySkill.Init/OnTick`，method 55666/55677；`Action.Nodes.TriggerEnemySkill.Execute` 81979；敌方prefab的技能/模式组件 | 从实际敌人skill key连接冷却、触发器和当前模式，恢复同一调度器适用的配置；输出可执行列表与被拒绝节点，验证多技能、失效目标、死亡/复活及状态恢复，而非每个敌人另写一套计时器 |
| Boss阶段、召唤、预设装置 | `SwitchMode.Execute` 79578已有asm；`CheckUnitCurrentMode.Execute` 79981；已定位Boss模式组件与关卡predefines/branches | 沿阶段条件→切模式→技能/装置激活追踪昆图斯等例外；保留源技能所属模式，查清`ACTIVATE_PREDEFINED`具体ID与生成主体。已消费子集见[Boss报告](../generated/boss-mechanics.md) |
| 敌群剩余分支与联防 | `AutoChessLevelEnemyManager._GetSpEnemyActionData` 67270 / `0x22d6b84`；`_InsertSpActionToNormal` 67277 / `0x22d77fc`；`GenerateHelpBattleEnemyData` 67280 / `0x22d8164`；`GenerateBossBattleEnemyData` 67281 / `0x22d89bc`；`BossRoundSpawnEscapedEnemy` 67282 / `0x22d8edc` | 复用`native-enemy/`现有asm，核首轮/特殊援军/token/extraEnemy的动作来源、数量及插入次序，再对应漏怪联防和Boss附加敌。已完成的三类选池与六模板换算不重做，见[原生规则](enemy-replacement-native.md) |
| 商店池、升级与资金 | `AutoChessDataBridgeLocalPlayer._RefreshShopData` 66683 / `0x22a304c`；`_GetRandomShopItem` 66684 / `0x22a896c`；`ReqShopUpgrade` 66646 / `0x22a4180`；`_RefreshRoundData` 66681 / `0x22a8184`；`_MoveToNextRound` 66693 / `0x22a6394` | 第一季训练对象已在匿名battle_misc_table取得，四轮资金/四级权重已接，见[训练经济](../mechanics/shop-items.md)；不要重找此表。继续正式输入、首轮折扣、库存返池和原版随机流，已尝试不可读的更新页先查该专题的具体边界 |
| 机变、奖励池与超时 | 本地`_GeneSpPrepareStateDataFromRoundInfo` 66682 / `0x22a86b0`；`_RefreshBonusShop` 66689 / `0x22a9368`；多人`ReqSpPrepareSelect` 66753 / `0x22af97c`及`_UpdateData` 66720 / `0x22abcc0` | 连接round info→事件→候选项→选择结果，核本地候选如何生成、正式候选如何注入，以及超时是否由客户端或服务器决定；与已知轮流/唯一/全员完成教程交叉核对 |
| 阶段切换、结算与隐藏条件 | `AutoChessGameManager.UpdateGameState/_GetNextState` 66870/66871，`0x22b8d50/0x22b8ec0`；`PrepareForBattle/StartBattle/FinishBattle` 66889–66891；多人`_OnServerDataChanged` 66719 / `0x22abc44` | 追准备、普通、联防、Boss与结算的状态条件及时间字段；区分客户端倒计时和服务端过阶段。隐藏门槛、经验/奖杯/称号只在找到公式或权威输入后升级证据等级 |
| 自疗桥与相邻部署增益 | `skcom_heal_self`已有SelfSelector/ApplyHeal算子；`skcom_born_up`已有AppearSkill/ActiveBuffAbility与empty模板ATK/DEF图 | 自疗3项模型单列，严格保护桥继续拒绝；下一有效查询为AppearSkill `OnBorn 0x20fe054`、`OnLocate 0x20fe288`、`OnInit 0x20fdad0`、`DoCast 0x20fdd28`，核部署/落位与Buff生命周期，再考虑接已有属性算子。只复用现有三项源绑定，不重扫19模式组或全包；[完整断点](../../../docs/client-self-heal.md)。 |
| 公共战斗动作及DPS语义 | `CreateBuff.Execute` 79172已有asm；`IfElse.Execute` 79911；`ModifySp.Execute` 79572；`AdvancedApplyDamage.Execute` 80480；原模板动作顺序 | 优先批量恢复条件、目标选择、黑板读写、伤害/治疗、增益进入/退出和技力事件；同一原始语义供卫戍执行器及父工作区DPS/数据库导入，保留来源版本和不支持原因。不能把数值/资源关联计作DPS可计算 |
| 装备、环境与卫戍特质 | `[uc]equips.ab.json`、`[uc]envsystems.ab.json`、`[uc]globalbuffs.ab.json`、`[uc]dynamicabilities.ab.json`及`buff-templates.json`；源effectId/garrisonId/trapId | 从当前未消费的真实key连接模板和事件，按相同动作批量实现；独立核潮汐/风向/沙尘/树丛、工事破坏、定制品池和条件模组。遇到专属节点只隔离该节点，不使全部配置回退到文案解释 |

所有方法索引均已在本地目录命中；除已链接专题和已有asm明确分析的部分，表中算法仍是待取证问题。原版PRNG逐值复现、XLua实际覆盖、受保护/未支持模块和服务器决策仍保留边界，不宣称完整C#源码或全服务端已恢复。

已有失败也是后续输入：EnemySkill调度的已试不可读方法见[死亡生成取证](enemy-death-spawn-native.md)；阻挡检查集中在已核不可读的`0x21d0000`页，详见[阻挡取证](enemy-block-native.md)。九根BLOCK_FREE与acstma/acstmb的入站转伤已接，四根永久`achunt_mark`与achunt最终死亡清理已核并接入，见[根标记纠正](enemy-achunt-cleanup-native.md)；下一步仍是actrpa事件7及三子体TARGET/来源上下文，不能再把此永久根标记当成待找的动态链。无新版本字节、运行时内存或不同有效方法，不重复同地址反汇编。

训练源`initialHp=45`已沿66675→66678的真实写入消费；第四轮Boss的30000生命原本已由tr04源关卡生效，不再派重复接线。NPC名单/坐标方法已读，但预置快照到67311/67312坐标转换的调用顺序未闭合；第三轮缺号`chess_item_3_11_e_a`在同版JP活动表和CN表均不存在，恢复条件是实际缺号处理/热修定义及四人轮选提交链。源表不必重取，定向复核工具和方法详见[训练经济](../mechanics/shop-items.md)。

当前父DPS原映射107/1001与3项独立自疗分列，严格17/893；拒绝607/228/24/16及保护桥1项，候选690组/Web161项登记。`Heal.DoSetData 0x24fd558`、`NewHealNode 0x24fe750`和GetEventActions/get_applyWay无可用完整方法体，已记录在`work/client-logic/native-self-heal/`；没有新版本字节、运行时内存或适用热修时不重复该页，也不以ApplyHeal旁支算子放行完整技能。

已接机制不再从零派发：Web最终DEF已覆盖元素/流形平加后的承伤、选敌、链接、面板与结束恢复；炎国短刀普通/进阶单件已经同一施法事件图消费，满层仍抽随机数，移除常驻重复加成，市场映射14件。后续只核其多件环境创建/归并、未知概率流或未接训练轮选等明确边界，见[属性专题](../mechanics/client-stat-buffs.md)和[道具专题](../mechanics/shop-items.md)。

## 只读查询示例

以下从项目根目录读取现有索引，不提取或改写资源：

```powershell
python -B -c 'import json,pathlib; data=json.loads(pathlib.Path("work/client-logic/metadata/method-addresses.json").read_text(encoding="utf-8")); wanted={55677,66681,66682,66684,66720,66871,81979}; [print(m) for m in data if m["methodIndex"] in wanted]'
python -B -c 'import json,pathlib; data=json.loads(pathlib.Path("work/client-logic/buff-templates.json").read_text(encoding="utf-8")); print(json.dumps(data["gdglow_tr"],ensure_ascii=False,indent=2))'
```

第二条是已经核过的最小引用样例：`gdglow_tr`只触发基础Funnel，不包含澄闪技能期间自爆PRD；完整调用与作用域见[浮游机制](../mechanics/funnel.md)。批量编译器必须保留这种模式差异，不能仅按名称或相同职业套用。
