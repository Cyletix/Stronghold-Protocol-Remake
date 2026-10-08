# 卫戍限定批量候选工作表

由 `tools/audit_garrison_batches.py` 读取现有机器事实生成。推进顺序只见[当前计划](../plan.md)，本表不另排开发队列。

固定名册 **146 身份 / 363 条技能关联**，其中 165 条有明确执行路径，**198 条待绑定**（198 个不同技能 ID）；待绑定关联中的 198 条均有预制体组件索引。
隐藏／替补等扩展卫戍名册共 169 身份、423 条关联，明确路径 204、待绑定 219。下列成员表只列固定名册待绑定项。

**候选不是立即可编译，也不是技能完成。** 首阻塞表为互斥诊断；公共能力表为重叠命中，不能相加计算完成率。

## 互斥的当前首阻塞

直接读取既有公共程序编译快照的首结果，不重编译。第一项拒绝解决后可能仍有其他能力缺口；“已编译但未绑定”也可能缺天赋参数等消费者。

| 现有编译结果 | 关联数 | 不同技能 ID |
| --- | ---: | ---: |
| 公共程序已编译，但当前技能关联尚未绑定 (`accepted-program-unbound`) | 1 | 1 |
| 现有公共程序编译器未证明模式图 (`unproven_mode_graph`) | 4 | 4 |
| 现有公共程序编译器不接受组件 (`unsupported_component`) | 149 | 149 |
| 现有公共程序编译器不接受字段 (`unsupported_field`) | 44 | 44 |

这张表恰好分割全部 198 条待绑定关联，不把未知后续阻塞拆成新的技能数。

## 可重叠的公共能力命中

按完整类型名匹配既有组件／动作反向索引；不是按描述猜技能，不逐 ID 手填分类。模式切换行与多数组重叠，第二行是第一行子集。

| 能力候选 | 关联数 | 不同技能 ID | 判定边界 |
| --- | ---: | ---: | --- |
| 自身 Buff 的双组件骨架 | 49 | 49 | 只有组件骨架相同；Buff 动作、模式、异常状态与天赋参数仍可不同。 |
| 上述骨架中仅模式切换或无静态动作 | 28 | 28 | 上一行的子集；角色模式的攻击、选择器、特质与弹体未由此自动闭合。 |
| 替换／下一次普攻控制器 | 27 | 27 | 可复用下一次普攻执行入口；额外 Buff、事件、特殊弹体与目标规则仍须按整图判定。 |
| 近战／远程／多段攻击能力 | 50 | 50 | 包含与替换普攻组重叠的技能；同动作类型不保证触发器、配送或生命周期相同。 |
| 范围／全局光环能力 | 18 | 18 | 需完整绑定范围、对象、进入退出及各 Buff；不能只接一条属性。 |
| 三段引导控制 | 26 | 26 | 可能涉及停止普攻、阶段动画、中断与结束；不是所有成员都属于自身回复。 |
| 条件分支／Buff 条件动作 | 58 | 58 | 仅这些明确节点的静态命中；条件对象、事件与嵌套动作需要整链编译。 |
| 创建 Buff 动作 | 60 | 60 | 需要目标作用域、模板与派生实例生命周期；不包括名称相似但不同的创建节点。 |
| 模式切换动作 | 132 | 132 | 仅说明需要模式消费者，不能把存在 SwitchMode 当作已支持目标模式。 |

上述能力条件的并集命中 188 条关联，另 10 条不满足所列条件；后者仍在机器成员表中，不表示缺源或必须逐人实现。

## 成员与原始依据

[机器工作表](../../work/garrison-batch-inventory.json)保留每组完整 `memberIds`，按其查 `skills` 即得到角色／技能槽／技能 ID、每级预制体关联、真实组件与动作类型，以及已有完整组件图／阻塞字段的 JSON pointer。源文件 SHA-256 同在 `inputs`。

以下列表便于查看；具体资格继续使用源字段与完整依赖图判断。

### 首阻塞成员

<details>
<summary>公共程序已编译，但当前技能关联尚未绑定：1 条</summary>

诗怀雅 S2 `skchr_swire_2`

</details>

<details>
<summary>现有公共程序编译器未证明模式图：4 条</summary>

格雷伊 S2 `skchr_greyy_2`；送葬人 S1 `skchr_excu_1`；亚叶 S2 `skchr_folnic_2`；伊桑 S2 `skchr_ethan_2`

</details>

<details>
<summary>现有公共程序编译器不接受组件：149 条</summary>

煌 S3 `skchr_huang_3`；浊心斯卡蒂 S1 `skchr_skadi2_1`；浊心斯卡蒂 S2 `skchr_skadi2_2`；浊心斯卡蒂 S3 `skchr_skadi2_3`；耀骑士临光 S2 `skchr_nearl2_2`；耀骑士临光 S3 `skchr_nearl2_3`；维娜·维多利亚 S1 `skchr_siege2_1`；维娜·维多利亚 S2 `skchr_siege2_2`；维娜·维多利亚 S3 `skchr_siege2_3`；焰影苇草 S2 `skchr_reed2_2`；焰影苇草 S3 `skchr_reed2_3`；缄默德克萨斯 S1 `skchr_texas2_1`；缄默德克萨斯 S2 `skchr_texas2_2`；缄默德克萨斯 S3 `skchr_texas2_3`；淬羽赫默 S3 `skchr_slent2_3`；圣约送葬人 S1 `skchr_excu2_1`；圣约送葬人 S2 `skchr_excu2_2`；圣约送葬人 S3 `skchr_excu2_3`；琳琅诗怀雅 S1 `skchr_swire2_1`；琳琅诗怀雅 S2 `skchr_swire2_2`；琳琅诗怀雅 S3 `skchr_swire2_3`；涤火杰西卡 S1 `skchr_jesca2_1`；涤火杰西卡 S3 `skchr_jesca2_3`；荒芜拉普兰德 S1 `skchr_whitw2_1`；引星棘刺 S1 `skchr_thorn2_1`；引星棘刺 S2 `skchr_thorn2_2`；引星棘刺 S3 `skchr_thorn2_3`；烛煌 S1 `skchr_blaze2_1`；烛煌 S2 `skchr_blaze2_2`；烛煌 S3 `skchr_blaze2_3`；新约能天使 S1 `skchr_angel2_1`；新约能天使 S2 `skchr_angel2_2`；新约能天使 S3 `skchr_angel2_3`；凛御银灰 S1 `skchr_svash2_1`；凛御银灰 S2 `skchr_svash2_2`；凛御银灰 S3 `skchr_svash2_3`；圣聆初雪 S1 `skchr_sbell2_1`；圣聆初雪 S2 `skchr_sbell2_2`；圣聆初雪 S3 `skchr_sbell2_3`；溯光星源 S2 `skchr_halo2_2`；溯光星源 S3 `skchr_halo2_3`；伊芙利特 S2 `skchr_ifrit_2`；伊芙利特 S3 `skchr_ifrit_3`；星源 S1 `skchr_halo_1`；星熊 S2 `skchr_hsguma_2`；星熊 S3 `skchr_hsguma_3`；普罗旺斯 S1 `skchr_prove_1`；提丰 S2 `skchr_typhon_2`；提丰 S3 `skchr_typhon_3`；余 S2 `skchr_yu_2`；余 S3 `skchr_yu_3`；灵知 S1 `skchr_gnosis_1`；灵知 S2 `skchr_gnosis_2`；灵知 S3 `skchr_gnosis_3`；槐琥 S2 `skchr_waaifu_2`；波登可 S2 `skchr_podego_2`；山 S3 `skchr_f12yin_3`；断崖 S2 `skchr_ayer_2`；菲亚梅塔 S2 `skchr_phenxi_2`；菲亚梅塔 S3 `skchr_phenxi_3`；暴雨 S1 `skchr_zebra_1`；暴雨 S2 `skchr_zebra_2`；诗怀雅 S1 `skchr_swire_1`；泥岩 S2 `skchr_mudrok_2`；泥岩 S3 `skchr_mudrok_3`；空弦 S1 `skchr_archet_1`；空弦 S2 `skchr_archet_2`；寒檀 S2 `skchr_sntlla_2`；锡兰 S1 `skchr_ceylon_1`；史尔特尔 S1 `skchr_surtr_1`；伊桑 S1 `skchr_ethan_1`；莱恩哈特 S2 `skchr_lionhd_2`；泡泡 S2 `skchr_bubble_2`；薄绿 S2 `skchr_mint_2`；隐德来希 S2 `skchr_etlchi_2`；忍冬 S1 `skchr_vulpis_1`；忍冬 S3 `skchr_vulpis_3`；见行者 S1 `skchr_forcer_1`；见行者 S2 `skchr_forcer_2`；号角 S1 `skchr_horn_1`；号角 S2 `skchr_horn_2`；号角 S3 `skchr_horn_3`；流明 S1 `skchr_lumen_1`；流明 S2 `skchr_lumen_2`；流明 S3 `skchr_lumen_3`；海蒂 S1 `skchr_heidi_1`；海蒂 S2 `skchr_heidi_2`；至简 S2 `skchr_malist_2`；缇缇 S2 `skchr_titi_2`；缇缇 S3 `skchr_titi_3`；佩佩 S1 `skchr_pepe_1`；佩佩 S2 `skchr_pepe_2`；佩佩 S3 `skchr_pepe_3`；玛恩纳 S3 `skchr_mlynar_3`；林 S1 `skchr_lin_1`；林 S3 `skchr_lin_3`；仇白 S1 `skchr_qiubai_1`；仇白 S2 `skchr_qiubai_2`；伊内丝 S1 `skchr_ines_1`；伊内丝 S3 `skchr_ines_3`；跃跃 S1 `skchr_caper_1`；锏 S1 `skchr_blkkgt_1`；锏 S2 `skchr_blkkgt_2`；锏 S3 `skchr_blkkgt_3`；万顷 S2 `skchr_wanqin_2`；左乐 S1 `skchr_zuole_1`；左乐 S3 `skchr_zuole_3`；小满 S2 `skchr_grabds_2`；魔王 S1 `skchr_cetsyr_1`；魔王 S3 `skchr_cetsyr_3`；深巡 S2 `skchr_udflow_2`；娜仁图亚 S1 `skchr_narant_1`；乌尔比安 S1 `skchr_ulpia_1`；乌尔比安 S3 `skchr_ulpia_3`；菲莱 S1 `skchr_philae_1`；菲莱 S2 `skchr_philae_2`；锡人 S1 `skchr_tinman_1`；锡人 S2 `skchr_tinman_2`；凯瑟琳 S1 `skchr_cathy_1`；蒂比 S2 `skchr_tippi_2`；蕾缪安 S1 `skchr_lemuen_1`；蕾缪安 S2 `skchr_lemuen_2`；蕾缪安 S3 `skchr_lemuen_3`；信仰搅拌机 S1 `skchr_rmixer_1`；信仰搅拌机 S2 `skchr_rmixer_2`；信仰搅拌机 S3 `skchr_rmixer_3`；折桠 S2 `skchr_branch_2`；焰尾 S1 `skchr_flamtl_1`；焰尾 S2 `skchr_flamtl_2`；极光 S2 `skchr_aurora_2`；瑕光 S2 `skchr_blemsh_2`；瑕光 S3 `skchr_blemsh_3`；卡涅利安 S1 `skchr_billro_1`；卡涅利安 S2 `skchr_billro_2`；卡涅利安 S3 `skchr_billro_3`；水月 S1 `skchr_mizuki_1`；松果 S2 `skchr_pinecn_2`；蜜莓 S1 `skchr_glider_1`；蜜莓 S2 `skchr_glider_2`；死芒 S1 `skchr_necras_1`；死芒 S2 `skchr_necras_2`；死芒 S3 `skchr_necras_3`；异客 S3 `skchr_pasngr_3`；桑葚 S1 `skchr_mberry_1`；桑葚 S2 `skchr_mberry_2`；歌蕾蒂娅 S1 `skchr_glady_1`；歌蕾蒂娅 S3 `skchr_glady_3`；休谟斯 S1 `skchr_humus_1`；刺玫 S2 `skchr_vendla_2`

</details>

<details>
<summary>现有公共程序编译器不接受字段：44 条</summary>

寒芒克洛丝 S1 `skchr_kroos2_1`；寒芒克洛丝 S2 `skchr_kroos2_2`；百炼嘉维尔 S1 `skchr_gvial2_1`；百炼嘉维尔 S2 `skchr_gvial2_2`；百炼嘉维尔 S3 `skchr_gvial2_3`；淬羽赫默 S1 `skchr_slent2_1`；淬羽赫默 S2 `skchr_slent2_2`；涤火杰西卡 S2 `skchr_jesca2_2`；荒芜拉普兰德 S2 `skchr_whitw2_2`；荒芜拉普兰德 S3 `skchr_whitw2_3`；溯光星源 S1 `skchr_halo2_1`；星源 S2 `skchr_halo_2`；拉普兰德 S1 `skchr_whitew_1`；莫斯提马 S3 `skchr_mostma_3`；菲亚梅塔 S1 `skchr_phenxi_1`；史尔特尔 S2 `skchr_surtr_2`；史尔特尔 S3 `skchr_surtr_3`；薄绿 S1 `skchr_mint_1`；隐德来希 S3 `skchr_etlchi_3`；耶拉 S2 `skchr_kjera_2`；缇缇 S1 `skchr_titi_1`；海霓 S2 `skchr_haini_2`；林 S2 `skchr_lin_2`；伊内丝 S2 `skchr_ines_2`；跃跃 S2 `skchr_caper_2`；哈洛德 S2 `skchr_harold_2`；左乐 S2 `skchr_zuole_2`；魔王 S2 `skchr_cetsyr_2`；娜仁图亚 S2 `skchr_narant_2`；娜仁图亚 S3 `skchr_narant_3`；乌尔比安 S2 `skchr_ulpia_2`；凯瑟琳 S2 `skchr_cathy_2`；瑰盐 S2 `skchr_rosesa_2`；蒂比 S1 `skchr_tippi_1`；焰尾 S3 `skchr_flamtl_3`；远牙 S2 `skchr_fartth_2`；远牙 S3 `skchr_fartth_3`；灰毫 S2 `skchr_ashlok_2`；水月 S2 `skchr_mizuki_2`；水月 S3 `skchr_mizuki_3`；阿罗玛 S2 `skchr_aroma_2`；歌蕾蒂娅 S2 `skchr_glady_2`；休谟斯 S2 `skchr_humus_2`；野鬃 S2 `skchr_wildmn_2`

</details>


### 公共能力成员（允许重复出现）

<details>
<summary>自身 Buff 的双组件骨架：49 条</summary>

寒芒克洛丝 S1 `skchr_kroos2_1`；寒芒克洛丝 S2 `skchr_kroos2_2`；百炼嘉维尔 S1 `skchr_gvial2_1`；百炼嘉维尔 S2 `skchr_gvial2_2`；百炼嘉维尔 S3 `skchr_gvial2_3`；淬羽赫默 S1 `skchr_slent2_1`；淬羽赫默 S2 `skchr_slent2_2`；涤火杰西卡 S2 `skchr_jesca2_2`；荒芜拉普兰德 S2 `skchr_whitw2_2`；荒芜拉普兰德 S3 `skchr_whitw2_3`；溯光星源 S1 `skchr_halo2_1`；星源 S2 `skchr_halo_2`；拉普兰德 S1 `skchr_whitew_1`；莫斯提马 S3 `skchr_mostma_3`；格雷伊 S2 `skchr_greyy_2`；送葬人 S1 `skchr_excu_1`；菲亚梅塔 S1 `skchr_phenxi_1`；诗怀雅 S2 `skchr_swire_2`；亚叶 S2 `skchr_folnic_2`；史尔特尔 S2 `skchr_surtr_2`；史尔特尔 S3 `skchr_surtr_3`；伊桑 S2 `skchr_ethan_2`；薄绿 S1 `skchr_mint_1`；隐德来希 S3 `skchr_etlchi_3`；耶拉 S2 `skchr_kjera_2`；缇缇 S1 `skchr_titi_1`；海霓 S2 `skchr_haini_2`；林 S2 `skchr_lin_2`；伊内丝 S2 `skchr_ines_2`；跃跃 S2 `skchr_caper_2`；哈洛德 S2 `skchr_harold_2`；左乐 S2 `skchr_zuole_2`；魔王 S2 `skchr_cetsyr_2`；娜仁图亚 S2 `skchr_narant_2`；娜仁图亚 S3 `skchr_narant_3`；乌尔比安 S2 `skchr_ulpia_2`；凯瑟琳 S2 `skchr_cathy_2`；瑰盐 S2 `skchr_rosesa_2`；蒂比 S1 `skchr_tippi_1`；焰尾 S3 `skchr_flamtl_3`；远牙 S2 `skchr_fartth_2`；远牙 S3 `skchr_fartth_3`；灰毫 S2 `skchr_ashlok_2`；水月 S2 `skchr_mizuki_2`；水月 S3 `skchr_mizuki_3`；阿罗玛 S2 `skchr_aroma_2`；歌蕾蒂娅 S2 `skchr_glady_2`；休谟斯 S2 `skchr_humus_2`；野鬃 S2 `skchr_wildmn_2`

</details>

<details>
<summary>上述骨架中仅模式切换或无静态动作：28 条</summary>

寒芒克洛丝 S1 `skchr_kroos2_1`；百炼嘉维尔 S2 `skchr_gvial2_2`；淬羽赫默 S1 `skchr_slent2_1`；荒芜拉普兰德 S2 `skchr_whitw2_2`；荒芜拉普兰德 S3 `skchr_whitw2_3`；溯光星源 S1 `skchr_halo2_1`；星源 S2 `skchr_halo_2`；莫斯提马 S3 `skchr_mostma_3`；格雷伊 S2 `skchr_greyy_2`；送葬人 S1 `skchr_excu_1`；菲亚梅塔 S1 `skchr_phenxi_1`；诗怀雅 S2 `skchr_swire_2`；亚叶 S2 `skchr_folnic_2`；伊桑 S2 `skchr_ethan_2`；薄绿 S1 `skchr_mint_1`；耶拉 S2 `skchr_kjera_2`；缇缇 S1 `skchr_titi_1`；海霓 S2 `skchr_haini_2`；林 S2 `skchr_lin_2`；乌尔比安 S2 `skchr_ulpia_2`；凯瑟琳 S2 `skchr_cathy_2`；瑰盐 S2 `skchr_rosesa_2`；蒂比 S1 `skchr_tippi_1`；远牙 S2 `skchr_fartth_2`；水月 S2 `skchr_mizuki_2`；水月 S3 `skchr_mizuki_3`；歌蕾蒂娅 S2 `skchr_glady_2`；野鬃 S2 `skchr_wildmn_2`

</details>

<details>
<summary>替换／下一次普攻控制器：27 条</summary>

维娜·维多利亚 S1 `skchr_siege2_1`；引星棘刺 S1 `skchr_thorn2_1`；溯光星源 S2 `skchr_halo2_2`；伊芙利特 S2 `skchr_ifrit_2`；星源 S1 `skchr_halo_1`；暴雨 S1 `skchr_zebra_1`；空弦 S1 `skchr_archet_1`；锡兰 S1 `skchr_ceylon_1`；史尔特尔 S1 `skchr_surtr_1`；忍冬 S1 `skchr_vulpis_1`；见行者 S1 `skchr_forcer_1`；号角 S1 `skchr_horn_1`；流明 S1 `skchr_lumen_1`；至简 S2 `skchr_malist_2`；佩佩 S1 `skchr_pepe_1`；仇白 S1 `skchr_qiubai_1`；伊内丝 S1 `skchr_ines_1`；跃跃 S1 `skchr_caper_1`；锏 S1 `skchr_blkkgt_1`；左乐 S1 `skchr_zuole_1`；锡人 S1 `skchr_tinman_1`；信仰搅拌机 S1 `skchr_rmixer_1`；水月 S1 `skchr_mizuki_1`；蜜莓 S1 `skchr_glider_1`；桑葚 S1 `skchr_mberry_1`；歌蕾蒂娅 S1 `skchr_glady_1`；休谟斯 S1 `skchr_humus_1`

</details>

<details>
<summary>近战／远程／多段攻击能力：50 条</summary>

维娜·维多利亚 S1 `skchr_siege2_1`；缄默德克萨斯 S2 `skchr_texas2_2`；缄默德克萨斯 S3 `skchr_texas2_3`；引星棘刺 S1 `skchr_thorn2_1`；引星棘刺 S2 `skchr_thorn2_2`；引星棘刺 S3 `skchr_thorn2_3`；凛御银灰 S2 `skchr_svash2_2`；凛御银灰 S3 `skchr_svash2_3`；圣聆初雪 S1 `skchr_sbell2_1`；溯光星源 S2 `skchr_halo2_2`；伊芙利特 S2 `skchr_ifrit_2`；星源 S1 `skchr_halo_1`；提丰 S2 `skchr_typhon_2`；余 S2 `skchr_yu_2`；灵知 S1 `skchr_gnosis_1`；灵知 S2 `skchr_gnosis_2`；灵知 S3 `skchr_gnosis_3`；槐琥 S2 `skchr_waaifu_2`；波登可 S2 `skchr_podego_2`；泥岩 S2 `skchr_mudrok_2`；空弦 S1 `skchr_archet_1`；空弦 S2 `skchr_archet_2`；史尔特尔 S1 `skchr_surtr_1`；莱恩哈特 S2 `skchr_lionhd_2`；薄绿 S2 `skchr_mint_2`；忍冬 S1 `skchr_vulpis_1`；见行者 S1 `skchr_forcer_1`；见行者 S2 `skchr_forcer_2`；号角 S1 `skchr_horn_1`；流明 S1 `skchr_lumen_1`；至简 S2 `skchr_malist_2`；仇白 S1 `skchr_qiubai_1`；仇白 S2 `skchr_qiubai_2`；伊内丝 S1 `skchr_ines_1`；跃跃 S1 `skchr_caper_1`；锏 S1 `skchr_blkkgt_1`；锏 S3 `skchr_blkkgt_3`；左乐 S1 `skchr_zuole_1`；左乐 S3 `skchr_zuole_3`；乌尔比安 S1 `skchr_ulpia_1`；锡人 S1 `skchr_tinman_1`；锡人 S2 `skchr_tinman_2`；信仰搅拌机 S1 `skchr_rmixer_1`；焰尾 S2 `skchr_flamtl_2`；水月 S1 `skchr_mizuki_1`；死芒 S2 `skchr_necras_2`；异客 S3 `skchr_pasngr_3`；歌蕾蒂娅 S1 `skchr_glady_1`；歌蕾蒂娅 S3 `skchr_glady_3`；休谟斯 S1 `skchr_humus_1`

</details>

<details>
<summary>范围／全局光环能力：18 条</summary>

浊心斯卡蒂 S1 `skchr_skadi2_1`；浊心斯卡蒂 S2 `skchr_skadi2_2`；浊心斯卡蒂 S3 `skchr_skadi2_3`；淬羽赫默 S3 `skchr_slent2_3`；涤火杰西卡 S1 `skchr_jesca2_1`；涤火杰西卡 S3 `skchr_jesca2_3`；凛御银灰 S3 `skchr_svash2_3`；溯光星源 S3 `skchr_halo2_3`；余 S3 `skchr_yu_3`；灵知 S3 `skchr_gnosis_3`；泥岩 S3 `skchr_mudrok_3`；莱恩哈特 S2 `skchr_lionhd_2`；海蒂 S1 `skchr_heidi_1`；海蒂 S2 `skchr_heidi_2`；缇缇 S3 `skchr_titi_3`；玛恩纳 S3 `skchr_mlynar_3`；魔王 S3 `skchr_cetsyr_3`；桑葚 S2 `skchr_mberry_2`

</details>

<details>
<summary>三段引导控制：26 条</summary>

煌 S3 `skchr_huang_3`；浊心斯卡蒂 S1 `skchr_skadi2_1`；浊心斯卡蒂 S2 `skchr_skadi2_2`；浊心斯卡蒂 S3 `skchr_skadi2_3`；伊芙利特 S3 `skchr_ifrit_3`；星熊 S3 `skchr_hsguma_3`；灵知 S3 `skchr_gnosis_3`；暴雨 S2 `skchr_zebra_2`；泥岩 S3 `skchr_mudrok_3`；寒檀 S2 `skchr_sntlla_2`；泡泡 S2 `skchr_bubble_2`；薄绿 S2 `skchr_mint_2`；隐德来希 S2 `skchr_etlchi_2`；海蒂 S1 `skchr_heidi_1`；海蒂 S2 `skchr_heidi_2`；万顷 S2 `skchr_wanqin_2`；小满 S2 `skchr_grabds_2`；魔王 S1 `skchr_cetsyr_1`；魔王 S3 `skchr_cetsyr_3`；乌尔比安 S1 `skchr_ulpia_1`；菲莱 S2 `skchr_philae_2`；蜜莓 S2 `skchr_glider_2`；死芒 S2 `skchr_necras_2`；桑葚 S2 `skchr_mberry_2`；歌蕾蒂娅 S1 `skchr_glady_1`；歌蕾蒂娅 S3 `skchr_glady_3`

</details>

<details>
<summary>条件分支／Buff 条件动作：58 条</summary>

耀骑士临光 S2 `skchr_nearl2_2`；耀骑士临光 S3 `skchr_nearl2_3`；维娜·维多利亚 S3 `skchr_siege2_3`；淬羽赫默 S3 `skchr_slent2_3`；圣约送葬人 S3 `skchr_excu2_3`；琳琅诗怀雅 S1 `skchr_swire2_1`；琳琅诗怀雅 S2 `skchr_swire2_2`；涤火杰西卡 S3 `skchr_jesca2_3`；引星棘刺 S2 `skchr_thorn2_2`；新约能天使 S2 `skchr_angel2_2`；新约能天使 S3 `skchr_angel2_3`；凛御银灰 S1 `skchr_svash2_1`；凛御银灰 S2 `skchr_svash2_2`；凛御银灰 S3 `skchr_svash2_3`；圣聆初雪 S3 `skchr_sbell2_3`；提丰 S2 `skchr_typhon_2`；余 S2 `skchr_yu_2`；余 S3 `skchr_yu_3`；灵知 S2 `skchr_gnosis_2`；灵知 S3 `skchr_gnosis_3`；暴雨 S1 `skchr_zebra_1`；隐德来希 S2 `skchr_etlchi_2`；忍冬 S3 `skchr_vulpis_3`；见行者 S1 `skchr_forcer_1`；见行者 S2 `skchr_forcer_2`；号角 S2 `skchr_horn_2`；号角 S3 `skchr_horn_3`；流明 S2 `skchr_lumen_2`；至简 S2 `skchr_malist_2`；缇缇 S2 `skchr_titi_2`；缇缇 S3 `skchr_titi_3`；佩佩 S2 `skchr_pepe_2`；佩佩 S3 `skchr_pepe_3`；玛恩纳 S3 `skchr_mlynar_3`；仇白 S1 `skchr_qiubai_1`；仇白 S2 `skchr_qiubai_2`；跃跃 S1 `skchr_caper_1`；跃跃 S2 `skchr_caper_2`；锏 S1 `skchr_blkkgt_1`；锏 S2 `skchr_blkkgt_2`；锏 S3 `skchr_blkkgt_3`；左乐 S2 `skchr_zuole_2`；左乐 S3 `skchr_zuole_3`；深巡 S2 `skchr_udflow_2`；娜仁图亚 S2 `skchr_narant_2`；娜仁图亚 S3 `skchr_narant_3`；菲莱 S2 `skchr_philae_2`；锡人 S1 `skchr_tinman_1`；锡人 S2 `skchr_tinman_2`；信仰搅拌机 S1 `skchr_rmixer_1`；极光 S2 `skchr_aurora_2`；卡涅利安 S1 `skchr_billro_1`；卡涅利安 S2 `skchr_billro_2`；卡涅利安 S3 `skchr_billro_3`；远牙 S3 `skchr_fartth_3`；灰毫 S2 `skchr_ashlok_2`；死芒 S1 `skchr_necras_1`；死芒 S2 `skchr_necras_2`

</details>

<details>
<summary>创建 Buff 动作：60 条</summary>

煌 S3 `skchr_huang_3`；浊心斯卡蒂 S2 `skchr_skadi2_2`；浊心斯卡蒂 S3 `skchr_skadi2_3`；耀骑士临光 S2 `skchr_nearl2_2`；耀骑士临光 S3 `skchr_nearl2_3`；百炼嘉维尔 S3 `skchr_gvial2_3`；缄默德克萨斯 S3 `skchr_texas2_3`；淬羽赫默 S3 `skchr_slent2_3`；圣约送葬人 S3 `skchr_excu2_3`；琳琅诗怀雅 S1 `skchr_swire2_1`；琳琅诗怀雅 S2 `skchr_swire2_2`；涤火杰西卡 S3 `skchr_jesca2_3`；引星棘刺 S1 `skchr_thorn2_1`；引星棘刺 S2 `skchr_thorn2_2`；引星棘刺 S3 `skchr_thorn2_3`；新约能天使 S2 `skchr_angel2_2`；凛御银灰 S2 `skchr_svash2_2`；凛御银灰 S3 `skchr_svash2_3`；圣聆初雪 S1 `skchr_sbell2_1`；圣聆初雪 S2 `skchr_sbell2_2`；圣聆初雪 S3 `skchr_sbell2_3`；灵知 S2 `skchr_gnosis_2`；灵知 S3 `skchr_gnosis_3`；暴雨 S1 `skchr_zebra_1`；莱恩哈特 S2 `skchr_lionhd_2`；薄绿 S2 `skchr_mint_2`；忍冬 S3 `skchr_vulpis_3`；号角 S2 `skchr_horn_2`；号角 S3 `skchr_horn_3`；流明 S1 `skchr_lumen_1`；流明 S2 `skchr_lumen_2`；海蒂 S1 `skchr_heidi_1`；海蒂 S2 `skchr_heidi_2`；至简 S2 `skchr_malist_2`；缇缇 S2 `skchr_titi_2`；缇缇 S3 `skchr_titi_3`；佩佩 S2 `skchr_pepe_2`；仇白 S1 `skchr_qiubai_1`；仇白 S2 `skchr_qiubai_2`；跃跃 S1 `skchr_caper_1`；锏 S2 `skchr_blkkgt_2`；左乐 S2 `skchr_zuole_2`；左乐 S3 `skchr_zuole_3`；魔王 S2 `skchr_cetsyr_2`；魔王 S3 `skchr_cetsyr_3`；菲莱 S2 `skchr_philae_2`；锡人 S1 `skchr_tinman_1`；锡人 S2 `skchr_tinman_2`；蕾缪安 S3 `skchr_lemuen_3`；信仰搅拌机 S1 `skchr_rmixer_1`；信仰搅拌机 S2 `skchr_rmixer_2`；信仰搅拌机 S3 `skchr_rmixer_3`；折桠 S2 `skchr_branch_2`；焰尾 S1 `skchr_flamtl_1`；卡涅利安 S1 `skchr_billro_1`；卡涅利安 S2 `skchr_billro_2`；卡涅利安 S3 `skchr_billro_3`；死芒 S1 `skchr_necras_1`；死芒 S2 `skchr_necras_2`；刺玫 S2 `skchr_vendla_2`

</details>

<details>
<summary>模式切换动作：132 条</summary>

浊心斯卡蒂 S1 `skchr_skadi2_1`；浊心斯卡蒂 S2 `skchr_skadi2_2`；浊心斯卡蒂 S3 `skchr_skadi2_3`；耀骑士临光 S2 `skchr_nearl2_2`；耀骑士临光 S3 `skchr_nearl2_3`；维娜·维多利亚 S2 `skchr_siege2_2`；维娜·维多利亚 S3 `skchr_siege2_3`；焰影苇草 S3 `skchr_reed2_3`；寒芒克洛丝 S1 `skchr_kroos2_1`；寒芒克洛丝 S2 `skchr_kroos2_2`；百炼嘉维尔 S1 `skchr_gvial2_1`；百炼嘉维尔 S2 `skchr_gvial2_2`；百炼嘉维尔 S3 `skchr_gvial2_3`；缄默德克萨斯 S1 `skchr_texas2_1`；缄默德克萨斯 S2 `skchr_texas2_2`；缄默德克萨斯 S3 `skchr_texas2_3`；淬羽赫默 S1 `skchr_slent2_1`；淬羽赫默 S2 `skchr_slent2_2`；淬羽赫默 S3 `skchr_slent2_3`；圣约送葬人 S1 `skchr_excu2_1`；圣约送葬人 S2 `skchr_excu2_2`；圣约送葬人 S3 `skchr_excu2_3`；琳琅诗怀雅 S3 `skchr_swire2_3`；涤火杰西卡 S1 `skchr_jesca2_1`；涤火杰西卡 S2 `skchr_jesca2_2`；涤火杰西卡 S3 `skchr_jesca2_3`；荒芜拉普兰德 S2 `skchr_whitw2_2`；荒芜拉普兰德 S3 `skchr_whitw2_3`；烛煌 S2 `skchr_blaze2_2`；烛煌 S3 `skchr_blaze2_3`；新约能天使 S1 `skchr_angel2_1`；新约能天使 S2 `skchr_angel2_2`；新约能天使 S3 `skchr_angel2_3`；凛御银灰 S3 `skchr_svash2_3`；圣聆初雪 S2 `skchr_sbell2_2`；圣聆初雪 S3 `skchr_sbell2_3`；溯光星源 S1 `skchr_halo2_1`；溯光星源 S3 `skchr_halo2_3`；星源 S2 `skchr_halo_2`；提丰 S2 `skchr_typhon_2`；提丰 S3 `skchr_typhon_3`；余 S2 `skchr_yu_2`；余 S3 `skchr_yu_3`；灵知 S2 `skchr_gnosis_2`；灵知 S3 `skchr_gnosis_3`；莫斯提马 S3 `skchr_mostma_3`；格雷伊 S2 `skchr_greyy_2`；山 S3 `skchr_f12yin_3`；送葬人 S1 `skchr_excu_1`；断崖 S2 `skchr_ayer_2`；菲亚梅塔 S1 `skchr_phenxi_1`；菲亚梅塔 S3 `skchr_phenxi_3`；暴雨 S2 `skchr_zebra_2`；诗怀雅 S1 `skchr_swire_1`；诗怀雅 S2 `skchr_swire_2`；泥岩 S3 `skchr_mudrok_3`；寒檀 S2 `skchr_sntlla_2`；亚叶 S2 `skchr_folnic_2`；史尔特尔 S2 `skchr_surtr_2`；史尔特尔 S3 `skchr_surtr_3`；伊桑 S2 `skchr_ethan_2`；泡泡 S2 `skchr_bubble_2`；薄绿 S1 `skchr_mint_1`；薄绿 S2 `skchr_mint_2`；隐德来希 S2 `skchr_etlchi_2`；隐德来希 S3 `skchr_etlchi_3`；耶拉 S2 `skchr_kjera_2`；忍冬 S3 `skchr_vulpis_3`；号角 S2 `skchr_horn_2`；号角 S3 `skchr_horn_3`；流明 S3 `skchr_lumen_3`；海蒂 S1 `skchr_heidi_1`；海蒂 S2 `skchr_heidi_2`；缇缇 S1 `skchr_titi_1`；缇缇 S2 `skchr_titi_2`；缇缇 S3 `skchr_titi_3`；佩佩 S2 `skchr_pepe_2`；佩佩 S3 `skchr_pepe_3`；玛恩纳 S3 `skchr_mlynar_3`；海霓 S2 `skchr_haini_2`；林 S2 `skchr_lin_2`；林 S3 `skchr_lin_3`；仇白 S2 `skchr_qiubai_2`；伊内丝 S2 `skchr_ines_2`；伊内丝 S3 `skchr_ines_3`；跃跃 S2 `skchr_caper_2`；哈洛德 S2 `skchr_harold_2`；锏 S1 `skchr_blkkgt_1`；万顷 S2 `skchr_wanqin_2`；左乐 S2 `skchr_zuole_2`；小满 S2 `skchr_grabds_2`；魔王 S1 `skchr_cetsyr_1`；魔王 S2 `skchr_cetsyr_2`；魔王 S3 `skchr_cetsyr_3`；深巡 S2 `skchr_udflow_2`；娜仁图亚 S2 `skchr_narant_2`；娜仁图亚 S3 `skchr_narant_3`；乌尔比安 S2 `skchr_ulpia_2`；菲莱 S1 `skchr_philae_1`；菲莱 S2 `skchr_philae_2`；凯瑟琳 S1 `skchr_cathy_1`；凯瑟琳 S2 `skchr_cathy_2`；瑰盐 S2 `skchr_rosesa_2`；蒂比 S1 `skchr_tippi_1`；蒂比 S2 `skchr_tippi_2`；蕾缪安 S1 `skchr_lemuen_1`；蕾缪安 S2 `skchr_lemuen_2`；蕾缪安 S3 `skchr_lemuen_3`；信仰搅拌机 S2 `skchr_rmixer_2`；信仰搅拌机 S3 `skchr_rmixer_3`；折桠 S2 `skchr_branch_2`；焰尾 S3 `skchr_flamtl_3`；极光 S2 `skchr_aurora_2`；瑕光 S2 `skchr_blemsh_2`；瑕光 S3 `skchr_blemsh_3`；卡涅利安 S1 `skchr_billro_1`；卡涅利安 S2 `skchr_billro_2`；卡涅利安 S3 `skchr_billro_3`；远牙 S2 `skchr_fartth_2`；远牙 S3 `skchr_fartth_3`；灰毫 S2 `skchr_ashlok_2`；水月 S2 `skchr_mizuki_2`；水月 S3 `skchr_mizuki_3`；松果 S2 `skchr_pinecn_2`；阿罗玛 S2 `skchr_aroma_2`；蜜莓 S2 `skchr_glider_2`；死芒 S3 `skchr_necras_3`；桑葚 S2 `skchr_mberry_2`；歌蕾蒂娅 S2 `skchr_glady_2`；歌蕾蒂娅 S3 `skchr_glady_3`；休谟斯 S2 `skchr_humus_2`；野鬃 S2 `skchr_wildmn_2`

</details>

## 重复运行与边界

```powershell
python tools/audit_garrison_batches.py
python tools/audit_garrison_batches.py --check
```

只读取四份现有索引，输出本工作表和对应 JSON；不会提取 APP、重建全库、试运行技能、修改旧清单或重写人工状态。输入改变后重新生成即可，哈希与成员来源随之更新。

统一实施入口：`python tools/build_garrison_skill_batches.py` 串行运行公共 Buff、下一次普攻、技能模式、直接施放四个提供者，各自只编译一次；`--providers next-attack` 等参数可限定受影响组，`--report-only` 仅汇总已生成绑定。实际接入和本轮新增数量见 [批量接入回执](../../work/garrison-skill-batch-report.json)，各组完整拒绝表由回执指向。

编译资格使用 `garrison_skill_scope.py` 的卫戍身份投影，包含隐藏/替补；不会因人工勾选、描述更新或当前已有处理器而改变范围。按组件、角色模式和所有等级黑板的完整条件放行，不能因本表的组件骨架命中就视为可执行。

原始角色模式、外部弹体、动态模板键和原生回调不在这份静态命中表里自动闭合；明确路径数量也不等于验收完成数量。
