# 机变决策与隐藏门槛证据核对

原始证据整理：2026-09-10；取证入口更新：2026-09-14。这里保留已确认的教程/源字段、现行实现与剩余边界；顺序只以[当前计划](../plan.md)为准。实现通过测试不代表原版规则已经得到验证。

## 已有材料足够确定的部分

**[Verified] 机变发生于特定回合的特殊休整，玩家轮流挑选，同一项只能被取走一次，全员选完再进入普通休整。** 客户端[第三回合教程](../../data/ArknightsGameData/zh_CN/gamedata/story/activities/act1autochess/guide/guide_auto_chess_mode_training_1_r3_prepare.txt)第 2–5 行直接给出这些语义，先操作 `key_auto_chess_first_avail_effect_expand`，再操作 `key_auto_chess_first_avail_effect_confirm`，完成后等待 `signal_auto_chess_battle_enter_prepare_main_state`。不需要再向用户索取一整段流程来确定这些规则。

**[Verified] 开局策略轮选采用随机玩家顺序。** 来源是[开局策略教程](../../data/ArknightsGameData/zh_CN/gamedata/story/activities/act1autochess/guide/guide_auto_chess_mode_training_1_band.txt)第 3 行。这段描述针对开局策略；不能据此认定后续机变按同一随机队列、生命高低或上一轮排名排序。后续机变“轮流选”已确定，但排序算法尚未找到。

特殊休整开关来自 [activity_table.json](../../data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json) 的 `activity.AUTOCHESS_SEASON[seasonId].battleDataDict[modeId][round][alternative].isSpPrepare`。下表是数据直接标记的**本轮休整**，不是“打完该轮之后”；运行时仍读取当前实际 alternative。

| 模式 ID | 首季 | 下半 |
| --- | --- | --- |
| `mode_training_1` | 3 | 3 |
| `mode_single_funny` | 无 | 无 |
| `mode_single_normal` | 6、9 | 6、9 |
| `mode_single_hard` | 3、9、11 | 3、9、11 |
| `mode_single_abyss` | 无此模式 | 3、9、11 |
| `mode_multi_funny` | 3、9 | 3、9 |
| `mode_multi_normal` | 3、6、9 | 3、6、9 |
| `mode_multi_hard` | 3、9、11 | 3、9、11 |
| `mode_multi_abyss` | 无此模式 | 3、9、11 |

本地模式已接入 `G.sourceIsSpPrepare`；旧 `DECISION_ROUNDS` 只供无源关卡兼容。本次补齐了“选中预览→确认选择”，并禁止无效 ID、战斗中旧命令和重复领取结束或重开已完成阶段。`applyDecision(id)` 签名保留，未预览时只选中；正常 UI 使用独立确认按钮。

2026-09-11 用户要求的实现补充：各玩家机变选择限时15真实秒，超时确认已选项或第一项；联机计时和结果由服务端按席位保存，重连保留剩余时间。装备/悬赏使用本地物品/敌人图标，战术削弱暂无已提取的装饰图标，按效果使用剑/盾/法抗示意图。该实现没有补齐多人轮选、候选共享去重，也不把超时默认算法标成客户端事实。

## 有定义，但缺少哪一层连接

以下路径均以 `activity.AUTOCHESS_SEASON[seasonId]` 为根。

| 已有字段 | 已知内容 | 不能据此推导的内容 |
| --- | --- | --- |
| `effectChoiceInfoDict` | 首季 89、下半 109 个事件定义；字段为 `choiceEventId/choiceType/effectType/name/desc/typeTxtColor` | 某模式某轮抽哪类事件，以及对应候选 ID、概率和排除条件 |
| `effectInfoDataDict[effectId]` | 效果名、描述、类型、持续轮数、图标、`enemyPrice` | 该效果会进入哪个 `choiceEventId` 的候选池 |
| `effectBuffInfoDataDict[effectId]` | 与同名效果直接关联的机制 key 和 blackboard 参数 | 装备 `pool` 字符串指向的完整内容，以及服务端抽取规则 |
| `battleDataDict` | 每轮关卡、Boss、`isSpPrepare` | 没有事件 ID 或选择池引用 |

事件数量分类：首季 `EQUIP_FREE=18 / BOUNTY_HUNT=48 / BUFF_SELECT=22 / PERSONAL_CHOOSE=1`；下半分别为 `18 / 62 / 28 / 1`。这是事件定义数量，**不是屏幕上的选择项数量**。

已核对的事件例子：`equip_free_1_tr` 为道具补给，`enemy_initial_1`、`bounty_hunter_1`、`bossInitial_1` 为悬赏决策，`buff_select_1` 为战术决策，`hunter_band_1` 为个人选择。`artifact_paid_1` 的 ID 虽含 `paid`，实际类型仍为 `EQUIP_FREE`、描述为无需资金；不能仅凭 ID 猜价格。`_s` 等后缀也不能替代明确的模式映射。

**[Verified] 可以按源机制实现的真实效果示例：**

| 效果 ID | 源机制与参数 | 接入边界 |
| --- | --- | --- |
| `allybuff_select_3` 财富 | `global_special_choice_gain_coin`, `count=1` | 自己和存在的队友各获得 1 资金；不能替换成虚构的 +5 或 +10 |
| `allybuff_select_4` 补给 | `global_special_choice_refresh_free`, `count=2` | 接下来的两次刷新免费，可叠加，范围含队友 |
| `allybuff_select_2_1` 斯卡蒂的盟誓 | `global_special_choice_bond_addlayer`, `bond_list=raidShip,steadShip,egirShip`, `count=8` | 指定三个盟约加层，范围含队友 |
| `allybuff_select_1` 列装 | `global_special_choice_gain_equip`, `count=2`, `pool=pool_equip_shop_1` | 获得两件随机一阶装备；完整池内容仍须补证，不能从全部装备等概率抽取 |

2026-09-12 根据用户纠正，事件类型改为本轮先随机确定，再显示具体项目；不再让玩家在“悬赏/补给/战术”三种类型中选一。候选和预览保存在权威 G._decisionOffer，重绘不消耗随机数，刷新不重抽。悬赏接源 add_enemy_kill_gain_coin 的单轮普通敌人，生成后击倒才计入下轮资金；补给明确展示所得装备；战术已执行源“排斥：乏力/脆弱/致幻”的攻击×0.95、防御−100、法抗−3。移除旧的凭空+8资金和永久统一−10%敌人模板。

**[Local policy]** 当前仅从已接入执行器的项目中等概率抽样；原版“模式/轮次→事件→完整候选池”、权重仍未知。普通悬赏敌人暂用 enemy_database 的基础级，实际专用等级/倍率未确认。团队仍是每位玩家完成自己的选择再等待全员；已按用户要求补15秒超时确认，原版共享候选轮选、同项唯一、排序及准确超时替选规则仍待接入，不能把本次交互修正标记为完整机变系统。

## 时限与超时：明确值和未确认行为分开

**[Verified 数据字段]** 两季 `modeDataDict[modeId].specialPhaseTime` 均为独立 150、同盟 16；`autoChessData.constData` 有 `specialPhaseStayTime=1`、`hintTimeSpecialPhase=10`。这些字段本身没有给出首人加时、全员轮选超时替选或独立无限计时的适用条件。`enterStepList` 的 `25/50/3` 是开局情报、策略、启动三个阶段，不能拿来填机变倒计时。

**[Inferred / 社区资料]** [PRTS 帮助](https://prts.wiki/w/卫戍协议/帮助)与教程一致，描述特殊休整可以轮流获取或购买装备、选悬赏和战斗加成。[首季 PRTS](https://prts.wiki/w/卫戍协议：盟约)及[下半 PRTS](https://prts.wiki/w/卫戍协议：盟约_下半)均记录同盟每人 16 秒、首人 30 秒；下半另记录独立模式不限时。现有源表仍保留独立 150，无法只靠字段确定客户端/服务端条件覆盖。

尚未找到：机变首位玩家如何确定、之后轮次是否换序、计时到零是随机挑选/固定默认项/跳过、掉线玩家如何处理。也未找到“第几次特殊休整固定使用哪一种事件”的完整权威映射。旧 PRTS 文本与源表还有轮次差异，例如独立绝境写“第 3 轮后”，源标记却在第 3 轮休整；不能把旧自然语言表直接覆盖已接入的源字段。

## 隐秘核心：两季不能混用

2026-09-10 已在线核对，结果与本地 PRTS 缓存一致。**[Inferred / 社区规则]** 两页都明确表示触发条件由用户提供、PRTS 无法保证准确；以下仍缺原版客户端/服务端直接证据。

| 赛季与来源 | 独立模式 | 同盟模式 |
| --- | --- | --- |
| [首季 act1autochess](https://prts.wiki/w/卫戍协议：盟约) | 当前已激活盟约总层数 **>300**，生命 **>1** | 所有参与玩家当前已激活层数总和 **>1000**，生命总和 **>1** |
| [下半 act2autochess](https://prts.wiki/w/卫戍协议：盟约_下半) | 总层数 **>350**，生命 **>1** | 全队总层数 **>1200**，生命总和 **>1** |

共同前提是险境及更高难度、击败第 14 回合常规首领。严格大于不能写成大于等于。文案指向结算时已激活层数的快照，**不是跨轮积累、历史最高值，也不是要求每个玩家单独超过团队门槛**；同盟生命条件同样是总和。具体在哪个结算帧冻结盟约状态，公开文字尚未定义。

本地 `AUTOCHESS_SEASON` 的 `bossInfoDict.isHidingBoss` 只识别隐藏 Boss，不包含门槛。递归核对隐藏相关键与上述数值后，350 等另见于里程碑奖励、装备标识，不能误当触发证据。`autoChessData.constData` 也没有这组门槛。

[hidden-boss.js](../../web/src/rules/hidden-boss.js) 将规则保持为显式社区来源的纯函数：`eligibility({seasonId, modeId, players:[{id, life, activeBonds}]})`。调用方传当前实际参与玩家，ID 必须唯一；返回 `eligible/layers/life/threshold` 及来源、原因。调用方还须校验常规 Boss 胜利。没有真实同局玩家状态时只能显示本机统计，不能乘以 4 或补造队友；该函数本身不会创建、累计或同步玩家数据。

## 历史核查范围与当前定向入口

2026-09-10曾检查[玩法简介](../research/玩法简介.txt)的决策、联防、Boss部分、[用户待办](../../assets/todo.md)、归档 findings、PRTS缓存、教程、活动表，以及当时 `data` / `work` / `server` 的事件与池ID引用；当时字符串搜索没有找到活动表外可连接的候选池。该记录不等于穷尽现已可读取的metadata、组件和原生方法，也不证明原作服务端不存在配置。

归档 `docs/archive/20260908/docs/findings.md` 的“PRTS 轮次 Verified”和两季统一 350/1200 结论已过时；归档只作历史索引，不应重新成为实现依据。用户待办勾选保留用户验收权。

当前从[客户端逻辑流水线](../research/client-logic-pipeline.md)追踪特殊阶段状态机、候选生成/选择/确认方法、池配置和网络响应消费。教程给出的轮选与唯一性仍有效；原生分支和配置能直接解释的规则不等待录像。只有热更新、服务器返回或实际时序尚未覆盖时，才用现有录像/响应作定向交叉对照：

- **超时行为**：先核倒计时结束调用和自动确认分支；若实际覆盖仍未知，用保留阶段/席位/候选的超时片段核对应版本。
- **随机池映射**：先核配置与候选生成的权重/过滤调用；响应里的事件ID、候选ID与顺序可验证服务器输入。单局截图只能证实出现项，不能穷尽池子或证明概率。
- **轮次差异**：沿源模式/轮次到事件的引用查选择分支，再用已有阶段开头与一次确认片段核观测差异。

这几项不阻塞已有阶段开关、确认交互和赛季门槛计算的修正。验证命令：`node tools/_decision_confirm_smoke.js`、`node tools/_decision_reward_smoke.js`、`node tools/_hidden_boss_rules_smoke.js`。
