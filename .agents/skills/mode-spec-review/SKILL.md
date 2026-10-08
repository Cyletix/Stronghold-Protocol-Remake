---
name: mode-spec-review
description: "定义或修改 docs/spec/mode-spec.md 的玩法规则时使用；逐条核目标、边界、来源和客户端一致性。"
---
# 玩法规格审查

逐条核对：
1. 目标行为：多回合、普通战、联防与 Boss 的实际规则。
2. 边界：默认/极限、回合切换、1–4 人、配对归属和合成。
3. 来源：精确 gamedata 键、关卡 JSON、教程或可重复实验。
4. 证据：按 research-evidence 区分事实、推断和假设。
5. 差异：实现与已验证行为冲突时明确保留。
6. 验证：能证伪错误实现的检查或实验。

## 来源定位

- 规格：`docs/spec/mode-spec.md`；研究：`docs/research/findings.md`。
- 源根：`data/ArknightsGameData/zh_CN/gamedata/`。
- 赛季：`excel/activity_table.json` 的 `activity.AUTOCHESS_SEASON`；分别核对 act1autochess / act2autochess 下的目录及版本。
- 其他模式字段与教程按当前源文件实际结构定位；不把旧版 autoChessData 字段路径泛化到所有快照。
