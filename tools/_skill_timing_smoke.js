'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.join(__dirname,'..'),web=path.join(root,'web');
const json=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const source=json('data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const ranges=json('data/ArknightsGameData/zh_CN/gamedata/excel/range_table.json');
const data=json('web/skill_data.json');let variants=0;
for(const skill of Object.values(data)) for(const [variant,index] of [['normal',3],['elite',6]]) {
  const actual=skill[variant],raw=source[skill.skillId].levels[index];
  if(!actual)continue;
  for(const key of ['spCost','initSp'])assert.equal(actual[key],raw.spData[key]);
  assert.equal(actual.spType,raw.spData.spType);assert.equal(actual.spIncrement,raw.spData.increment);
  assert.equal(actual.duration,raw.duration);assert.equal(actual.durationType,raw.durationType);
  assert.deepEqual(actual.rangeGrids,raw.rangeId?ranges[raw.rangeId].grids:null);
  variants++;
}
const noop=()=>{},elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',style:{},classList:{add:noop,remove:noop,contains:()=>false,toggle:noop},addEventListener:noop,getContext:()=>new Proxy({},{get:()=>noop}),getBoundingClientRect:()=>({left:0,top:0,right:1400,bottom:900})});return elements.get(id);}
const ctx={console,assert,innerWidth:1400,innerHeight:900,requestAnimationFrame:()=>0,addEventListener:noop,setTimeout:()=>0,clearTimeout:noop,
  document:{getElementById:el,addEventListener:noop},Image:function(){this.complete=false;},fetch:async url=>({json:async()=>json('web/'+url)})};
ctx.localStorage={getItem:()=>null,setItem:()=>{}};ctx.window=ctx;vm.createContext(ctx);
for(const f of ['src/rules/diy-roster.js','src/simulation/enemy-replacement.js','src/rules/run-setup.js','src/domain/game-state.js','src/rules/session-commands.js','src/simulation/attributes.js','engine.js','mode.js'])vm.runInContext(fs.readFileSync(path.join(web,f),'utf8'),ctx);
vm.runInContext(`(async()=>{
  await initMode(); GMODE='auto'; let cases=0;
  for(const entry of ROSTER_LIST) for(const elite of [false,true]) {
    const raw=SKILL_DATA[entry.charId][elite?'elite':'normal'];
    const skill=finalizeOperator(entry,null,[],elite).skill;
    assert.equal(skill.spCost,raw.spCost);assert.equal(skill.initSp,raw.initSp);assert.equal(skill.duration,raw.duration);
    assert.equal(skill.realDesc,raw.desc);assert.equal(JSON.stringify(skill.rangeGrids),JSON.stringify(raw.rangeGrids)); cases++;
  }
  let casts=0;window.onSkillDp=()=>casts++;
  function setup(changes={}) {
    const skill={name:'test',spType:'INCREASE_WITH_TIME',spCost:50,initSp:49,duration:25,spIncrement:1,maxCharge:1,effects:[{type:'dp_gain',power:1}],...changes};
    startBattle([{id:'test',name:'test',maxHp:1000,atk:100,def:100,hp:1000,attackTime:1,range:1,col:2,row:2,dir:'right',position:'MELEE',rangeGrids:[{row:0,col:1}],skill}], [{at:9999,enemyId:Object.keys(BDATA.enemies)[0],route:0}],100);
    return B.operators[0];
  }
  let o=setup();update(0.5,0.5);assert.equal(casts,0);update(0.5,0.5);assert.equal(casts,1);assert.equal(o.sp,0);
  update(20,20);assert.equal(o.sp,0);assert.equal(casts,1);assert.ok(o.skillState,'duration is not truncated at 15');
  update(5.5,5.5);assert.equal(o.skillState,null);assert.equal(o.sp,0.5,'only unlocked part of boundary frame charges');
  o=setup({duration:0,spCost:3,initSp:0,spType:'INCREASE_WHEN_ATTACK'});update(5,5);assert.equal(o.sp,0);
  gainOperatorSp(o,'INCREASE_WHEN_TAKEN_DAMAGE',1);assert.equal(o.sp,0);
  gainOperatorSp(o,'INCREASE_WHEN_ATTACK',1);assert.equal(o.sp,1);
  // 实际普攻调用攻击回复，不只测试辅助函数。
  const enemy={x:3,y:2,hp:10000,maxHp:10000,def:0,magicRes:0,attackTime:99,rangeRadius:-1,moveSpeed:0,route:0,seg:0,cp:0,wait:999,cd:99};
  B.enemies.push(enemy);o.blockCnt=0;update(0.1,0.1);assert.equal(o.sp,2);
  o=setup({spType:'INCREASE_WHEN_TAKEN_DAMAGE',spCost:3,initSp:0,duration:0});update(2,2);assert.equal(o.sp,0);
  // 敌方弹道命中才受击回复；DOT和自己攻击不作为受击事件。
  B.projectiles.push({x:2,y:2,tx:2,ty:2,target:o,owner:{atk:1},enemy:true,dmg:1,speed:1,life:6});update(0.1,0.1);assert.equal(o.sp,1);
  o=setup({spCost:1,initSp:1,duration:20,rangeGrids:[{row:0,col:2}],effects:[{type:'aoe_damage',power:1},{type:'buff_range',power:9}]});
  const base=JSON.stringify(o.cells);const near={x:3,y:2,hp:1000,maxHp:1000,def:0,magicRes:0},far={x:4,y:2,hp:1000,maxHp:1000,def:0,magicRes:0};B.enemies=[near,far];
  assert.equal(castSkill(o),true);assert.equal(near.hp,1000);assert.ok(far.hp<1000);assert.equal(o.cells[0][1],4);
  assert.equal(castSkill(o),false,'active skill cannot overlap');endOperatorSkill(o);assert.equal(JSON.stringify(o.cells),base);
  o=setup({spCost:1,initSp:1,duration:20,effects:[{type:'buff_maxhp',power:0.5},{type:'dodge',power:1},{type:'buff_atk',power:10,flat:true}]});
  castSkill(o);assert.equal(o.maxHp,1500);assert.equal(operatorDodge(o),1);assert.equal(o.atk,110);
  updateOperatorBaseStats(o,{...o,maxHp:1200,atk:200,def:100,range:1});
  assert.equal(o.maxHp,1700);assert.equal(o.atk,210);tryKill(o);
  assert.equal(o.maxHp,1200);assert.equal(o.atk,200);assert.equal(operatorDodge(o),0);assert.equal(o.skillState,null);
  o=setup({spCost:1,initSp:1,duration:-1,effects:[{type:'buff_atk',power:1}]});castSkill(o);update(30,30);assert.ok(o.skillState);assert.equal(o.sp,0);assert.equal(buffMul(o).atk,2);
  o=setup({isPassive:true,spCost:0,initSp:0});update(2,2);assert.equal(o.sp,0);assert.equal(castSkill(o),false);
  o=setup({spCost:3,initSp:0,maxCharge:2,duration:0,effects:[{type:'aoe_damage',power:1}]});update(10,10);assert.equal(o.sp,6,'no target holds bounded charges');assert.equal(o.skillState,undefined);
  B.enemies=[{x:3,y:2,hp:1000,maxHp:1000,def:0,magicRes:0}];castSkill(o);assert.equal(o.sp,3,'one cast spends one charge');
  const ranged=ROSTER_LIST.find(e=>e.skill.normal.rangeGrids && !e.skill.normal.isPassive);
  assert.ok(ranged);const model=buildOperatorDetailModel(ranged,{elite:false,equip:[]},false);
  const html=opDetailTabBody(model.e,model.o,{},false,'skill',model.range,model.skill,model.talents);
  assert.ok(html.includes('技能范围'));assert.ok(html.includes('自动施放'));assert.ok(html.includes(String(model.skill.spCost)));
  console.log('SKILL TIMING OK',cases,'mode variants; source timing; recovery events; SP lock; range lifecycle; death; infinite/passive/charges');
})()`,ctx).catch(e=>{console.error(e);process.exitCode=1;});
console.log('SOURCE SKILL VARIANTS',variants);
