---
name: mode-spec-review
description: "对卫戍协议玩法/规则规格做逐条评审：目标行为、边界、数据来源、证据等级与客户端一致性。触发：定义或修改 docs/mode-spec.md 的玩法规则时。"
---

# Mode Spec Review

1. **目标行为**：这条规则在真实卫戍协议里如何工作（多回合、多人联防、BOSS 战）。
2. **边界**：默认值、极限、回合边界、1~4 人联防交互、满阶合成。
3. **数据来源**：明确 gamedata 键、关卡 JSON、教学文案或可重复实验。
4. **证据等级**：按 `research-evidence` 区分 Verified / Inferred / Hypothesis。
5. **客户端一致性**：实现与已验证客户端行为不一致时，明确记录差异，不得静默覆盖。
6. **可验证性**：给出 smoke、数据检查或实验方案。

## 本项目资源

- 模式规则：`docs/mode-spec.md`。
- 已验证事实：`docs/findings.md`。
- 教学文案：`gamedata/story/activities/*/guide/*.txt`。
- 数据源：`activity_table.json` 的 `autoChessData`（`bandDataDict`、`bondInfoDict`、`bossInfoDict`、`enemyTypeDatas`、`effectTypeDataDict`、`constData` 等）。
