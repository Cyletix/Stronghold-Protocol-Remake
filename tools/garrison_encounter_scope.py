"""Appearance references, not the union of enemy attribute/override catalogs.

Decision effect declarations are retained separately: their server selection
pool is unknown, so a bounty description alone cannot confer garrison priority.
"""
import hashlib
import json
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT/'work/garrison-encounter-scope.json'
RULE = 'season-groups-referenced-waves-bosses-and-band-spawns-v1'


def scope_requests(requests, enemy_ids):
    """Project mixed shared requests without dispatching their catalog-only IDs."""
    pool=set(enemy_ids);result=[]
    for request in requests:
        source=request.get('affectedEnemyIDs',[])
        affected=[eid for eid in source if eid in pool]
        if not affected: continue
        row=deepcopy(request)
        row['sourceAffectedEnemyIDs']=source
        row['affectedEnemyIDs']=affected
        owner={r.get('candidateId'):r.get('enemyId') for r in request.get('evidence',[])}
        row['sourceCandidateIDs']=request.get('candidateIDs',[])
        row['sourceCandidateSets']={field:ids for field,ids in request.items()
            if field=='candidateIDs' or field.endswith('CandidateIDs')}
        for field,ids in row['sourceCandidateSets'].items():
            row[field]=[cid for cid in ids if (
                owner.get(cid,cid.split('|',1)[0]) in pool
                or ('|' not in cid and cid not in owner and set(source)<=pool))]
        if 'evidence' in request:
            row['sourceEvidence']=request['evidence']
            row['evidence']=[r for r in request['evidence'] if r.get('enemyId') in pool]
        result.append(row)
    return result


def scope_runtime_report(report, enemy_ids):
    """Keep original source receipts intact and filter only the work projection."""
    pool=set(enemy_ids);result=deepcopy(report)
    skill=result.setdefault('skillDispatch',{})
    all_ids=set(skill.get('sourceCandidateIDs',skill.get('candidateIDs',[])))
    for field in ('selections','rejections'):
        for rows in skill.get(field,{}).values():
            all_ids.update(row.get('id',row.get('candidateId')) for row in rows if row.get('id',row.get('candidateId')))
        skill[field]={eid:rows for eid,rows in skill.get(field,{}).items() if eid in pool}
    skill['sourceCandidateIDs']=sorted(all_ids)
    skill['candidateIDs']=sorted(i for i in all_ids if i.split('|',1)[0] in pool)
    skill['outOfScopeCandidateIDs']=sorted(all_ids-set(skill['candidateIDs']))
    periodic=result.setdefault('periodicAbilities',{})
    for field in ('selections','rejections'):
        periodic[field]={eid:rows for eid,rows in periodic.get(field,{}).items() if eid in pool}
    return result


def apply_scope_to_plan(plan, scope):
    marker=dict(rule=scope['rule'],sourceHashes=scope['sourceHashes'],eligibleEnemyIDs=scope['eligibleEnemyIDs'])
    if plan.get('appearanceScope')==marker:return plan
    out=deepcopy(plan);pool=set(scope['eligibleEnemyIDs']);conditional=set(scope['conditionalOnlyEnemyIDs'])
    for eid,row in out.get('enemies',{}).items():
        row.setdefault('sourceCatalogInEncounterPool',row.get('inEncounterPool'))
        row['inEncounterPool']=eid in pool
        row['appearanceStatus']='source-appearance-reference' if eid in pool else 'decision-only-unverified' if eid in conditional else 'no-appearance-reference'
    for row in out.get('operators',{}).values():row['encounterIDs']=sorted(set(row.get('memberIDs',[]))&pool)
    out['appearanceScope']=marker
    if 'encounterEnemies' in out.get('counts',{}):out['counts']['encounterEnemies']=sum(eid in pool for eid in out['enemies'])
    return out


def build_scope(encounters, battles):
    members, conditional = {}, {}
    def add(target, enemy, season, kind, path, modes=()):
        if not isinstance(enemy,str) or not enemy.startswith('enemy_'):
            return
        row = dict(seasonId=season,kind=kind,fieldPath=path,modeIDs=sorted(set(modes)))
        refs = target.setdefault(enemy,[])
        if row not in refs: refs.append(row)
    for sid,season in encounters.get('seasons',{}).items():
        mode_data = season.get('modes',{})
        for key,group in season.get('specialEnemyInfo',{}).items():
            if not group.get('randomWeight',0)>0: continue
            typ = group['type'];draw = season.get('typeDraw',{}).get(typ,{})
            modes=[]
            for mid,mode in mode_data.items():
                eligible = (typ in season.get('trainingTypes',[]) if mode.get('modeDifficulty')=='TRAINING'
                    else typ=='SPECIAL' or draw.get('count',0)>0 and draw.get('weight',0)>0)
                if eligible and group['specialEnemyKey'] not in mode.get('inactiveEnemyKey',[]): modes.append(mid)
            if not modes: continue
            for field in ('specialEnemyKey','attachedNormalEnemyKeys','attachedEliteEnemyKeys'):
                values = [group[field]] if field=='specialEnemyKey' else group.get(field,[])
                for enemy in values:
                    add(members,enemy,sid,'season-enemy-group',f'seasons/{sid}/specialEnemyInfo/{key}/{field}',modes)
    for sid,season in battles.get('seasons',{}).items():
        for mid,mode in season.get('modes',{}).items():
            references=[(f'rounds/{ri}/alternatives/{ai}',alt) for ri,r in enumerate(mode.get('rounds',[]))
                for ai,alt in enumerate(r.get('alternatives',[]))]
            references += [(f'stageChoices/{i}',v) for i,v in enumerate(mode.get('stageChoices',[])) if v.get('weight',1)>0]
            for where,ref in references:
                boss=season.get('bosses',{}).get(ref.get('bossId'))
                if boss:
                    # This is the combat identity, never the handbook display alias.
                    add(members,boss.get('enemyId'),sid,'round-boss',f'seasons/{sid}/modes/{mid}/{where}',[mid])
                key=ref.get('levelKey');level=battles.get('levels',{}).get(key,{})
                for wi,wave in enumerate(level.get('waves',[])):
                    for fi,fragment in enumerate(wave.get('fragments',[])):
                        for ai,action in enumerate(fragment.get('actions',[])):
                            if action.get('actionType')=='SPAWN' and action.get('count',0)>0:
                                add(members,action.get('key'),sid,'referenced-level-spawn',
                                    f'levels/{key}/waves/{wi}/fragments/{fi}/actions/{ai}',[mid])
        for bi,band in enumerate(season.get('bands',[])):
            for mi,mech in enumerate(band.get('mechs',[])):
                board={r['k']:r['v'] for r in mech.get('bb',[])}
                for field in ('enemy_id','enemylist'):
                    value=board.get(field)
                    if isinstance(value,str):
                        for enemy in value.split(','):
                            add(members,enemy.strip(),sid,'selectable-band-spawn',f'seasons/{sid}/bands/{bi}/mechs/{mi}/bb/{field}')
        for i,effect in enumerate(season.get('decisionEffects',[])):
            for mi,mech in enumerate(effect.get('mechs',[])):
                board=mech.get('bb',{})
                for field in ('enemy_id','enemylist'):
                    value=board.get(field)
                    if isinstance(value,str):
                        for enemy in value.split(','):
                            add(conditional,enemy.strip(),sid,'decision-declaration-unverified-pool',
                                f'seasons/{sid}/decisionEffects/{i}/mechs/{mi}/bb/{field}')
    eligible=sorted(members);library=set(encounters.get('enemies',{}));conditional_only=sorted(set(conditional)-set(members))
    return dict(schemaVersion=1,rule=RULE,eligibleEnemyIDs=eligible,
        appearanceReferences={k:members[k] for k in eligible},
        conditionalOnlyEnemyIDs=conditional_only,decisionDeclarationReferences=conditional,
        catalogOnlyEnemyIDs=sorted(library-set(members)-set(conditional)),
        excludedCatalogEnemyIDs=sorted(library-set(members)),
        seasonEnemyIDs={sid:sorted(k for k,refs in members.items() if any(r['seasonId']==sid for r in refs))
            for sid in sorted(battles.get('seasons',{}))},
        counts=dict(eligibleEnemies=len(eligible),attributeCatalogEnemies=len(library),
            excludedCatalogEnemies=len(library-set(members)),conditionalOnlyEnemies=len(conditional_only)),
        boundary='Static season appearance references, not proof of every in-round trigger. Attribute rows, overrides, handbook aliases and declaration-only decision effects do not establish appearance. Summon/branch-only identities need a separately traced reachable producer; the broad library is retained intact.')


def load_scope(root=ROOT, write=True):
    root=Path(root)
    paths=['web/enemy_encounters.json','web/source_battles.json']
    raw={p:(root/p).read_bytes() for p in paths}
    sources={p:hashlib.sha256(b).hexdigest() for p,b in raw.items()}
    sources['tools/garrison_encounter_scope.py']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    out=root/'work/garrison-encounter-scope.json'
    if out.is_file():
        old=json.loads(out.read_text(encoding='utf8'))
        if old.get('rule')==RULE and old.get('sourceHashes')==sources: return old
    result=build_scope(*(json.loads(raw[p]) for p in paths));result['sourceHashes']=sources
    if write:
        out.parent.mkdir(parents=True,exist_ok=True)
        out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    return result


if __name__=='__main__':
    result=load_scope();print(json.dumps(result['counts'],ensure_ascii=False))
