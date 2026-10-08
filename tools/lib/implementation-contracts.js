'use strict';
// Change selection is an implementation dependency model, not proof of native
// semantics. Source byte hashes remain separate from function/module impact.
const crypto=require('node:crypto'),vm=require('node:vm');
const hash=text=>text==null?null:crypto.createHash('sha256').update(text).digest('hex');
const smoke=name=>'tools/_'+name+'_smoke.js';
const list=names=>names.split(' ').filter(Boolean).map(smoke);
const definitions=[
 {id:'skill-lifecycle',consumers:['skill dispatch, SP lock and skill cleanup','equipment/medical skill-start listeners'],tests:list('skill_timing common_cost_skills common_buff_skills common_expansion operator_combat equip_skill_stacks medic_talents'),accepted:/\/skill\//},
 {id:'attributes',consumers:['operator attack/defense/interval queries','Boss defense selection and elemental defense links'],tests:list('common_buff_skills client_stat_buff final_defense elemental_sources operator_combat basic_attacks boss_runtime_integration'),accepted:/\/skill\//},
 {id:'defense-query',consumers:['final defense consumers and dynamic defense links'],tests:list('final_defense elemental_sources client_stat_buff client_programs boss_runtime_integration')},
 {id:'resistance-query',consumers:['enemyDamageToOperator arts mitigation','phalanx innate resistance, elemental flat changes and program layers'],tests:list('client_programs elemental_sources final_defense beeswax')},
 {id:'operator-detail',consumers:['buildOperatorDetailModel live ATK/DEF/RES versus rest source values'],tests:list('client_programs final_defense roster_catalog operator_skill_levels')},
 {id:'attack-interval',consumers:['operator-combat attack scheduling','stored attacks and skill interval modifiers'],tests:list('operator_combat basic_attacks skill_timing common_buff_skills hunter mystic funnel')},
 {id:'client-stat',dependsOn:['skill-lifecycle','attributes','attack-interval','skill-bindings'],consumers:['ArkClientStatBuffSkills.configure/interval/defense'],tests:list('client_stat_buff final_defense')},
 {id:'client-programs',dependsOn:['skill-lifecycle','attributes','attack-interval','skill-bindings'],consumers:['compiled client program configuration and lifecycle','compatibility with the previous stat graph runtime'],tests:list('client_programs client_stat_buff common_buff_skills common_expansion')},
 {id:'program-tick-hook',consumers:['program Buff expiry immediately after normal skill expiry','simulation time, HP sync and restored owner state'],tests:list('client_programs skill_timing simulation_clock room_battle_runtime')},
 {id:'skill-bindings',consumers:['finalizeOperator and debugTacticalEntry','source skill IDs, training levels and runtime configuration'],tests:['tools/build_operator_skill_levels.js',...list('operator_skill_levels season_roster roster_catalog common_expansion')]},
 {id:'runtime-state',consumers:['catalog/version validation','rest save, owner identity and authenticated battle restore'],tests:list('rest_save room_game_runtime room_battle_runtime room_battle_session room_game_server room_game_client')},
 {id:'bootstrap',consumers:['browser and room VM script loading'],tests:['tools/build_mode.js',...list('solo_local room_game_runtime room_game_client')]},
 {id:'enemy-death',consumers:['final-death callbacks, pending spawns and victory'],tests:list('enemy_death_spawn enemy_prop achunt_cleanup enemy_transfer medic_talents boss_victory enemy_runtime')},
 {id:'damage',consumers:['actual HP modification, source/type and modifier-event suppression'],tests:list('operator_combat enemy_prop enemy_transfer equip_protection protective_medic blacknight elemental_sources')},
 {id:'equipment-stacks',dependsOn:['skill-lifecycle','attributes'],consumers:['equipment source identity, skill activation and deployment state'],tests:['tools/build_equip_skill_stacks.js','tools/build_equip_data.js',...list('equip_skill_stacks loadout_items items shop_items rest_save')]},
 {id:'equipment-protection',dependsOn:['damage'],consumers:['damage source and current blocking relation'],tests:['tools/build_equip_protection.js',...list('equip_protection loadout_items rest_save')]},
 {id:'enemy-passives',consumers:['source-bound enemy block/transfer/cleanup passives'],tests:['tools/build_enemy_passives.js',...list('enemy_passives enemy_transfer achunt_cleanup')]},
 {id:'combat-tick',consumers:['the shared battle update loop; all registered behavior suites'],allGame:true},
 {id:'impact-tooling',consumers:['check selection and unknown-change fallback'],tests:list('check_impact check_game')},
 {id:'receipt-tooling',consumers:['central review renewal evidence and exact old/new basis'],tests:list('checklist_revalidation')},
];
const moduleContracts={
 'web/src/simulation/attributes.js':['attributes'],
 'web/src/simulation/client-stat-buffs.js':['client-stat'],
 'web/client_stat_buff_data.js':['client-stat'],
 'tools/build_client_stat_buffs.py':['client-stat'],
 'tools/test_client_stat_buffs.py':['client-stat'],
 'web/src/simulation/client-programs.js':['client-programs'],
 'web/client_program_data.js':['client-programs'],
 'tools/build_client_programs.py':['client-programs'],
 'web/src/simulation/newclient-programs.js':['client-programs'],
 'web/src/simulation/common-skills.js':['skill-lifecycle'],
 'web/common_skill_data.js':['skill-bindings','skill-lifecycle'],
 'tools/build_common_skill_data.js':['skill-bindings','skill-lifecycle'],
 'web/operator_skill_levels.js':['skill-bindings'],
 'tools/build_operator_skill_levels.js':['skill-bindings'],
 'web/src/rules/skill-levels.js':['skill-bindings'],
 'web/skill_choices.json':['skill-bindings'],
 'web/skill_data.json':['skill-bindings'],
 'web/src/simulation/equip-skill-stacks.js':['equipment-stacks'],
 'web/equip-skill-stacks-data.js':['equipment-stacks'],
 'tools/build_equip_skill_stacks.js':['equipment-stacks'],
 'web/src/simulation/equip-protection.js':['equipment-protection'],
 'web/equip-protection-data.js':['equipment-protection'],
 'tools/build_equip_protection.js':['equipment-protection'],
 'web/src/simulation/enemy-passives.js':['enemy-passives'],
 'web/enemy_passive_data.js':['enemy-passives'],
 'tools/build_enemy_passives.js':['enemy-passives'],
 'web/src/simulation/enemy-death-spawn.js':['enemy-death'],
 'web/enemy_death_spawn_data.js':['enemy-death'],
 'tools/build_enemy_death_spawn.js':['enemy-death'],
 'web/mode/save.js':['runtime-state'],
 'tools/lib/implementation-contracts.js':['impact-tooling'],
 'tools/check_impact.js':['impact-tooling'],
 'tools/check_game.js':['impact-tooling'],
 'tools/lib/checklist-revalidation.js':['receipt-tooling'],
};
const functionContracts={
 'web/engine.js':{
  castSkill:['skill-lifecycle'],endOperatorSkill:['skill-lifecycle'],tickOp:['skill-lifecycle','attack-interval'],
  updateOperatorBaseStats:['attributes','skill-bindings'],buffMul:['attributes'],operatorDefense:['defense-query'],operatorResistance:['resistance-query'],operatorAttackPower:['attributes'],
  startBattle:['runtime-state','skill-lifecycle'],tryKill:['skill-lifecycle','enemy-death'],respawnOperators:['skill-lifecycle'],
  inflictDamage:['damage'],hitEnemy:['damage'],enemyDamageToOperator:['damage','resistance-query'],killEnemy:['enemy-death'],finishDefeatedLeader:['enemy-death'],
  update:['combat-tick'],
 },
 'web/src/simulation/operator-combat.js':{attackInterval:['attack-interval'],configure:['skill-bindings'],damage:['damage'],attack:['skill-lifecycle','damage','attack-interval']},
 'web/mode/rules.js':{finalizeOperator:['skill-bindings','attributes'],equipmentModifiers:['equipment-stacks','equipment-protection'],initMode:['bootstrap','skill-bindings']},
 'web/mode/debug.js':{debugTacticalEntry:['skill-bindings']},
 'web/mode/ui.js':{buildOperatorDetailModel:['operator-detail']},
 'tools/lib/room-game-runtime.js':{fingerprintOf:['runtime-state']},
};
const allowedHelperAdditions={'web/engine.js':['operatorResistance']};
const normalizeEol=source=>source.replace(/\r\n/g,'\n');
const versionFiles={'web/room-game.js':['GAME_VERSION','CLIENT_VERSION','PROTOCOL_VERSION'],'web/room-presence.js':['GAME_VERSION','CLIENT_VERSION','PROTOCOL_VERSION'],'tools/room_server.js':['GAME_VERSION','CLIENT_VERSION','PROTOCOL_VERSION'],'tools/lib/room-game-runtime.js':['SCHEMA_VERSION']};
function onlyVersionChange(p,before,after){
 if(!versionFiles[p]||before==null||after==null)return false;
 before=normalizeEol(before);after=normalizeEol(after);
 const re=new RegExp('\\b('+versionFiles[p].join('|')+')\\s*=\\s*(?:"[^"\\r\\n]*"|\'[^\'\\r\\n]*\'|[0-9]+)','g');
 return re.test(before)&&before.replace(re,'$1=@version')===after.replace(re,'$1=@version');
}

// This conservative lexer only locates complete named function boundaries. It
// does not normalize their contents or infer equivalence. Unknown syntax or a
// change outside a declared function falls back to the shared-code boundary.
function tokens(source){
 const out=[];let i=0,previous='';
 const expressionStart=()=>!previous||/^(?:[({[=,:;!?&|+*%~<>-]|=>|return|throw|case|delete|void|typeof|instanceof|in|of|yield)$/.test(previous);
 function quoted(quote){i++;while(i<source.length){if(source[i]==='\\'){i+=2;continue;}if(source[i++]===quote)return;}throw Error('Unclosed string');}
 function template(){
  i++;while(i<source.length){if(source[i]==='\\'){i+=2;continue;}if(source[i]==='`'){i++;return;}
   if(source[i]==='$'&&source[i+1]==='{'){
    i+=2;let depth=1;const saved=previous;previous='';
    while(i<source.length&&depth){const t=next();if(!t)break;if(t.value==='{')depth++;if(t.value==='}')depth--;}
    if(depth)throw Error('Unclosed template expression');previous=saved;
   }else i++;
  }throw Error('Unclosed template');
 }
 function next(){
  for(;;){while(/\s/.test(source[i]||'')&&i<source.length)i++;
   if(source.slice(i,i+2)==='//'){while(i<source.length&&source[i]!=='\n')i++;continue;}
   if(source.slice(i,i+2)==='/*'){const end=source.indexOf('*/',i+2);if(end<0)throw Error('Unclosed comment');i=end+2;continue;}break;
  }
  if(i>=source.length)return null;const start=i,c=source[i];
  if(c==='"'||c==="'")quoted(c);
  else if(c==='`')template();
  else if(c==='/'&&expressionStart()){
   i++;let bracket=false,closed=false;
   while(i<source.length){const ch=source[i++];if(ch==='\\'){i++;continue;}if(ch==='\n'||ch==='\r')throw Error('Ambiguous regex');if(ch==='[')bracket=true;if(ch===']')bracket=false;if(ch==='/'&&!bracket){closed=true;break;}}
   if(!closed)throw Error('Unclosed regex');while(/[a-z]/i.test(source[i]||'')&&i<source.length)i++;
  }else if(/[A-Za-z_$]/.test(c)){i++;while(/[\w$]/.test(source[i]||'')&&i<source.length)i++;}
  else if(/[0-9]/.test(c)){i++;while(/[\w.]/.test(source[i]||'')&&i<source.length)i++;}
  else {const op=['===','!==','=>','++','--','?.','==','!=','<=','>=','&&','||','??','**','+=','-='].find(v=>source.startsWith(v,i));i+=op?.length||1;}
  const value=source.slice(start,i);previous=value;return {value,start,end:i};
 }
 for(let t;(t=next());)out.push(t);return out;
}
function splitFunctions(source){
 new vm.Script(source);const ts=tokens(source),functions=new Map(),ranges=[];
 for(let i=0;i<ts.length;i++){
  if(ts[i].value!=='function'||!/^[A-Za-z_$][\w$]*$/.test(ts[i+1]?.value||'')||ts[i+2]?.value!=='(')continue;
  const name=ts[i+1].value;let k=i+2,depth=0;
  for(;k<ts.length;k++){if(ts[k].value==='(')depth++;if(ts[k].value===')'&&!--depth)break;}
  if(ts[k+1]?.value!=='{')throw Error('Unsupported function signature');
  const body=k+1;depth=0;for(k=body;k<ts.length;k++){if(ts[k].value==='{')depth++;if(ts[k].value==='}'&&!--depth)break;}
  if(k===ts.length||functions.has(name))throw Error('Ambiguous function '+name);
  const start=ts[i-1]?.value==='async'?ts[i-1].start:ts[i].start,end=ts[k].end;
  const bodySource=source.slice(start,end);
  // Reject a lexer boundary that accidentally includes a following statement
  // or ends inside a regex/template. A complete function is one expression.
  new vm.Script('('+bodySource+'\n)');
  functions.set(name,bodySource);ranges.push({start,end,name});i=k;
 }
 let remaining='',cursor=0;for(const r of ranges){remaining+=source.slice(cursor,r.start)+'/* function '+r.name+' */';cursor=r.end;}remaining+=source.slice(cursor);
 return {functions,remaining};
}
function functionChanges(before,after){
 const a=splitFunctions(normalizeEol(before)),b=splitFunctions(normalizeEol(after)),changed=[];
 for(const name of new Set([...a.functions.keys(),...b.functions.keys()]))if(a.functions.get(name)!==b.functions.get(name))changed.push(name);
 return {changed,outside:a.remaining!==b.remaining};
}
function knownHelperAddition(p,before,after){
 const permitted=allowedHelperAdditions[p];if(!permitted)return [];
 const a=splitFunctions(normalizeEol(before)),b=splitFunctions(normalizeEol(after));
 const added=[...b.functions.keys()].filter(name=>!a.functions.has(name));
 if(!added.length||added.some(name=>!permitted.includes(name)))return [];
 let remaining=b.remaining;
 for(const name of added){const marker='/* function '+name+' */\n';if(remaining.split(marker).length!==2)return [];remaining=remaining.replace(marker,'');}
 // The named addition is allowed only if its placeholder explains the ENTIRE
 // top-level delta. Existing bodies are still checked individually below.
 return remaining===a.remaining?added:[];
}
function onlyProgramTickInsertion(before,after){
 const a=splitFunctions(before).functions.get('update'),b=splitFunctions(after).functions.get('update');if(!a||!b)return false;
 const normalized=s=>s.replace(/\r\n/g,'\n');
 const line=/^([ \t]*)if \(o\.skillState && o\.skillState\.until <= B\.time \+ 1e-9\) endOperatorSkill\(o,'expire'\);\n\1window\.ArkClientPrograms\?\.tick\(o,B\.time\);[ \t]*\n/gm;
 const text=normalized(b),matches=[...text.matchAll(line)];if(matches.length!==1)return false;
 const match=matches[0],lexed=tokens(text),hookAt=text.indexOf('window.ArkClientPrograms',match.index);
 if(!lexed.some(t=>t.start===match.index+match[1].length&&t.value==='if')||!lexed.some(t=>t.start===hookAt&&t.value==='window'))return false;
 const reduced=text.replace(line,m=>m.slice(0,m.indexOf('\n')+1));
 // Stronger than token equality: apart from CRLF and this complete inserted
 // line, preserve the old body byte-for-byte (including ASI-sensitive breaks).
 return reduced===normalized(a)&&JSON.stringify(tokens(reduced).map(t=>t.value))===JSON.stringify(tokens(a).map(t=>t.value));
}
function dataValue(text){
 if(text==null)return null;
 const trimmed=text.replace(/^\s*\/\/[^\n]*(?:\n|$)/g,'').trim();
 return JSON.parse(trimmed.startsWith('{')||trimmed.startsWith('[')?trimmed:trimmed.replace(/^(?:window|globalThis)\.[\w$]+\s*=\s*/,'').replace(/;\s*$/,''));
}
function changedDataKeys(before,after){
 try{const a=dataValue(before),b=dataValue(after);if(!a||!b||Array.isArray(a)||Array.isArray(b))return [];
  return [...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k]));
 }catch{return [];}
}
function changedDataSlices(before,after){
 try{const a=dataValue(before)||{},b=dataValue(after)||{},slices=[];
  for(const group of ['profiles','skills','programs','bindings','']){
   const left=group?a[group]:a,right=group?b[group]:b;
   if(!left&&!right)continue;if(Array.isArray(left)||Array.isArray(right))continue;
   for(const key of new Set([...Object.keys(left||{}),...Object.keys(right||{})])){
    if(!group&&!/^(?:char_|skchr_|skcom_)/.test(key))continue;
    const beforeText=JSON.stringify(left?.[key])??null,afterText=JSON.stringify(right?.[key])??null;
    if(beforeText!==afterText)slices.push({pointer:'/'+[group,key].filter(Boolean).map(k=>k.replace(/~/g,'~0').replace(/\//g,'~1')).join('/'),beforeHash:hash(beforeText),afterHash:hash(afterText)});
   }
  }return slices;
 }catch{return [];}
}
const isDocs=p=>p.startsWith('docs/')||p.startsWith('.agents/')||/\.md$/i.test(p);
const documentChecks=new Set(['docs','implementation checklist','content coverage','operator mechanics audit']);
function selectImpact({changes,checks,acceptanceMap=[]}){
 const selected=new Map(),active=new Map(),events=[],unregistered=new Set();
 const byId=new Map(definitions.map(d=>[d.id,d]));
 const addCheck=(row,reason)=>{const key=JSON.stringify(row);if(!selected.has(key))selected.set(key,{name:row[0],args:row[1],reasons:[]});const reasons=selected.get(key).reasons;if(!reasons.includes(reason))reasons.push(reason);};
 const selectFiles=(paths,reason)=>{for(const p of paths){const rows=checks.filter(([,args])=>args[0]===p);if(!rows.length)unregistered.add(p);for(const row of rows)addCheck(row,reason);}};
 const allGame=reason=>{for(const row of checks)if(!documentChecks.has(row[0])&&row[1][0]!==smoke('check_impact'))addCheck(row,reason);};
 const activate=(id,reason)=>{if(!active.has(id))active.set(id,[]);if(!active.get(id).includes(reason))active.get(id).push(reason);};
 for(const change of changes){
  const p=change.path.replace(/\\/g,'/');if(change.before!==undefined&&change.before===change.after)continue;
  const event={path:p,beforeHash:hash(change.before),afterHash:hash(change.after),kind:change.before===undefined?'unknown-before':change.before===null?'added':change.after===null?'deleted':'modified',reasons:[]};events.push(event);
  if(isDocs(p)){event.reasons.push('documentation-only');for(const row of checks)if(row[0]==='docs')addCheck(row,p+': documentation');continue;}
  if(p.startsWith('work/')||p.startsWith('assets/task/')){event.reasons.push('research or task artifact; no runtime dependency');continue;}
  const direct=checks.filter(([,args])=>args[0]===p);
  if(direct.length&&!moduleContracts[p]){for(const row of direct)addCheck(row,p+': changed registered check');event.reasons.push('registered-check');continue;}
  if(onlyVersionChange(p,change.before,change.after)){activate('runtime-state',p+': version declaration');activate('bootstrap',p+': version compatibility');event.reasons.push('only the registered version declaration changed');continue;}
  if(functionContracts[p]&&change.before!=null&&change.after!=null){
   try{const delta=functionChanges(change.before,change.after);event.functions=delta.changed;
    const additions=delta.outside?knownHelperAddition(p,change.before,change.after):[];
    const outside=delta.outside&&!additions.length;if(additions.length)event.reasons.push('only declared helper added outside existing bodies: '+additions.join(', '));
    let unknown=outside;for(const name of delta.changed){
     if(p==='web/engine.js'&&name==='update'&&onlyProgramTickInsertion(change.before,change.after)){
      activate('client-programs',p+'#update: exact tick insertion');activate('program-tick-hook',p+'#update: after endOperatorSkill(expire)');event.reasons.push('update: only the exact owner/time tick call was inserted after skill expiry');continue;
     }
     const ids=functionContracts[p][name];if(!ids){unknown=true;event.reasons.push('unmapped function '+name);}else for(const id of ids)activate(id,p+'#'+name);}
    if(outside)event.reasons.push('change outside named function boundaries');
    if(unknown)allGame(p+': unknown shared-code change');else event.reasons.push('complete changed function bodies mapped');
    continue;
   }catch(e){event.reasons.push('function analysis refused: '+e.message);allGame(p+': unclassified shared code');continue;}
  }
  if(moduleContracts[p]){for(const id of moduleContracts[p])activate(id,p+': declared module dependency');event.dataKeys=changedDataKeys(change.before,change.after);event.sourceSlices=changedDataSlices(change.before,change.after);event.reasons.push('module scope; byte hashes do not assert semantic change');continue;}
  if(p==='web/mode.js'){
   if(changes.some(c=>c.path.startsWith('web/mode/')&&c.before!==c.after)){activate('bootstrap',p+': derived mode bundle, source changes also supplied');event.reasons.push('derived bundle; source changes remain independently checked');}
   else {allGame(p+': generated bundle changed without its source delta');event.reasons.push('unknown generated bundle change');}continue;
  }
  if(p==='web/index.html'&&change.before!=null&&change.after!=null){
   const script=/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi;
   const get=text=>[...text.matchAll(script)].map(m=>m[1].split('?')[0]);
   const a=get(change.before),b=get(change.after);
   const remainder=text=>text.replace(script,'').replace(/>\s+</g,'><').trim();
   if(remainder(change.before)===remainder(change.after)){
    activate('bootstrap',p+': script loading');for(const src of new Set([...a,...b]))if(a.includes(src)!==b.includes(src)){
     const ids=moduleContracts['web/'+src];if(ids)for(const id of ids)activate(id,p+': script '+src);else allGame(p+': unknown added/removed script '+src);
    }event.reasons.push('script-list change');continue;
   }
  }
  event.reasons.push('unknown dependency; conservative expansion');allGame(p+': unknown dependency');
 }
 // Dependency edges point from a consumer to the contract it relies on.
 for(let expanded=true;expanded;){expanded=false;for(const d of definitions)for(const dependency of d.dependsOn||[])if(active.has(dependency)){const existed=active.has(d.id);activate(d.id,'depends on '+dependency);if(!existed)expanded=true;}}
 for(const [id,reasons]of active){const d=byId.get(id),reason=id+': '+reasons.join('; ');if(d.allGame)allGame(reason);selectFiles(d.tests||[],reason);
  if(d.accepted)selectFiles([...new Set(acceptanceMap.filter(v=>d.accepted.test(v.id)).flatMap(v=>v.tests))],reason+'; previous acceptance test consumers');
 }
 const ordered=checks.map(row=>selected.get(JSON.stringify(row))).filter(Boolean);
 const paths=new Set(ordered.map(row=>row.args[0]));
 return {schemaVersion:1,contractRegistryHash:hash(JSON.stringify([definitions.map(d=>({...d,accepted:d.accepted?.source})),moduleContracts,functionContracts,versionFiles,allowedHelperAdditions])),scope:'local implementation impact; not native-semantic evidence or acceptance mutation',changes:events,
  contracts:[...active].map(([id,reasons])=>({id,reasons,consumers:byId.get(id).consumers})),checks:ordered,unregisteredTests:[...unregistered].sort(),
  acceptanceNavigation:acceptanceMap.filter(row=>row.tests.some(p=>paths.has(p))).map(row=>({id:row.id,tests:row.tests.filter(p=>paths.has(p))})),
  totalRegistered:checks.length};
}
module.exports={definitions,moduleContracts,functionContracts,hash,splitFunctions,functionChanges,onlyProgramTickInsertion,changedDataKeys,changedDataSlices,selectImpact};
