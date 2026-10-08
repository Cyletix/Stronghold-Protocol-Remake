'use strict';
// Read-only, isolated audit against current source; no live rooms or profiles.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..');
const f=require(path.join(root,'tools/_browser_fixture'))();
async function main(){
 const mechanics=await f.run(`(async()=>{
  await initMode();chooseBand('band_amiya');startBattleRound();
  const outcomes=[];
  for(const cid of ['char_181_flower','char_108_silent']){
   const entry=ROSTER[cid],stats=finalizeOperator(entry,null,[],false);
   B.over=false;B.time=0;B.roundTime=0;B.waveScheduler=null;B.spawn=[];B.projectiles=[];B.particles=[];B.summoneds=[];
   const medic={...stats,id:1,charId:cid,name:entry.name,position:entry.position,profession:entry.profession,row:3,col:0,cells:[[3,1],[3,2]],cd:0,hp:stats.maxHp,events:[],skill:null,deployed:true};
   const ally={id:2,charId:'controlled-ally',row:3,col:1,hp:100,maxHp:1000,cd:100,stunUntil:100,dead:false};
   B.operators=[medic,ally];
   B.enemies=[{id:3,x:1,y:3,hp:10000,maxHp:10000,def:100,magicRes:0,stunUntil:100,dead:false}];
   update(0,0);
   outcomes.push({name:entry.name,friendHpBefore:100,friendHpAfter:ally.hp,enemyProjectiles:B.projectiles.filter(p=>p.target===B.enemies[0]).length});
  }
  const skill=ROSTER.char_181_flower.skill.normal,enemy=B.enemies[0];
  const medic=B.operators[0];medic.buffs=[];
  for(const effect of skill.effects)applyEffect(medic,effect,[enemy],[medic]);
  return {medical:outcomes,flowerSkill:{name:skill.name,sourceAttackSpeed:skill.blackboard.attack_speed,effects:skill.effects,enemyDefenseBefore:100,enemyDefenseAfter:enemyDef(enemy),selfAttackSpeedMultiplier:buffMul(medic).aspd},roster:ROSTER_LIST.length,medicCount:ROSTER_LIST.filter(o=>o.profession==='MEDIC').length};
 })()`);
 const filename=path.join(root,'tools/lib/room-game-runtime.js'),src=fs.readFileSync(filename,'utf8');
 const marker='return Object.freeze({fingerprint,config:';
 if(src.split(marker).length!==2)throw Error('Runtime audit injection point changed');
 const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(src.replace(marker,'return Object.freeze({__auditMachine:machine,fingerprint,config:'),filename);
 const api=injected.exports,config={...api.defaultRoomSettings(),bandId:'band_amiya'};
 const p=await api.createPlayerRuntime(config,{seed:111,name:'本地审计'});
 try{
  p.__auditMachine.run(`{
   G.ops=[];
   const used=new Set();
   for(const entry of ROSTER_LIST){
    const cell=roomDeploymentCells().find(c=>!used.has(c.row+','+c.col)&&isDeployable(c.row,c.col,entry));
    if(!cell)continue;
    addOperator(entry.charId,false);const op=G.ops.at(-1);Object.assign(op,cell,{dir:'right'});used.add(cell.row+','+cell.col);
    if(G.ops.length===8)break;
   }
   G._mergeReward=null;refreshBoard();
  }`);
  const sizes=[],measure=label=>{
   const start=performance.now(),{auth,checkpoint,...state}=p.snapshot();
   const snapshotMs=performance.now()-start,plain=Buffer.from(JSON.stringify(state)),gzip=zlib.gzipSync(plain,{level:1});
   sizes.push({label,plain:plain.length,gzip:gzip.length,snapshotMs:+snapshotMs.toFixed(2),ops:state.session.ops.length,enemies:state.battle?.enemies?.length,byField:Object.fromEntries(Object.entries(state).map(([k,v])=>[k,Buffer.byteLength(JSON.stringify(v))]))});
  };
  measure('8 operators preparation');p.startBattle();
  for(let i=0;i<20;i++){p.advance(.1);measure('battle '+((i+1)/10).toFixed(1));}
  const mean=a=>Math.round(a.reduce((s,x)=>s+x,0)/a.length),battle=sizes.slice(1);
  const report={date:new Date().toISOString(),mechanics,network:{config,samples:sizes,meanGzipBytes:mean(battle.map(s=>s.gzip)),upperAt10HzMbps:+(mean(battle.map(s=>s.gzip))*10*8/1e6).toFixed(3)}};
  const output=path.join(root,'.runtime/playability-audit.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));
  console.log(JSON.stringify({mechanics,network:{config,first:sizes[0],battleLast:sizes.at(-1),meanGzipBytes:report.network.meanGzipBytes,upperAt10HzMbps:report.network.upperAt10HzMbps},output},null,2));
 }finally{p.dispose();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
