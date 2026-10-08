# 组合控制器的公共缺口表

由 `python tools/render_skill_flow_queue.py` 只读取冻结完整合同和当前绑定生成；不重新提取、不编译、不自动勾验收。推进顺序仍以[当前计划](../plan.md)为准。

冻结候选 18 项，当前仍待绑定 15 项。来源：[完整合同](../../work/skill-flow-batch-contract.json)。下表为重叠依赖，数量不可相加，也不表示实现某一行后全部成员即可直接放行。

| 层次 | 公共缺口 | 关联数 | 成员 |
| --- | --- | ---: | --- |
| 叶子 | `unsupported-flow-buff-template` | 6 | 新约能天使 开火成瘾症 (`skchr_angel2_2`)；隐德来希 绯红壁合 (`skchr_etlchi_2`)；歌蕾蒂娅 缺水的碎漩狂舞 (`skchr_glady_3`)；仇白 承影 (`skchr_qiubai_2`)；缄默德克萨斯 剑雨滂沱 (`skchr_texas2_3`)；余 厚礼上宾 (`skchr_yu_2`) |
| 叶子 | `AnimatedActionToTargetAbility` | 5 | 新约能天使 开火成瘾症 (`skchr_angel2_2`)；瑕光 慑敌辉光 (`skchr_blemsh_2`)；锏 归于宁静 (`skchr_blkkgt_3`)；隐德来希 绯红壁合 (`skchr_etlchi_2`)；刺玫 荆藤庇荫 (`skchr_vendla_2`) |
| 叶子 | `BuffDuringCastingFixed` | 5 | 郁金香 只余芬芳 (`skchr_acpion_3`)；锏 归于宁静 (`skchr_blkkgt_3`)；缄默德克萨斯 阵雨连绵 (`skchr_texas2_2`)；缄默德克萨斯 剑雨滂沱 (`skchr_texas2_3`)；余 厚礼上宾 (`skchr_yu_2`) |
| 叶子 | `MeleeAttack` | 5 | 见行者 惊爆射击 (`skchr_forcer_2`)；号角 照明榴弹 (`skchr_horn_1`)；仇白 承影 (`skchr_qiubai_2`)；缄默德克萨斯 阵雨连绵 (`skchr_texas2_2`)；余 厚礼上宾 (`skchr_yu_2`) |
| 叶子 | `RangedAttack` | 5 | 锏 归于宁静 (`skchr_blkkgt_3`)；见行者 惊爆射击 (`skchr_forcer_2`)；歌蕾蒂娅 缺水的碎漩狂舞 (`skchr_glady_3`)；号角 照明榴弹 (`skchr_horn_1`)；缄默德克萨斯 剑雨滂沱 (`skchr_texas2_3`) |
| 叶子 | `BuffToOwner` | 4 | 郁金香 只余芬芳 (`skchr_acpion_3`)；仇白 承影 (`skchr_qiubai_2`)；刺玫 荆藤庇荫 (`skchr_vendla_2`)；余 厚礼上宾 (`skchr_yu_2`) |
| 叶子 | `AnimatedActionToOwnerAbility` | 3 | 歌蕾蒂娅 缺水的碎漩狂舞 (`skchr_glady_3`)；缄默德克萨斯 阵雨连绵 (`skchr_texas2_2`)；缄默德克萨斯 剑雨滂沱 (`skchr_texas2_3`) |
| 叶子 | `MultiMeleeAttack` | 3 | 郁金香 只余芬芳 (`skchr_acpion_3`)；锏 归于宁静 (`skchr_blkkgt_3`)；缄默德克萨斯 剑雨滂沱 (`skchr_texas2_3`) |
| 叶子 | `unsupported-field` | 3 | 瑕光 慑敌辉光 (`skchr_blemsh_2`)；缄默德克萨斯 阵雨连绵 (`skchr_texas2_2`)；缄默德克萨斯 剑雨滂沱 (`skchr_texas2_3`) |
| 叶子 | `AnimationEmitBehaviour` | 2 | 缄默德克萨斯 阵雨连绵 (`skchr_texas2_2`)；缄默德克萨斯 剑雨滂沱 (`skchr_texas2_3`) |
| 叶子 | `EmptyAnimatedAbility` | 2 | 郁金香 只余芬芳 (`skchr_acpion_3`)；乌尔比安 必须开辟的通路 (`skchr_ulpia_3`) |
| 叶子 | `MultiHitUberEffectEmitter` | 2 | 郁金香 只余芬芳 (`skchr_acpion_3`)；锏 归于宁静 (`skchr_blkkgt_3`) |
| 叶子 | `mode-adds-general-abilities` | 2 | 隐德来希 绯红壁合 (`skchr_etlchi_2`)；仇白 承影 (`skchr_qiubai_2`) |
| 叶子 | `AbilitySelectableGroup` | 1 | 号角 照明榴弹 (`skchr_horn_1`) |
| 叶子 | `ActionToOwner` | 1 | 乌尔比安 必须开辟的通路 (`skchr_ulpia_3`) |
| 叶子 | `AroundTargetRangedAttack` | 1 | 焰影苇草 枯荣共息 (`skchr_reed2_2`) |
| 叶子 | `BuffAfterAffecting` | 1 | 锏 归于宁静 (`skchr_blkkgt_3`) |
| 叶子 | `BuffToOwnerDuringAbility` | 1 | 乌尔比安 必须开辟的通路 (`skchr_ulpia_3`) |
| 叶子 | `MultiRangedAttack` | 1 | 锏 归于宁静 (`skchr_blkkgt_3`) |
| 叶子 | `ProjectileToTileWithExtraActionsAbility` | 1 | 乌尔比安 必须开辟的通路 (`skchr_ulpia_3`) |
| 叶子 | `RangedAttackWithDoubleConfirm` | 1 | 歌蕾蒂娅 缺水的碎漩狂舞 (`skchr_glady_3`) |
| 叶子 | `required-single-component` | 1 | 瑕光 慑敌辉光 (`skchr_blemsh_2`) |
| 叶子 | `unsupported-component-contract` | 1 | 新约能天使 开火成瘾症 (`skchr_angel2_2`) |
| 叶子 | `unsupported-flow-attribute-lifecycle` | 1 | 乌尔比安 必须开辟的通路 (`skchr_ulpia_3`) |
| 叶子 | `unsupported-mode-action-set` | 1 | 歌蕾蒂娅 缺水的碎漩狂舞 (`skchr_glady_3`) |
| 控制器 | `unsupported-sequence-control · flow/group/_alwaysNext` | 5 | 瑕光 慑敌辉光 (`skchr_blemsh_2`)；歌蕾蒂娅 缺水的碎漩狂舞 (`skchr_glady_3`)；焰影苇草 枯荣共息 (`skchr_reed2_2`)；缄默德克萨斯 阵雨连绵 (`skchr_texas2_2`)；缄默德克萨斯 剑雨滂沱 (`skchr_texas2_3`) |
| 控制器 | `unsupported-sequence-control · flow/group/_interruptAbilityOnDetach` | 4 | 新约能天使 开火成瘾症 (`skchr_angel2_2`)；锏 归于宁静 (`skchr_blkkgt_3`)；刺玫 荆藤庇荫 (`skchr_vendla_2`)；余 厚礼上宾 (`skchr_yu_2`) |
| 控制器 | `unsupported-sequence-control · flow/group/_checkCanUseSubAbility` | 1 | 乌尔比安 必须开辟的通路 (`skchr_ulpia_3`) |
| 控制器 | `unsupported-sequence-control · flow/group/_interruptableSubAbilityIndice` | 1 | 仇白 承影 (`skchr_qiubai_2`) |
| 整根 | `unsupported-flow-control-kind` | 5 | 郁金香 只余芬芳 (`skchr_acpion_3`)；锏 归于宁静 (`skchr_blkkgt_3`)；隐德来希 绯红壁合 (`skchr_etlchi_2`)；见行者 惊爆射击 (`skchr_forcer_2`)；号角 照明榴弹 (`skchr_horn_1`) |
| 整根 | `unsupported-sequence-control · flow/group/_alwaysNext` | 5 | 瑕光 慑敌辉光 (`skchr_blemsh_2`)；歌蕾蒂娅 缺水的碎漩狂舞 (`skchr_glady_3`)；焰影苇草 枯荣共息 (`skchr_reed2_2`)；缄默德克萨斯 阵雨连绵 (`skchr_texas2_2`)；缄默德克萨斯 剑雨滂沱 (`skchr_texas2_3`) |
| 整根 | `unsupported-sequence-control · flow/group/_interruptAbilityOnDetach` | 3 | 新约能天使 开火成瘾症 (`skchr_angel2_2`)；刺玫 荆藤庇荫 (`skchr_vendla_2`)；余 厚礼上宾 (`skchr_yu_2`) |
| 整根 | `unsupported-sequence-control · flow/group/_checkCanUseSubAbility` | 1 | 乌尔比安 必须开辟的通路 (`skchr_ulpia_3`) |
| 整根 | `unsupported-sequence-control · flow/group/_interruptableSubAbilityIndice` | 1 | 仇白 承影 (`skchr_qiubai_2`) |

先实现共享控制/叶子及其完成事件、目标和寿命，再按完整源图一次生成；拥有可复用的普通攻击或直接施放消费者，不证明它已支持组合子项完成语义。表现类组件也仍需证明没有逻辑副作用，不能仅凭名称自动忽略。
