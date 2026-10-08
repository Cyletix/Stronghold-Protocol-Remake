'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.join(__dirname,'..');
const load=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const d=load('web/mode_rounds.json'),src=load(d.source);
assert.equal(d.sourceSha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,d.source))).digest('hex'));
let choices=0;
for(const [sid,s]of Object.entries(src.activity.AUTOCHESS_SEASON))for(const [mid,rounds]of Object.entries(s.battleDataDict)){
  const model=d.seasons[sid].modes[mid];assert.equal(model.rounds.length,Object.keys(rounds).length);
  for(const [round,alternatives]of Object.entries(rounds)){
    const exported=model.rounds.find(r=>r.round===Number(round));
    assert.deepEqual(exported.alternatives.map(({levelKey,...rest})=>rest),alternatives);
    for(const item of exported.alternatives){assert.ok(d.levels[item.levelKey]);choices++;}
  }
  assert.deepEqual(model.stageChoices.map(({levelKey,...rest})=>rest),Object.values(s.stageDatasDict).filter(x=>x.mode.includes(mid)));
}
for(const l of Object.values(d.levels)){
  assert.ok(l);const original=load(l.source);
  assert.equal(l.sourceSha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,l.source))).digest('hex'));
  for(const k of ['mapData','routes','extraRoutes','waves','branches','enemyDbRefs','enemies','runes','optionalRunes','globalBuffs'])assert.deepEqual(l[k],original[k]??null,l.source+' '+k);
}
assert.equal(d.seasons.act2autochess.modes.mode_single_funny.rounds.length,9);
assert.equal(d.seasons.act2autochess.modes.mode_multi_funny.rounds.length,14);
assert.equal(d.seasons.act2autochess.modes.mode_single_normal.rounds.length,15);
for(const gap of d.gaps){assert.equal(gap.kind,'branch-route-namespace-unconfirmed');assert.equal(gap.extraRouteCandidate,true);}
console.log('MODE ROUNDS OK',choices,'round alternatives; 47 raw levels; hashes, maps, routes, branches and waves preserved; branch namespace gaps explicit');
