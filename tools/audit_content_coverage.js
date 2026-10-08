'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
async function main(){
 const activity=read('data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json'),chars=read('data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
 const source=read('web/source_battles.json'),encounters=read('web/enemy_encounters.json'),f=require('./_browser_fixture')();await f.run('initMode()');
 const roster=JSON.parse(f.run('JSON.stringify(ROSTER_LIST.map(o=>({charId:o.charId,name:o.name,tier:o.tier})))'));
 const templates=new Set(Object.entries(encounters.constants).filter(([k])=>k.startsWith('templateEnemy')).map(([,id])=>id));
 const allSpawns=Object.values(source.levels).flatMap(l=>l.waves.flatMap(w=>w.fragments.flatMap(fr=>fr.actions.filter(a=>a.actionType==='SPAWN'))));
 const rawIds=new Set(allSpawns.map(a=>a.key)),name=id=>chars[id]?.name||encounters.enemies[id]?.name||id;
 const report={sourceHashes:encounters.sourceHashes,rosterCount:roster.length,seasons:{},waves:{files:Object.keys(source.levels).length,actions:allSpawns.length,declaredEnemies:allSpawns.reduce((n,a)=>n+a.count,0),uniqueEnemyIds:rawIds.size,templateActions:allSpawns.filter(a=>templates.has(a.key)).length},templates:[...templates].map(id=>({id,name:name(id),actions:allSpawns.filter(a=>a.key===id).length}))};
 report.runtime={mode:'native-template-replacement',scope:'first wave / first fragment, six ground/air normal/elite/special templates',plan:'persisted per-run enemySeed and round plan shared by preview, battle, rest saves and room players',legacy:'compatible old rest saves without a plan retain legacy-source waves',unverified:['runtime token/extraEnemy insertion','original PRNG and concrete shuffle sequence','XLua hotfix and original server overrides']};
 let md='# 敌群与干员覆盖核对（自动生成）\n\n由 `node tools/audit_content_coverage.js` 重新核对，`--check` 检查漂移。读取本地源表与实际初始化的 ROSTER_LIST，不以头像文件数当作可用干员数。推进顺序见 [当前计划](../plan.md)，数据缺口见 [数据问题表](../research/data-inventory.md#priority)。\n\n';
 md+='## 敌群：六模板替换已接，静态引用单独统计\n\n运行状态为 `native-template-replacement`：新局按持久化 `enemySeed` 生成逐轮计划，首 wave / 首 fragment 的普通、精英、特殊地空六模板据此替换；无候选或空地不符的模板 SPAWN 移除，非模板和后续片段保留。预览、实际波次、休整恢复和房间玩家共用计划；兼容的无计划旧休整档沿用 `legacy-source`。原生依据、数量/间隔换算与范围见 [敌群原生取证](../research/enemy-replacement-native.md)。\n\n[Verified 源字段] `autoChessData.constData.specialEnemyNum='+encounters.constants.specialEnemyNum+'`；模板映射、特训主敌及其普通/精英随从、前后半、权重、模式禁用名单均见 `web/enemy_encounters.json`。`SPECIAL.involveRandom=false`，不能把七类任抽三类，也不能把全部敌人限制成三种单体。\n\n';
 md+='| 赛季 | 特训主敌配置 | 分类成员去重 | 已有运行期基础定义 | 模板主波次直接提到的成员 |\n|---|---:|---:|---:|---:|\n';
 for(const [sid,s]of Object.entries(activity.activity.AUTOCHESS_SEASON)){
   const roster=JSON.parse(f.run('JSON.stringify(seasonRoster('+JSON.stringify(sid)+').list.map(o=>({charId:o.charId,name:o.name,tier:o.tier})))'));
   const entries=Object.values(s.charShopChessDatas),rosterIds=new Set(roster.map(o=>o.charId));
   const expected=entries.filter(e=>['PRESET','NORMAL'].includes(e.chessType)&&!e.isHidden&&e.charId),expectedIds=new Set(expected.map(e=>e.charId));
   const missing=[...expectedIds].filter(id=>!rosterIds.has(id)).map(id=>({id,name:name(id)}));
   const tierMismatches=expected.filter(e=>rosterIds.has(e.charId)&&!roster.some(o=>o.charId===e.charId&&o.tier===e.chessLevel)).map(e=>({id:e.charId,name:name(e.charId),expected:e.chessLevel,current:roster.find(o=>o.charId===e.charId).tier}));
   const groupIds=[...new Set(Object.values(s.enemyInfoDict).flat())];
   const existing=JSON.parse(f.run('JSON.stringify(Object.keys(BATTLE.enemies))')),existingSet=new Set(existing);
   report.seasons[sid]={shopEntries:entries.length,visibleFixedEntries:expected.length,uniqueVisibleFixed:expectedIds.size,fixedCovered:expectedIds.size-missing.length,missing,tierMismatches,extraRoster:roster.filter(o=>!expectedIds.has(o.charId)),
     enemyGroups:Object.fromEntries(Object.entries(s.enemyInfoDict).map(([type,ids])=>[type,{members:ids.length,withoutRuntimeDefinition:ids.filter(id=>!existingSet.has(id)),notInTemplateWaves:ids.filter(id=>!rawIds.has(id))}])),specialEntries:Object.keys(s.specialEnemyInfoDict).length,enemyMembers:groupIds.length,runtimeEnemyDefinitions:groupIds.filter(id=>existingSet.has(id)).length,templateWaveMembers:groupIds.filter(id=>rawIds.has(id)).length};
   const summary=report.seasons[sid];md+='| '+[sid,summary.specialEntries,summary.enemyMembers,summary.runtimeEnemyDefinitions,summary.templateWaveMembers].join(' | ')+' |\n';
 }
 md+='\n表中“模板主波次直接提到的成员”与下方 SPAWN 数量均统计未经运行替换的静态源关卡，不统计某局最终敌人。运行端已经根据候选池、前后半和模式禁用执行替换；基础定义存在仍不代表每种敌人的特殊技能已完成。\n\n';
 md+='| 分类 | 初版成员数 | II成员数 | 参与开局类型随机 |\n|---|---:|---:|---|\n';
 for(const [type,info]of Object.entries(encounters.types))md+='| '+info.name+' | '+report.seasons.act1autochess.enemyGroups[type].members+' | '+report.seasons.act2autochess.enemyGroups[type].members+' | '+(info.involveRandom?'是':'否')+' |\n';
 md+='\n以上分类成员可能重叠，不能将各行相加当不同敌人总数。\n\n';
 md+='| 模板字段对应敌人 | 主波次动作数 |\n|---|---:|\n';for(const t of report.templates)md+='| '+t.id+'（'+t.name+'） | '+t.actions+' |\n';
 md+='\n静态源数据的 '+report.waves.files+' 份关卡包含 '+report.waves.actions+' 条主 SPAWN 动作、声明 '+report.waves.declaredEnemies+' 个敌人、'+report.waves.uniqueEnemyIds+' 个不同敌人 ID，其中 '+report.waves.templateActions+' 条动作用了上述模板。这些统计定义保持不变；运行替换会改变相关动作的敌人ID、数量与间隔，不把静态声明数量当作一局最终敌人数。`_enemy_replacement_smoke.js`、`_enemy_plan_source_smoke.js`、`_enemy_runtime_smoke.js`分别验证公式/替换、源计划和实际预览/波次/恢复；测试不能证明原版全部流程一致。\n\n';
 md+='## 干员：两季固定名册独立核对（默认 II '+roster.length+' 名）\n\n| 赛季 | 源商店条目（含非预设） | 非隐藏 PRESET/NORMAL 条目 | 去重固定干员 | 当前名册中存在 | 缺失 | 已存在但阶数不符条目 |\n|---|---:|---:|---:|---:|---:|---:|\n';
 for(const [sid,s]of Object.entries(report.seasons))md+='| '+[sid,s.shopEntries,s.visibleFixedEntries,s.uniqueVisibleFixed,s.fixedCovered,s.missing.length,s.tierMismatches.length].join(' | ')+' |\n';
 md+='\n这是按 charId 的身份核对；同一角色的特殊模板 tmplId、原型替补、DIY 自选槽、每赛季技能/模组/养成仍须分别检查。“存在”不能当作机制完成率。\n';
 for(const [sid,s]of Object.entries(report.seasons)){
  md+='\n### '+sid+' 缺失与阶数差异\n\n缺失固定名单：'+(s.missing.map(e=>e.name+'（'+e.id+'）').join('、')||'无')+'。\n\n';
  md+='阶数差异：'+(s.tierMismatches.map(e=>e.name+' '+e.current+'→源 '+e.expected).join('、')||'无')+'。\n\n';
  md+='本季普通招募名册中有 '+s.extraRoster.length+' 名不在本季非隐藏 PRESET/NORMAL 列表内；隐藏身份仅允许明确来源发放，四槽甄选已接，原型模板/好友助战等其他选择与继承仍待核。\n';
 }
 md+='\n## 完成边界\n\n职业基础行动看 [basic-actions.md](../mechanics/basic-actions.md)，干员特质看 [garrison-implementation.md](../mechanics/garrison-implementation.md)。200/266 是两季普通与精锐特质配置条目数，454 是职业基础资料数量，均不是“已完全实现的干员数”。\n\n敌群输入和专用 enemyDataLevelId 的 4 条覆写保留；三类抽选、类型次数、前后半/权重/禁用、数量与间隔换算已有原生依据并接入运行。尚未完整移植 token/extraEnemy 的附加插入；具体PRNG/洗牌随机序列、XLua热更新及原版服务器覆盖仍未验证。当前独立种子随机流和房间同步是本项目约定，不宣称与原版服务器逐值一致。数据缺口在数据问题表维护，工作顺序由当前计划维护。\n';
 const files={'docs/generated/content-coverage.md':md,'docs/generated/content-coverage.json':JSON.stringify(report,null,2)+'\n'};
 for(const [p,text]of Object.entries(files)){const file=path.join(root,p);if(process.argv.includes('--check')){if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==text)throw Error('STALE '+p);}else fs.writeFileSync(file,text);}
 console.log('CONTENT COVERAGE',JSON.stringify({roster:roster.length,waves:report.waves,seasons:Object.fromEntries(Object.entries(report.seasons).map(([k,s])=>[k,{fixed:s.uniqueVisibleFixed,missing:s.missing.length,tierMismatches:s.tierMismatches.length,enemyMembers:s.enemyMembers}]))}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
