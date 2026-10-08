'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm'), assert=require('assert/strict');
const root=path.join(__dirname,'..'), web=path.join(root,'web');
const source=JSON.parse(fs.readFileSync(path.join(root,'data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json'),'utf8'));
const rules=JSON.parse(fs.readFileSync(path.join(web,'mode_rules.json'),'utf8'));
assert.equal(require('crypto').createHash('sha256').update(fs.readFileSync(path.join(root,rules.source))).digest('hex'),rules.sourceSha256,'mode_rules source snapshot is current');
const elements=new Map();
const noop=()=>{};
function el(id) {
  if(!elements.has(id)) elements.set(id,{innerHTML:'',textContent:'',style:{},classList:{add:noop,remove:noop,contains:()=>false,toggle:noop},
    addEventListener:noop,getContext:()=>new Proxy({}, {get:()=>noop}),getBoundingClientRect:()=>({left:0,top:0,right:1400,bottom:900})});
  return elements.get(id);
}
const ctx={console,assert,source,innerWidth:1400,innerHeight:900,requestAnimationFrame:()=>0,addEventListener:noop,setTimeout:()=>0,clearTimeout:noop,
  document:{getElementById:el,addEventListener:noop},Image:function(){this.complete=false;},
  fetch:async url=>({json:async()=>JSON.parse(fs.readFileSync(path.join(web,String(url)),'utf8'))})};
ctx.localStorage={getItem:()=>null,setItem:()=>{}};ctx.window=ctx;vm.createContext(ctx);
for(const f of ['src/rules/diy-roster.js','src/simulation/enemy-replacement.js','src/rules/run-setup.js','src/domain/game-state.js','src/rules/session-commands.js','src/simulation/attributes.js','engine.js','mode.js']) vm.runInContext(fs.readFileSync(path.join(web,f),'utf8'),ctx);
vm.runInContext(`(async()=>{
  await initMode(); GMODE='auto'; let cases=0;
  for(const entry of ROSTER_LIST) {
    const clean={...entry,talents:[],module:null};
    ACCOUNT.ops[entry.charId]={evolve:0,level:1,skillLevel:1,potential:0};
    for(const elite of [false,true]) {
      const profile=trainingProfile(entry,elite), phase=source[entry.charId].phases[profile.evolve];
      assert.equal(profile.evolve,elite?2:(entry.tier<=2?1:2),'fixed training phase');
      assert.equal(profile.level,(elite?[0,50,55,60,60,60,60]:[0,55,60,1,1,1,1])[entry.tier],'fixed training level');
      assert.equal(profile.skillLevel,elite?7:4,'fixed training skill level');
      const frames=phase.attributesKeyFrames, lo=frames[0], hi=frames[frames.length-1];
      const blend=(profile.level-lo.level)/(hi.level-lo.level||1);
      const stats=finalizeOperator(clean,null,[],elite);
      for(const key of ['maxHp','atk','def']) {
        const expected=Math.round(lo.data[key]+(hi.data[key]-lo.data[key])*blend);
        assert.equal(stats[key],expected,entry.name+' '+elite+' '+key);
      }
      const range0=JSON.stringify(entryRangeGrids(entry,elite));
      const talents0=JSON.stringify(activeTalents(entry,elite));
      const skill0=JSON.stringify(stats.skill);
      ACCOUNT.ops[entry.charId]={evolve:2,level:90,skillLevel:10,potential:6};
      assert.equal(JSON.stringify(entryRangeGrids(entry,elite)),range0);
      assert.equal(JSON.stringify(activeTalents(entry,elite)),talents0);
      assert.equal(JSON.stringify(finalizeOperator(clean,null,[],elite).skill),skill0);
      const detail=buildOperatorDetailModel(entry,{elite,equip:[]},false);
      assert.equal(detail.phaseCn,['精0','精一','精二'][profile.evolve]); assert.equal(detail.trainLv,profile.level); assert.equal(detail.trainSkill,profile.skillLevel);
      ACCOUNT.ops[entry.charId]={evolve:0,level:1,skillLevel:1,potential:0};
      cases++;
    }
  }
  const entry=ROSTER['char_4100_caper'];
  for(const [evolve,level,atk,def,hp] of [[0,1,1,1,1],[1,1,1.05,1.05,1],[2,1,1.1,1.05,1.05],[2,60,1.1,1.1,1.1]]) {
    ACCOUNT.ops[entry.charId]={evolve,level}; const b=selfHoldMult(entry.charId);
    assert.equal(b.atk,atk);assert.equal(b.def,def);assert.equal(b.hp,hp);
  }
  const testEntry={...ROSTER_LIST.find(e=>e.tier===3),talents:[[{phase:2,level:60,potential:0,name:'level-gated',effects:[]}]]};
  assert.equal(activeTalents(testEntry,false).length,0);
  assert.equal(activeTalents(testEntry,true).length,1);
  GMODE='normal'; ACCOUNT.ops[entry.charId]={evolve:0,level:1,potential:0,skillLevel:1};
  const normalStats=finalizeOperator({...entry,talents:[],module:null},null,[],false);
  for(const key of ['maxHp','atk','def']) assert.equal(normalStats[key],source[entry.charId].phases[0].attributesKeyFrames[0].data[key]);
  const r0=JSON.stringify(entryRangeGrids(entry)); ACCOUNT.ops[entry.charId].evolve=2;
  assert.notEqual(JSON.stringify(entryRangeGrids(entry)),r0,'normal mode retains account range');
  console.log('TRAINING SMOKE OK',cases,'raw character-table comparisons; account isolation; UI parity; talent level gate; normal mode');
})()`,ctx).catch(e=>{console.error(e);process.exitCode=1;});
