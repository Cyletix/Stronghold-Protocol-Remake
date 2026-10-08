import json
from pathlib import Path

release=json.loads(Path('work/heal-event-release.json').read_text())
review=json.loads(Path('work/heal-event-checklist-revalidation.json').read_text())
assert review['finalIds']==6328 and review['finalAccepted']==501 and review['revalidated']==487
p=Path('docs/plan.md');s=p.read_text(encoding='utf-8');lines=s.splitlines()
for i,line in enumerate(lines):
    if line.startswith('- 最新批次覆盖Web123'):
        lines[i]=f"- 最新批次Web127个检查组、父侧206项相关测试、候选索引9项校验通过。原497项限定验收保留，其中487项共享依据变化沿原专项复核；新增银灰最终DEF、achunt死亡清理及两款短刀单件叠层4项，当前501/6328。运行版本`{release['version']}`，目录指纹`{release['fingerprint']}`。旧休整精确迁移核报价/生命/随机状态及错误短刀mods修复，旧战斗快照不迁移。稳定ID和原记录保留；实际异地四人长局、精确表现和房主进程重启恢复仍有缺口，不据此标记全技能或全模式完成。"
        break
else: raise AssertionError('previous baseline paragraph missing')
p.write_text('\n'.join(lines)+'\n',encoding='utf-8')
p=Path('docs/checklists/mechanism-research.md');s=p.read_text(encoding='utf-8')
block=f"  - 记录：2026-09-14本批Web127组通过（124运行/来源组及3清单文档组），父侧206项相关测试及候选9项通过。总集成发现旧道具奖励测试仍把短刀断言为stat，按原始事件图改为reactive并核零静态mods后通过；未回退源修正。原6324ID/497项验收与全部人工记录保留，487项共享依据变化沿原专项复核，新增最终DEF/根标记死亡清理/两款短刀共4项至501/6328。版本{release['version']}、指纹{release['fingerprint']}；旧d1480e625b962d1a休整保留报价/生命/资金/RNG并修正短刀常驻mods，旧战斗快照不迁移。父DPS独立3自疗模型不计新增伤害图，原SQLite哈希未变；短刀与最终DEF独立审查无回归发现。全模式、多件原版合并/瞬发事件顺序、异地四人长局与房主进程重启仍未验收，R12保持未勾。\n\n"
assert '\n## 每批记录' in s;s=s.replace('\n## 每批记录','\n'+block+'## 每批记录')
p.write_text(s,encoding='utf-8')
print('final plan and R12 totals: 127 groups / 206 parent tests / 501 of 6328 / '+release['fingerprint'])
