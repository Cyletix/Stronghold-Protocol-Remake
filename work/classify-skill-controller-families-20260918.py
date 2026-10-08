"""Read cached graphs once; do not invoke any builder or native extraction."""
import collections, hashlib, json, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from garrison_skill_scope import load_scope
from skill_mode_compiler import ModeCompiler
INPUTS={}
def load(name):
 raw=(ROOT/name).read_bytes();INPUTS[name]=hashlib.sha256(raw).hexdigest()
 return json.loads(raw.decode('utf-8-sig'))
def digest(value):return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def short(value):return value.split('.')[-1].split('+')[-1]
def scan(value,path=''):
 yield path,value
 if isinstance(value,dict):
  for k,v in value.items():
   if k not in {'SerializedState','script','m_Script','m_GameObject'}:yield from scan(v,path+'/'+str(k))
 elif isinstance(value,list):
  for i,v in enumerate(value):yield from scan(v,path+'/'+str(i))
report=load('work/skill-mode-batch-report.json')
graphs=load('work/client-logic/program-compilation.json')
templates=load('work/client-logic/buff-templates.json')
database=load('data/ArknightsGameData/zh_CN/gamedata/buff_table.json')
skills=load('data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json')
characters=load('data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json')
index=load('docs/checklists/implementation-checklist.json')
reference=load('work/operator-mode-next-group.json')
previous=load('work/skill-next-public-families-20260918.json')
next_report=load('work/next-attack-batch-report.json')
direct_report=load('work/direct-skill-batch-report.json')
scope=load_scope();INPUTS.update(scope['sources'])
provider_ids={}
for name in ['web/client_program_data.js','web/next_attack_skill_data.js','web/skill_mode_data.js','web/direct_skill_data.js']:
 raw=(ROOT/name).read_bytes();INPUTS[name]=hashlib.sha256(raw).hexdigest()
 data=json.loads(raw.decode('utf-8-sig').split('=',1)[1].strip().rstrip(';'))
 provider_ids[name]=sorted(data['profiles'])
bound=set().union(*map(set,provider_ids.values()))
idx={s['id']:s for o in index['operators'] if o['scope']=='mode' for s in o['skills']}
selected={sid:r for sid,r in report['rejections'].items() if r['reason']=='unsupported-skill-companions' and sid in scope['skillIds']}
pending={sid:r for sid,r in selected.items() if sid not in bound}
compiler=ModeCompiler(reference,graphs,templates)
INPUTS['client-logic-database']=compiler.evidence.manifest['database']['sha256']
for name in ['tools/skill_mode_compiler.py','tools/next_attack_compiler.py','tools/direct_skill_compiler.py']:
 INPUTS[name]=hashlib.sha256((ROOT/name).read_bytes()).hexdigest()

VISUAL={'UberEffectEmitter','MultiHitUberEffectEmitter','ReadySkillEffect','AnimationEmitBehaviour'}
CONTROLLERS={'CastSkill','CastSkillWithLimitTimes','ReplacementSkill','ReplacementSkillFixed','PassiveSkill','ToggleSkill',
 'AttachOrDetachSkill','AttachSkill','AppearSkill','BurstCastSkill','SwitchSkill','CastWithTokenSkill'}
ALL_BUFFS={};ALL_TEMPLATES={};ALL_COMPONENTS={}
def buff_closure(rows):
 buffs={};tpls={};actions=[];unresolved=[];queue=[];seen=set()
 for node in rows:
  for path,value in scan(node['fields']):
   if isinstance(value,dict) and 'templateKey' in value and 'buffKey' in value:queue.append((value,node['node_id']+path))
 def template(key,origin):
  if key in tpls:return
  tpl=templates.get(key)
  if tpl is None:unresolved.append({'kind':'missing-template','key':key,'origin':origin});return
  h=digest(tpl);tpls[key]=h
  entries=tpl.get('eventToActions',{}).get('_items',[])
  summaries=[]
  for event in entries:
   event_id=event['key'];payload=event['value'];decoded=payload.get('decodedActions')
   if decoded is None:
    try:decoded=json.loads(payload.get('SerializedState','[]'))
    except Exception:unresolved.append({'kind':'undecoded-event','template':key,'event':event_id});continue
   if payload.get('SerializedObjectReferences'):unresolved.append({'kind':'event-object-references','template':key,'event':event_id,'refs':payload['SerializedObjectReferences']})
   types=[];bindings=[]
   for path,value in scan(decoded):
    if isinstance(value,dict) and '$type' in value:
     name=short(value['$type']);types.append(name)
     scalars={k:v for k,v in value.items() if k!='$type' and isinstance(v,(str,int,float,bool))}
     item={'template':key,'event':event_id,'path':path,'type':name,'fields':scalars}
     actions.append(item);bindings.append(item)
    if isinstance(value,dict) and 'templateKey' in value and 'buffKey' in value:queue.append((value,'template/'+key+'/'+str(event_id)+path))
   summaries.append({'event':event_id,'types':types,'actions':bindings,'decodedSha256':digest(decoded)})
  ALL_TEMPLATES[h]={'templateKey':key,'sha256':h,'sourcePointer':'work/client-logic/buff-templates.json#/'+key,'events':summaries}
 def buff(config,origin):
  h=digest(config)
  if h in seen:return
  seen.add(h)
  actual=config
  if config.get('loadFromDB'):
   actual=database.get(config['buffKey'])
   if actual is None:unresolved.append({'kind':'missing-loaded-buff','key':config['buffKey'],'origin':origin});return
  ah=digest(actual);buffs[h]={'origin':origin,'resolvedSha256':ah,'buffKey':actual.get('buffKey'),
   'templateKey':actual.get('templateKey'),'loadedKey':config['buffKey'] if config.get('loadFromDB') else None}
  ALL_BUFFS[ah]={'sha256':ah,'fields':actual}
  template(actual.get('templateKey'),origin)
 while queue:
  config,origin=queue.pop(0);buff(config,origin)
 return {'buffs':list(buffs.values()),'templates':tpls,'actions':actions,'unresolved':unresolved}

def component(row):
 value={'node_id':row['node_id'],'type':row['type'],'fields':row['fields']};h=digest(value)
 ALL_COMPONENTS[h]=value
 return h
def references(value):
 for path,obj in scan(value):
  if isinstance(obj,dict) and set(obj)=={'m_FileID','m_PathID'} and str(obj['m_PathID'])!='0':yield path,obj
def compact_shape(value,nodes=None):
 if isinstance(value,list):return [compact_shape(v,nodes) for v in value]
 if isinstance(value,dict):
  if set(value)=={'m_FileID','m_PathID'}:
   return {'ref':short(nodes.get(str(value['m_PathID']),{}).get('type','external-or-object')) if nodes and str(value['m_PathID'])!='0' else ('null' if str(value['m_PathID'])=='0' else 'external-or-object')}
  return {k:compact_shape(v,nodes) for k,v in value.items() if k not in {'m_GameObject','m_Script','m_Name','node_id','script','SerializedState'}}
 return value

members={};errors=[]
for sid,rejection in pending.items():
 cid=rejection['charIds'][0];prefab=rejection['prefabIds'][0];raw=graphs['rejections'].get(prefab)
 rows=raw.get('components',[]) if raw else compiler.components(prefab)
 levels=skills[sid]['levels'];root_types=collections.Counter(short(r['type']) for r in rows)
 closure=buff_closure(rows);allrows=list(rows);modes=[];gates=[];selected_modes=set()
 for r in rows:
  if short(r['type']) in CONTROLLERS:
   for k in ['_attackBlackboardModeIndex','_rangeIdModeIndex','_defaultModeIndex']:
    v=r['fields'].get(k)
    if isinstance(v,int) and v>0:selected_modes.add(v)
 for a in closure['actions']:
  if a['type']=='SwitchMode' and not a['fields'].get('_restoreDefault'):
   v=a['fields'].get('_modeIndex',1)
   if isinstance(v,int):selected_modes.add(v)
 # Inline mode blackboards can override the template node's serialized fallback.
 for b in closure['buffs']:
  for entry in ALL_BUFFS[b['resolvedSha256']]['fields'].get('blackboard') or []:
   if entry.get('key')=='mode' and isinstance(entry.get('value'),(int,float)) and entry['value']>=0:selected_modes.add(int(entry['value']))
 character=None
 if selected_modes:
  try:
   character=compiler.character(cid)
   for mode_id in sorted(selected_modes|{0}):
    if mode_id>=len(character['modes']):gates.append({'kind':'missing-selected-mode','index':mode_id});continue
    m=character['modes'][mode_id];extra=[];visited=set()
    def resolve(ref):
     key=str(ref.get('m_PathID',0))
     if key=='0' or key in visited:return
     visited.add(key);node=compiler.reader.node(character['bundle'],ref)
     if node is None:gates.append({'kind':'missing-mode-component-reference','mode':mode_id,'reference':ref});return
     if node['unityType']!='MonoBehaviour':return
     companions=compiler.reader.companions(character['bundle'],node)
     for part in companions:
      if part['unityType']!='MonoBehaviour':continue
      r={'node_id':part['pathId'],'type':compiler.reader.name(character['bundle'],part),'fields':part['fields']}
      if not any(x['node_id']==r['node_id'] for x in extra):extra.append(r)
      for _,nested in references(r['fields']):
       if nested.get('m_FileID')==0:resolve(nested)
    for ref in m['fields'].get('_generalAbilities',[]):resolve(ref)
    local=[*m['companions'],*(n for rr in m['roles'].values() for n in rr),*(n for rr in m['actorSelectors'].values() for n in rr),*extra]
    unique={r['node_id']:r for r in local};allrows.extend(unique.values())
    modes.append({'index':mode_id,'sourcePathId':m['pathId'],'roles':{k:[short(n['type']) for n in v] for k,v in m['roles'].items()},
     'generalComponents':[short(r['type']) for r in extra],'componentRefs':[component(r) for r in unique.values()]})
  except Exception as exc:gates.append({'kind':'unresolved-mode-closure','error':type(exc).__name__+': '+str(exc)})
 # Scan the union once; duplicate template expansion is memoized in the output dictionary.
 closure=buff_closure(allrows)
 names=[];projectiles=[];selectors=[];controllers=[]
 for r in allrows:
  typ=short(r['type']);f=r['fields']
  if typ in CONTROLLERS or typ=='ThreePartChannelingAnimation':controllers.append({'type':typ,'nodeId':r['node_id'],'fields':{k:v for k,v in f.items() if k not in {'m_GameObject','m_Script','m_Name'}}})
  if 'Selector' in typ:selectors.append({'type':typ,'nodeId':r['node_id'],'fields':{k:v for k,v in f.items() if k not in {'m_GameObject','m_Script','m_Name'}}})
  for p,v in scan(f):
   if p.endswith(('_projectileKey','_additionalProjectile')) and isinstance(v,str) and v:projectiles.append(v)
 for a in closure['actions']:
  if any(s in a['type'] for s in ['Ability','Token','Skill','Projectile']):names.append(a)
 projectile_contracts={}
 for key in sorted(set(projectiles)):
  try:
   result=compiler.projectiles.compile(key)
   projectile_contracts[key]={'status':'accepted-existing-simple-projectile','contractSha256':digest(result)}
  except Exception as exc:projectile_contracts[key]={'status':'requires-public-projectile-dependency','reason':getattr(exc,'category',type(exc).__name__),'detail':getattr(exc,'detail',str(exc))}
 action_types=sorted({a['type'] for a in closure['actions']})
 if names:gates.append({'kind':'named-or-external-action-dependencies','actions':names})
 gates.extend(closure['unresolved'])
 for rname,rr in [('next-attack',next_report),('direct-actions',direct_report)]:
  if sid in rr['rejected']:gates.append({'kind':'existing-provider-rejection','provider':rname,'record':rr['rejected'][sid]})
 if selected_modes:gates.append({'kind':'selected-mode-controller-not-counterfactually-compiled','indices':sorted(selected_modes)})
 gates.append({'kind':'full-level-blackboard-consumption-not-proven','keys':sorted({b['key'] for l in levels for b in l['blackboard']})})
 nodes={str(r['node_id']):r for r in allrows};signature=digest({'root':sorted(({'type':short(r['type']),'fields':compact_shape(r['fields'],nodes)} for r in rows if short(r['type']) not in VISUAL),key=lambda x:(x['type'],digest(x))),
  'buffs':[compact_shape(ALL_BUFFS[b['resolvedSha256']]['fields']) for b in closure['buffs']],
  'events':closure['actions'],'modes':[{k:v for k,v in m.items() if k not in {'componentRefs','sourcePathId'}} for m in modes]})
 members[sid]={'skillId':sid,'charId':cid,'name':characters[cid]['name'],'skillName':levels[0]['name'],
  'fixed':cid in scope['fixedCharIds'],'legacyExplicitHandler':bool(idx[sid].get('explicitHandler')),'netNewCandidate':not idx[sid].get('explicitHandler'),
  'firstRejection':rejection,'source':{'prefabId':prefab,'graphPointer':'work/client-logic/program-compilation.json#/rejections/'+prefab+'/components',
   'graphSha256':digest(rows),'levelsSha256':digest(levels),'characterBundleSha256':character['bundleSha256'] if character else None},
  'sourceLevelCount':len(levels),'rootComponentTypes':dict(root_types),'componentRefs':[component(r) for r in allrows],
  'controllers':controllers,'selectors':selectors,'selectedModes':modes,'buffClosure':closure,'eventActionTypes':action_types,
  'projectiles':projectile_contracts,'completeFollowingGates':gates,'closureSignature':signature,
  'previous24Classification':{'path':'work/skill-next-public-families-20260918.json','family':previous['members'][sid]['structuralFamily']} if sid in previous['members'] else None}

out={'schemaVersion':1,'rule':'garrison-unsupported-companion-controller-closure-families-v1','date':'2026-09-18','inputs':INPUTS,
 'scope':{'sourceScope':scope['sources'],'selectedFirstRejection':'unsupported-skill-companions','firstRejectedSkills':len(selected),
  'excludedFourProviders':sorted(set(selected)&bound),'fourProviderSkillIds':provider_ids,'classifiedSkills':len(members),
  'legacyExplicitMembers':[s for s,m in members.items() if m['legacyExplicitHandler']],
  'netNewCandidateCount':sum(m['netNewCandidate'] for m in members.values()),
  'previous24Count':len(previous['members']),'previous24Overlap':sorted(set(members)&set(previous['members']))},
 'boundaries':['Read-only assessment from existing cached components/Buff events; no builder, generated runtime data or native method changed.',
 'Graph closure and shared shape are not proof that a controller alone binds a whole skill. CurrentlyBindable is zero until all listed gates, blackboards and runtime consumers pass.',
 'All 160 four-provider-unbound rows are retained; existing legacy explicit handlers are marked migration-only and excluded from net-new recommendations.',
 'Cached skill root and referenced Buff event trees were structurally traversed. Referenced selected character-mode/general abilities are included; named ability/token dependencies remain explicit gates when unresolved.',
 'Projectile inspection reuses the existing strict cached compiler; rejected specialized trees remain dependencies. No new source extraction is performed.',
 'Historical 24-member Buff/mode classification is referenced for deduplication; changed source hashes require a new assessment rather than silently inheriting conclusions.'],
 'members':members,'componentDictionary':ALL_COMPONENTS,'buffDictionary':ALL_BUFFS,'templateDictionary':ALL_TEMPLATES}
target=ROOT/'work/skill-controller-public-closures-20260918.json';target.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
print(json.dumps({'classified':len(members),'netNew':out['scope']['netNewCandidateCount'],'templates':len(ALL_TEMPLATES),'buffs':len(ALL_BUFFS),'components':len(ALL_COMPONENTS),'previousOverlap':out['scope']['previous24Overlap']},ensure_ascii=False))
