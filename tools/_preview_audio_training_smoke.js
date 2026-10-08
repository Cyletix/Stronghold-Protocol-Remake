'use strict';
const assert=require('node:assert/strict'),f=require('./_browser_fixture')();f.ctx.assert=assert;
(async()=>{
 await f.run('initMode()');
 f.run(`
 applyPreset(4);
 for(const e of ROSTER_LIST){const a=getOpAccount(e.charId);assert.equal(a.evolve,LEVEL_DATA[e.charId].length-1);assert.equal(a.level,1);assert.equal(a.skillLevel,maxSkillLevel(a.evolve));}
 const low=Object.keys(LEVEL_DATA).find(k=>LEVEL_DATA[k].length===1),mid=Object.keys(LEVEL_DATA).find(k=>LEVEL_DATA[k].length===2);
 for(const id of [low,mid].filter(Boolean)){const a=normalizeOpAccount(id,{evolve:2,level:999,skillLevel:10});assert.equal(a.evolve,LEVEL_DATA[id].length-1);assert.equal(a.level,LEVEL_DATA[id].at(-1).maxLevel);assert.equal(a.skillLevel,maxSkillLevel(a.evolve));}
 const id=ROSTER_LIST.find(e=>LEVEL_DATA[e.charId].length===3).charId;detailCharId=id;
 const span={textContent:''},slider={parentElement:{querySelector:()=>span},value:'8'};
 for(const n of [8,9,10]){setDetailField('skillLevel',String(n),slider);assert.equal(span.textContent,'专精'+(n-7));}
 setDetailField('level',999,slider);assert.equal(getOpAccount(id).level,LEVEL_DATA[id][2].maxLevel);
 chooseBand('band_amiya');let maps=0,types=0,actions=0;
 const state=ArkSim.snapshot().state;
 for(const source of Object.values(SOURCE_BATTLES.levels)){
   G.sourceLevelKey=source.key||Object.keys(SOURCE_BATTLES.levels).find(k=>SOURCE_BATTLES.levels[k]===source);G.bountyRounds=0;G.decisionBounties=[];
   const declared=battleSourceForRun().waves.flatMap(w=>w.fragments.flatMap(fr=>fr.actions.filter(a=>a.actionType==='SPAWN').flatMap(a=>Array.from({length:a.count},()=>({enemyId:a.key})))));
   assert.deepEqual(previewCurrentWave().map(e=>e.enemyId),declared.map(e=>e.enemyId),'source enemy types and counts');actions+=declared.length;
   const sec=modeBattleSections(source.level)[0];if(!sec)continue;
   const layout=ArkEnemyPreview.layout(source.level,sec,declared,'stable');
   assert.deepEqual(layout,ArkEnemyPreview.layout(source.level,sec,declared,'stable'));
   if(!layout.bounds)continue;maps++;
   assert.equal(layout.positions.length,new Set(declared.map(e=>e.enemyId)).size);
   for(const p of layout.positions){types++;const row=Math.round(p.r),col=Math.round(p.c);assert.ok(['tile_floor','tile_road','tile_acfloor','tile_acroad'].includes(source.level.grid[row][col]));assert.ok(Math.abs(p.r-row)+p.radius<.5&&Math.abs(p.c-col)+p.radius<.5);assert.ok(Math.abs(p.r-row)>.0001||Math.abs(p.c-col)>.0001);}
 }
 assert.equal(ArkSim.snapshot().state,state,'preview must not change game RNG');
 console.log('PREVIEW/TRAINING OK',maps,'source maps;',types,'contained scattered type icons;',actions,'declared spawns; actual caps; mastery labels');
 `);
 // Use real loaded cue names and stub media only, without audible output.
 const played=[];f.ctx.Audio=function(url){this.url=url;this.paused=true;this.play=()=>{played.push({url:this.url,volume:this.volume,muted:this.muted});this.paused=false;return Promise.resolve();};this.pause=()=>{this.paused=true;};this.cloneNode=()=>new f.ctx.Audio(url);};
 f.run(`loadSfx();window.gameSfxPreference={muted:true,volume:.3};playSfx('b_char_set');`);assert.equal(played.length,0);
 f.run(`window.gameSfxPreference.muted=false;playSfx('b_char_set');playSfx('b_char_set');`);assert.equal(played.length,1);assert.equal(played[0].volume,.3);
 f.run(`toggleGameSfx();setGameSfxVolume(.2);`);assert.equal(JSON.parse(f.storage.get('arknightsAudioV1')).effectsMuted,true);assert.equal(JSON.parse(f.storage.get('arknightsAudioV1')).effectsVolume,.2);
 const next=require('./_browser_fixture')();next.storage.set('arknightsAudioV1',f.storage.get('arknightsAudioV1'));await next.run('initMode()');assert.equal(next.ctx.gameSfxPreference.muted,true);assert.equal(next.ctx.gameSfxPreference.volume,.2);
 f.run(`
 const cues=[];playSfx=name=>cues.push(name);chooseBand('band_amiya');window.onBattleEnd=()=>{};window.onLeak=()=>{};
 startBattle([{id:1,charId:'char_002_amiya',col:3,row:3,position:'MELEE',maxHp:3000,atk:0,def:0,attackTime:100,blockCnt:0,range:1}], [{at:999,enemyId:'unused',route:0}],100);
 const op=B.operators[0];op.skill=null;op.events=[];op.cd=999;update(1.01,0.505);assert.ok(cues.includes('b_char_set'));
 const afterDeploy=cues.length;update(.1,.05);assert.equal(cues.length,afterDeploy);
 op.skill={spCost:10,spType:'INCREASE_WITH_TIME',duration:2,name:'QA',effects:[]};op.sp=9;assert.equal(castSkill(op),false);assert.equal(cues.length,afterDeploy);
 op.sp=10;assert.equal(castSkill(op),true);assert.equal(cues.at(-1),'b_char_atkboost');
 leak({lifePointReduce:1});assert.equal(cues.at(-1),'b_ui_dooralarm');assert.equal(B.audioEvents.length,3);
 const snapshot=JSON.parse(JSON.stringify(B)),before=cues.length;consumeBattleAudio(snapshot,'qa');assert.equal(cues.length,before);
 snapshot.time+=.1;snapshot.audioSequence++;snapshot.audioEvents.push({id:snapshot.audioSequence,at:snapshot.time,name:'b_ui_dooralarm'});consumeBattleAudio(snapshot,'qa');consumeBattleAudio(snapshot,'qa');assert.equal(cues.length,before+1);
 consumeBattleAudio(snapshot,'other-view');assert.equal(cues.length,before+1);
 snapshot.time+=9;snapshot.audioSequence++;snapshot.audioEvents.push({id:snapshot.audioSequence,at:1,name:'b_char_set'});consumeBattleAudio(snapshot,'qa');assert.equal(cues.length,before+1,'reconnect does not play stale events');
 console.log('SFX OK deployment/leak/accepted skill, volume/mute persistence, rate limiting, snapshot cursors and stale-event suppression');
 `);
})().catch(e=>{console.error(e);process.exitCode=1;});

