'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const rows=JSON.parse(fs.readFileSync('work/funnel-checklist-reopened.json','utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const gd='data/ArknightsGameData/zh_CN/gamedata/';
const sourceFiles=['excel/character_table.json','excel/skill_table.json','excel/range_table.json','excel/activity_table.json','excel/battle_equip_table.json','levels/enemydata/enemy_database.json','excel/enemy_handbook_table.json'].map(p=>gd+p);
const inferred={
 'op/char_108_silent/talent/1/source-aura':['_medic_aura_smoke.js','docs/mechanics/basic-actions.md:134'],
 'op/char_108_silent/module/attack-speed':['_medic_aura_smoke.js','docs/mechanics/basic-actions.md:134'],
 'op/char_108_silent/skill/skchr_silent_2/source-body':['_medic_drone_smoke.js','docs/mechanics/basic-actions.md:126'],
 'op/char_108_silent/token/token_10000_silent_healrb/source-body':['_medic_drone_smoke.js','docs/mechanics/basic-actions.md:126'],
 'op/char_128_plosis/module/source-body':['_medic_module_sp_smoke.js','docs/mechanics/basic-actions.md:126'],
 'op/char_171_bldsk/module/source-body':['_medic_module_sp_smoke.js','docs/mechanics/basic-actions.md:126'],
 'op/char_344_beewax/skill/skchr_beewax_1/source-body':['_beeswax_smoke.js','docs/mechanics/operator-mechanics.md:100'],
 'op/char_344_beewax/talent/1/idle-recovery':['_beeswax_smoke.js','docs/mechanics/operator-mechanics.md:100'],
 'op/char_344_beewax/token/token_10011_beewax_oblisk/lifecycle':['_beeswax_smoke.js','docs/mechanics/operator-mechanics.md:100']
};
const command=n=>'node tools/'+n+(n.startsWith('build_')?' --check':'');
const sourceHashes=Object.fromEntries(sourceFiles.map(p=>[p,hash(p)]));
const registration=require('../tools/check_game').checks.map(([,a])=>a[0]);
const result=rows.map(r=>{
 const existing=[...new Set([...r.notes.join('\n').matchAll(/(?:tools\/)?((?:_[a-z0-9_]+_smoke|build_[a-z0-9_]+)\.js)/g)].map(m=>m[1]))];
 const inferredCase=inferred[r.id];
 const kind=r.id.includes('/fixed/')?'fixed-config':r.id.includes('/skill/skcom_')?'common-skill-body':r.id.startsWith('enemy/')?'enemy-cold-body':r.id.startsWith('batch/')?'source-level-data':'bounded-operator-body';
 const funnel=/char_(328_cammou|377_gdglow|4040_rockr)\//.test(r.id);
 const primary=kind==='fixed-config'?['_season_roster_smoke.js','_room_game_runtime_smoke.js']:kind==='common-skill-body'?['_common_expansion_smoke.js',...existing.filter(n=>n==='_common_buff_skills_smoke.js'||n==='_common_cost_skills_smoke.js')]:kind==='source-level-data'?['build_operator_skill_levels.js','_operator_skill_levels_smoke.js']:inferredCase?[inferredCase[0]]:existing.filter(n=>n.startsWith('_'));
 const integration=kind==='enemy-cold-body'?['_enemy_runtime_smoke.js','_enemy_replacement_smoke.js','_enemy_plan_source_smoke.js']:funnel?['_funnel_smoke.js','_click_smoke.js']:[];
 const missing=[...primary,...integration].filter(n=>!fs.existsSync('tools/'+n)||!registration.includes('tools/'+n));
 return {...r,kind,impact:funnel?'funnel-owner-related':kind==='enemy-cold-body'?'enemy-spawn-related':'shared-hash-only',existingCommands:existing.map(command),inferredCommand:inferredCase?{command:command(inferredCase[0]),evidence:inferredCase[1],review:'Read current test assertions; matches original scoped record, but original note omitted its filename.'}:null,
  requiredCommands:[...new Set([...primary,...integration])].map(command),missing,
  sourceFiles:kind==='enemy-cold-body'?sourceFiles.slice(-2):kind==='fixed-config'?sourceFiles.slice(0,5):sourceFiles.slice(0,3).concat(kind==='bounded-operator-body'?[gd+'excel/battle_equip_table.json']:[]),
  recommendation:missing.length||!primary.length?'keep-open-insufficient-evidence':funnel?'conditional-scoped-restoration-after-funnel-and-original-tests':kind==='enemy-cold-body'?'conditional-only-cold-ability-restoration-after-old-and-spawn-tests':'conditional-previous-scope-continuation-after-mapped-tests',
  rationale:kind==='fixed-config'?'207 source slots are enumerated by the existing actual shop/config test; enemy seed/run plan additions do not alter source roster/skill/module values. Never extends to execution completeness.':kind==='common-skill-body'?'Existing all-level common test enumerates source skill links and isolates talent/garrison effects; child changed only ID-gated funnel modes/talents and Goldenglow RES path.':kind==='enemy-cold-body'?'Cold ability/blackboard sources and executor were not edited. New template spawning can select these enemies and apply attributes, so new spawn integration must also pass; no claim of completed waves/templates.':funnel?'Only prior fixed configuration or common S1 body was checked; complex S2/S3/funnel talent changes are separately covered by the seven new limited items.':'Original scoped rule/source data did not change this turn; shared engine/operator-combat/save/run-setup hashes changed. Existing specific test is required; integrated success alone is insufficient.'};
});
const report={status:'recommendation-only; no old checkbox restored; await root check_game results',sourceEvidence:'Root confirmed existing CN operator/module sources were not edited. Source hashes below freeze the current source used by the existing source-comparison tests; they do not claim a reconstructed historical hash baseline.',sourceHashes,summary:result.reduce((s,r)=>{s[r.impact]=(s[r.impact]||0)+1;return s;},{}),missing:result.filter(r=>r.missing.length||!r.requiredCommands.length).map(r=>r.id),items:result};
fs.writeFileSync('work/funnel-checklist-continuation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({summary:report.summary,missing:report.missing,inferred:result.filter(r=>r.inferredCommand).length,commands:[...new Set(result.flatMap(r=>r.requiredCommands))]}));
