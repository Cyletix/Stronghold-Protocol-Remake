'use strict';
// 保留原始编排，不把 preDelay/blockFragment/isSpPrepare 猜成线性时间轴。
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.join(__dirname,'..');
const source='data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json';
const sourceBytes=fs.readFileSync(path.join(root,source));
const activity=JSON.parse(sourceBytes),levelRoot='data/ArknightsGameData/zh_CN/gamedata/levels';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const levels={},seasons={},gaps=[];
function levelKey(ref){return String(ref).replace(/\\/g,'/').replace(/\.json$/i,'').toLowerCase();}
function loadLevel(ref){
  const key=levelKey(ref);if(Object.hasOwn(levels,key))return key;
  const file=levelRoot+'/'+key+'.json',absolute=path.resolve(root,file);
  if(!absolute.startsWith(path.resolve(root,levelRoot)+path.sep))throw Error('Invalid level reference: '+ref);
  if(!fs.existsSync(absolute)){levels[key]=null;gaps.push({kind:'missing-level',level:key,source:file});return key;}
  const bytes=fs.readFileSync(absolute),raw=JSON.parse(bytes);
  const actions=[];
  function collect(value,at){
    if(!value||typeof value!=='object')return;
    if(value.actionType)actions.push({at,...value});
    for(const [k,v]of Object.entries(value))if(v&&typeof v==='object')collect(v,at+'.'+k);
  }
  collect(raw.waves,'waves');collect(raw.branches,'branches');
  const knownEnemies=new Set((raw.enemyDbRefs||[]).map(e=>e.id));
  for(const e of raw.enemies||[])knownEnemies.add(e.Key||e.id||e.key);
  for(const a of actions.filter(a=>a.actionType==='SPAWN')){
    if(!knownEnemies.has(a.key))gaps.push({kind:'spawn-key-not-in-level-enemies',level:key,at:a.at,key:a.key});
    if(!Number.isInteger(a.routeIndex)||!raw.routes?.[a.routeIndex])gaps.push({
      kind:a.at.startsWith('branches.') && raw.extraRoutes?.[a.routeIndex] ? 'branch-route-namespace-unconfirmed' : 'unresolved-route',
      level:key,at:a.at,routeIndex:a.routeIndex,extraRouteCandidate:!!raw.extraRoutes?.[a.routeIndex]});
  }
  levels[key]={source:file,sourceSha256:hash(bytes),levelId:raw.levelId,mapId:raw.mapId,
    mapShape:raw.mapData?.map?{rows:raw.mapData.map.length,cols:raw.mapData.map[0]?.length||0}:null,
    ...Object.fromEntries(['options','mapData','routes','extraRoutes','waves','branches','enemyDbRefs','enemies','runes','optionalRunes','globalBuffs','predefines','hardPredefines','randomSeed','operaConfig'].map(k=>[k,raw[k]??null])),
    summary:{routeCount:raw.routes?.length||0,waveCount:raw.waves?.length||0,spawnActions:actions.filter(a=>a.actionType==='SPAWN').length,
      declaredSpawnCount:actions.filter(a=>a.actionType==='SPAWN').reduce((n,a)=>n+(a.count||0),0),actionTypes:[...new Set(actions.map(a=>a.actionType))].sort(),
      conditionalActions:actions.filter(a=>a.randomSpawnGroupKey||a.randomSpawnGroupPackKey||(a.randomType&&a.randomType!=='ALWAYS')||a.blockFragment).length}};
  return key;
}
for(const [seasonId,season]of Object.entries(activity.activity.AUTOCHESS_SEASON)){
  const modes={};
  for(const [modeId,byRound]of Object.entries(season.battleDataDict||{})){
    const rounds=Object.entries(byRound).sort((a,b)=>Number(a[0])-Number(b[0])).map(([round,choices])=>({round:Number(round),alternatives:choices.map(c=>({...c,levelKey:loadLevel(c.levelId)}))}));
    const stageChoices=Object.values(season.stageDatasDict||{}).filter(s=>s.mode.includes(modeId)).map(s=>{
      const activityId=s.stageId.replace(/_.*$/,'');
      return {...s,levelKey:loadLevel('activities/'+activityId+'/level_'+s.stageId)};
    });
    modes[modeId]={rounds,stageChoices};
  }
  seasons[seasonId]={modes};
}
const output={schemaVersion:1,source,sourceSha256:hash(sourceBytes),seasons,levels,gaps};
let report='# 轮次配置关联报告（自动生成）\n\n来源：`'+source+'`；SHA256：`'+output.sourceSha256+'`。运行 `node tools/build_mode_rounds.js` 更新，`--check` 检查漂移。\n\n';
report+='| 赛季 | 模式 | 配置轮数 | 领袖候选所在轮 | isSpPrepare 所在轮 | 地图候选数 |\n|---|---|---:|---|---|---:|\n';
for(const [seasonId,s]of Object.entries(seasons))for(const [modeId,m]of Object.entries(s.modes))report+='| '+[seasonId,modeId,m.rounds.length,m.rounds.filter(r=>r.alternatives.some(a=>a.bossId)).map(r=>r.round).join(',')||'无',m.rounds.filter(r=>r.alternatives.some(a=>a.isSpPrepare)).map(r=>r.round).join(',')||'无',m.stageChoices.length].join(' | ')+' |\n';
const present=Object.values(levels).filter(Boolean);
report+='\n唯一关卡引用 '+Object.keys(levels).length+' 个，已找到 '+present.length+' 个；其中含waves的关卡 '+present.filter(l=>l.waves?.length).length+' 个。引用检查发现 '+gaps.length+' 项。完整原始路线、波次、敌人覆盖、runes与阶段引用在 `web/mode_rounds.json`。\n\n';
report+='声明生成数量是SPAWN动作count相加，含条件/分支时不能当实际敌人数。保留多个boss候选；保留isSpPrepare，不解释成弹窗时机；act2引用act1关卡不作为缺失。build_source_battles继续生成运行期敌人覆盖、地图及波次，卫戍协议对局已消费主波次；动态分支、随机组合及boss坐标映射仍有明确差异。\n\n';
report+='| 缺口类型 | 数量 |\n|---|---:|\n';
const counts={};for(const g of gaps)counts[g.kind]=(counts[g.kind]||0)+1;
for(const [kind,n]of Object.entries(counts))report+='| '+kind+' | '+n+' |\n';
if(!gaps.length)report+='| 无缺失引用 | 0 |\n';
report+='\n后续消费与优先级见 [推进计划](../plan.md)，字段缺口见 [数据问题表](../research/data-inventory.md#priority)。本报告只记录源配置与引用完整性，不证明调度语义已复刻。\n';
const artifacts={'web/mode_rounds.json':JSON.stringify(output,null,2)+'\n','docs/generated/round-data-report.md':report};
let failed=false;
for(const [file,body]of Object.entries(artifacts)){
  const target=path.join(root,file);
  if(process.argv.includes('--check')){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==body){console.error('STALE '+file);failed=true;}}
  else {fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,body);}
}
console.log('ROUNDS '+Object.keys(seasons).length+' seasons; '+Object.values(seasons).reduce((n,s)=>n+Object.keys(s.modes).length,0)+' modes; '+present.length+'/'+Object.keys(levels).length+' level files; '+gaps.length+' reference gaps');
if(failed)process.exitCode=1;
