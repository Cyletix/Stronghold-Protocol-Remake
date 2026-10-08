"""Group the already-frozen flow closure checks; no source extraction or recompile."""
import json
from pathlib import Path
from collections import defaultdict

ROOT=Path(__file__).resolve().parents[1]
source='work/skill-flow-batch-contract.json'
contract=json.loads((ROOT/source).read_text(encoding='utf-8'))
providers=[json.loads((ROOT/p).read_text(encoding='utf-8').split('=',1)[1].strip().removesuffix(';'))
    for p in ['web/skill_mode_data.js','web/next_attack_skill_data.js','web/direct_skill_data.js','web/client_program_data.js']]
groups=defaultdict(set);pending=[]
for sid,m in contract['members'].items():
    if any(sid in data['profiles'] and m['charId'] in data['profiles'][sid]['charIds'] for data in providers):continue
    pending.append(sid)
    for kind,checks in [('整根',[{'accepted':False,'rejection':m.get('wholeRejection',{})}]),('控制器',m['controlChecks']),('叶子',m['leafChecks'])]:
        for c in checks:
            if c.get('accepted'):continue
            err=c.get('rejection',{});reason=err.get('reason') or c.get('type','unknown').rsplit('.',1)[-1]
            # Attribute/flag/control names group behavior, never a per-ID path.
            detail=err.get('path','') if kind!='叶子' and err.get('reason')=='unsupported-sequence-control' else ''
            groups[(kind,reason,detail)].add(sid)
def label(sid):
    m=contract['members'][sid];return m['name']+' '+m['skillName']+' (`'+sid+'`)'
lines=['# 组合控制器的公共缺口表','','由 `python tools/render_skill_flow_queue.py` 只读取冻结完整合同和当前绑定生成；不重新提取、不编译、不自动勾验收。推进顺序仍以[当前计划](../plan.md)为准。',
       '',f'冻结候选 {len(contract["members"])} 项，当前仍待绑定 {len(pending)} 项。来源：[完整合同](../../{source})。下表为重叠依赖，数量不可相加，也不表示实现某一行后全部成员即可直接放行。',
       '', '| 层次 | 公共缺口 | 关联数 | 成员 |','| --- | --- | ---: | --- |']
for (kind,reason,detail),ids in sorted(groups.items(),key=lambda x:(x[0][0],-len(x[1]),x[0][1:])):
    lines.append('| '+kind+' | `'+reason+(' · '+detail if detail else '')+'` | '+str(len(ids))+' | '+'；'.join(label(sid) for sid in sorted(ids))+' |')
lines+=['','先实现共享控制/叶子及其完成事件、目标和寿命，再按完整源图一次生成；拥有可复用的普通攻击或直接施放消费者，不证明它已支持组合子项完成语义。表现类组件也仍需证明没有逻辑副作用，不能仅凭名称自动忽略。','']
out=ROOT/'docs/generated/skill-flow-queue.md';out.write_text('\n'.join(lines),encoding='utf-8')
print(json.dumps(dict(pending=len(pending),overlappingGroups=len(groups),output=str(out.relative_to(ROOT))),ensure_ascii=False))
