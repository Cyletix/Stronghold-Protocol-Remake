'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {enemyVariant}=require('./lib/source-battle');
const root=path.join(__dirname,'..'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const db=new Map([['test',[{level:0,enemyData:{attributes:{maxHp:{m_defined:true,m_value:100},def:{m_defined:true,m_value:20}}}},{level:1,enemyData:{attributes:{maxHp:{m_defined:false,m_value:0},def:{m_defined:true,m_value:30}}}}]]]);
assert.deepEqual(enemyVariant({id:'test',level:1,useDb:true,overwrittenData:{attributes:{def:{m_defined:true,m_value:0}}}},db,{}).sourceAttributes,{maxHp:100,def:0});
const rounds=read('web/mode_rounds.json'),runtime=read('web/source_battles.json');let refs=0;
for(const [key,raw]of Object.entries(rounds.levels)){
  const out=runtime.levels[key];assert.ok(out);assert.deepEqual(out.waves,raw.waves);
  for(const ref of raw.enemyDbRefs){assert.equal(out.enemies[ref.id].sourceLevel,ref.level);refs++;}
  for(const [i,route]of raw.routes.entries()){
    const built=out.level.routes[i],first=built.segs[0]?.[0];assert.deepEqual({r:first.r,c:first.c},{r:out.level.rows-1-route.startPosition.row,c:route.startPosition.col});
    assert.ok(built.segs.length);assert.equal(built.motion,route.motionMode);
  }
}
const first=runtime.levels['activities/act1autochess/level_act1autochess_01'];
assert.equal(first.enemies.enemy_1007_slime.maxHp>0,true);assert.ok(!first.warnings.some(w=>w.includes('unreachable')));
console.log('SOURCE BATTLES OK',refs,'level enemy refs; defined-zero overrides; source routes, waves and start positions preserved');
