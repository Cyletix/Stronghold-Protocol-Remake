"""Complete, bounded timed-mode compilation over cached source component graphs.

The four old reviewed graphs supply field schemas, not candidate skill IDs.
Every candidate comes from the garrison scope and must close its full skill and
selected character-mode graph. Unsupported values retain precise rejections.
"""
from collections import Counter
from copy import deepcopy
import hashlib
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT.parent/'src'), str(ROOT.parent/'tools')]
from arkresearch.client_logic import ClientLogicStore
from compile_client_modes import StatModeCompiler
from enemy_hit_sequences import load_script_types
from next_attack_compiler import ProjectileCompiler, Rejected as ProjectileRejected
from skill_mode_hit_buffs import ModeHitBuffCompiler
from operator_chain_projectiles import compile_chain
from skill_mode_appear import compile_appearance
from skill_mode_aura import compile_aura
from skill_mode_ammo import AmmoCompiler

C = 'Torappu.Battle.'
A = C+'Abilities.'
IDENTITY = {'m_GameObject', 'm_Script', 'm_Name'}
ATTRIBUTES = {0:'max_hp',1:'atk',2:'def',3:'magic_resistance',5:'block_cnt',
              7:'attack_speed',8:'base_attack_time',13:'hp_recovery_per_sec',
              15:'ability_range_forward_extend',17:'def_penetrate',19:'hp_recovery_per_sec_by_max_hp_ratio',
              20:'taunt_level',25:'def_penetrate_fixed'}
FORMULAS = {0:'addition',1:'multiplier',2:'final_addition',3:'final_scaler'}
BOUNDARIES = [
    'Verified source fields and complete cached companion graphs; CN levels applied to JP 36.7.22 graphs are a cross-snapshot inference.',
    'Current simulation cast-start activation, skill-duration expiry, base targeting/travel and interruption model are retained; native frame phase and projectile animation are not claimed.',
    'Zero-event, zero-delay three-part channeling supplies semantic begin/active/end lifecycle; source animation names are retained but native artwork/frame timing is not reproduced.',
    'Unchanged general abilities remain the existing base consumer; newly added mode general abilities, unknown fields, unsupported attack Buffs and unconsumed parameters reject the whole candidate.',
    'Animation names, visual-only emitter lists and disabled selector flag operands are retained as source metadata; their presentation is not a second combat action.',
    'Mode restoration follows the existing base consumer. Source mode selectors and block-count caps are bound independently of historical per-skill completion flags.',
    'Static repeat counts use the existing shared-schema 1 + additionalTimes model. Explicit CN attack@times descriptions establish a total-count parameter; protected native repeated-shot getters and inter-shot timing remain unverified.',
    'Finite on-hit slow/stun preserve source Buff keys and attack blackboard bindings. The shared max-expiry refresh rule is a simulation boundary; protected native DEFAULT refresh and melee Buff/body phase remain unverified.',
    'Complete chain-lightning subtrees use one primary projectile. CN source descriptions support a total target budget including the first target; per-hop timing and nearest-target ties remain simulation conventions. Trait/module values are frozen from the live attack profile at skill start.',
]


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()


class Rejected(ValueError):
    def __init__(self, reason, path='', actual=None):
        self.record = dict(reason=reason,path=path,actual=actual)
        super().__init__(reason+': '+path)


def require(value, reason, path='', actual=None):
    if not value:
        raise Rejected(reason,path,actual)


def numeric(value):
    return type(value) in (int,float) and math.isfinite(value)


def clean(fields):
    return {key:value for key,value in fields.items() if key not in IDENTITY}


def shape(fields, prototype, variable=(), path=''):
    actual, expected = clean(fields), clean(prototype)
    require(set(actual)==set(expected),'unknown-or-missing-fields',path,
            dict(extra=sorted(set(actual)-set(expected)),missing=sorted(set(expected)-set(actual))))
    for key,value in actual.items():
        if key not in variable:
            require(value==expected[key],'unsupported-field',path+'/'+key,value)


def shape_any(fields, prototypes, variable=(), path=''):
    errors=[]
    for prototype in prototypes:
        try:shape(fields,prototype,variable,path);return
        except Rejected as error:errors.append(error.record)
    raise Rejected('unsupported-component-contract',path,errors[0] if errors else None)


def exactly_one(rows, typename, path=''):
    values=[row for row in rows if row['type']==typename]
    require(len(values)==1,'required-single-component',path,dict(type=typename,count=len(values)))
    return values[0]


def visual_identity(fields):
    value=deepcopy(clean(fields))
    for key in ('_hitEffects','_castEffects','_attachEffects','_inputTargetEffects','_castTargetEffects'):
        for effect in value.get(key,[]):
            if '_effects' in effect:
                require(isinstance(effect['_effects'],list) and all(isinstance(x,str) for x in effect['_effects']),
                        'invalid-effect-reference',key)
                effect['_effects']=['']*len(effect['_effects'])
    return value


class ModeCompiler:
    def __init__(self, reference, graphs, templates):
        self.reference=reference;self.graphs=graphs;self.templates=templates
        self.evidence=ClientLogicStore('jp-36.7.22-client-logic')
        self.reader=StatModeCompiler(self.evidence)
        projectile_path=ROOT/'work/client-logic/bundles/battle/prefabs/[uc]projectiles.ab.json'
        self.projectiles=ProjectileCompiler(json.loads(projectile_path.read_text(encoding='utf-8')),load_script_types())
        self.hit_buffs=ModeHitBuffCompiler(templates,json.loads((ROOT/'data/ArknightsGameData/zh_CN/gamedata/buff_table.json').read_text(encoding='utf-8-sig')))
        self.characters=json.loads((ROOT/'data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json').read_text(encoding='utf-8'))
        self.appearance_contract=json.loads((ROOT/'work/skill-mode-appear-contract.json').read_text(encoding='utf-8'))
        self.ammo=AmmoCompiler()
        self.prototypes={};self.character_cache={}
        for row in reference['rows']:
            for node in row['skillGraph']:
                self.prototypes.setdefault(node['type'],[]).append(node['fields'])
        for character in reference['characters'].values():
            for mode in character['modes']:
                for nodes in mode['roles'].values():
                    for node in nodes:
                        self.prototypes.setdefault(node['type'],[]).append(node['fields'])
        self.cast=self.prototypes[C+'CastSkill'][0]
        self.active=self.prototypes[A+'ActiveBuffAbility'][0]
        self.buff=self.active['_buffs'][0]
        self.mode_reference=next(iter(reference['characters'].values()))['modes'][0]['fields']
        # The native plain actor is the inherited MultiMelee actor without its
        # repeat-only serialized fields. Source candidates still need exact keys.
        multi_only={'_additionalTimes','_triggerDelta','_waitAttackEventForAllAttacks','_splitDamage',
            '_minPostDelay','_onlyFeedActiveBuffToLastOne','_onlyFeedActiveBuffToFirstOne',
            '_addSpellCntToAllSignalId','_addSpellCntToLastSignalId','_onlyTrigAudioSignalForFirstSpell',
            '_onlyTrigAudioSignalForFirstHit','_addSpellCntToAllHitSignalId','_refreshInputTargetOnCheckSpell',
            '_refreshInputTargetTrigger','_refreshTimesOnCastStart','_refreshTimesOnCheckAnotherSpell'}
        self.prototypes[A+'MeleeAttack']=[{k:v for k,v in p.items() if k not in multi_only}
                                        for p in self.prototypes[A+'MultiMeleeAttack']]
        self.prototypes[C+'BlockedOrAdvancedSelector']=[{**p,'_limitedMaxTargetNumToBlockedCnt':0,
            '_allowZeroBlockCntLimit':0} for p in self.prototypes[C+'AdvancedSelector']]
        # Common serialized MultiRanged schema. Nonempty additional projectiles,
        # redirected locations, split damage and dynamic counts are not admitted.
        ranged_repeat=dict(_additionalTimes=0,_triggerDelta=0.,_waitAttackEventForAllAttacks=0,
            _additionalProjectile='',_useMultiAdditionalProjectiles=0,_additionalProjectiles=[],
            _enableMountPointGroup=0,_mountPointGroup=[],_onlyFeedActionsToFirstOne=0,
            _onlyTrigAudioSignalForFirstOne=1,_limitToOneTargetAfterFirstRound=0,_splitDamage=0,
            _addSpellCntToSignalId=0,_onlyFeedActiveBuffToLastOne=0,_onlyFeedActiveBuffToFirstOne=0,
            _refreshTimesOnCastStart=0,_castToFirstRoundTargetLocationsAtProjectileBirth=0,_hookTheLastProjectile='')
        self.prototypes[A+'MultiRangedAttack']=[{**p,**ranged_repeat} for p in self.prototypes[A+'RangedAttack']]

    def components(self,prefab):
        if prefab in self.graphs['rejections']:
            return self.graphs['rejections'][prefab]['components']
        source=self.evidence.prefab(prefab,components=True)
        require(source is not None,'missing-prefab',prefab)
        return [dict(node_id=row['pathId'],type=self.reader.name(source['bundle'],row),fields=row['fields'])
                for row in source['components'] if row['unityType']=='MonoBehaviour']

    def trait_bindings(self,char_id):
        candidates=(self.characters[char_id].get('trait') or {}).get('candidates') or []
        if not candidates:return {}
        boards=[{b['key']:b['value'] for b in c.get('blackboard',[])} for c in candidates]
        return {key[7:]:dict(traitKey=key,default=boards[0][key],source=dict(charId=char_id,
                    pointer='data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json#/'+char_id+'/trait/candidates',
                    candidatesSha256=digest(candidates)))
                for key in set.intersection(*(set(bb) for bb in boards))
                if key.startswith('attack@') and all(numeric(bb[key]) for bb in boards)}

    def character(self,char_id):
        if char_id in self.character_cache:
            return self.character_cache[char_id]
        roots=self.reader.asset_roots.get('dyn/battle/prefabs/characters/'+char_id+'.prefab',[])
        require(len(roots)==1,'ambiguous-or-missing-character',char_id)
        bundle,ref=roots[0];root=self.reader.node(bundle,ref)
        rows=[self.reader.node(bundle,item['component']) for item in root['fields']['m_Component']]
        chars=[row for row in rows if row and row['unityType']=='MonoBehaviour'
               and self.reader.name(bundle,row)==C+'Character']
        require(len(chars)==1,'ambiguous-character-component',char_id)
        modes=[]
        for index,ref in enumerate(chars[0]['fields']['_modes']):
            node=self.reader.node(bundle,ref)
            require(node and self.reader.name(bundle,node)==C+'UnitMode','unsupported-mode-root',char_id)
            fields=node['fields'];roles={}
            companions=[dict(node_id=row['pathId'],type=self.reader.name(bundle,row),fields=row['fields'])
                        for row in self.reader.companions(bundle,node) if row['pathId']!=node['pathId']]
            for role in ('_attack','_combat','_attackTrigger'):
                actor=self.reader.node(bundle,fields[role])
                roles[role]=[dict(node_id=row['pathId'],type=self.reader.name(bundle,row),fields=row['fields'])
                             for row in self.reader.companions(bundle,actor)] if actor else []
            selectors={}
            for row in roles['_attack']:
                ref=row['fields'].get('_selector')
                if ref and ref['m_PathID']!='0':
                    selector=self.reader.node(bundle,ref)
                    require(selector is not None,'missing-actor-selector')
                    selectors[ref['m_PathID']]=[dict(node_id=n['pathId'],type=self.reader.name(bundle,n),fields=n['fields'])
                                                for n in self.reader.companions(bundle,selector)]
            hook=self.reader.node(bundle,fields['_animatorHooker'])
            modes.append(dict(index=index,pathId=node['pathId'],fields=fields,roles=roles,companions=companions,actorSelectors=selectors,
                animatorHook=dict(type=self.reader.name(bundle,hook),fields=hook['fields']) if hook else None))
        value=dict(charId=char_id,bundle=bundle,bundleSha256=self.reader.bundles[bundle]['sha256'],
                   characterPathId=chars[0]['pathId'],modes=modes)
        self.character_cache[char_id]=value
        return value

    def visual(self,row,path,base=None):
        require(row['type']==A+'UberEffectEmitter','unsupported-companion',path,row['type'])
        value=clean(row['fields']);protos=self.prototypes[row['type']]
        lists={'_hitEffects','_castEffects','_attachEffects','_inputTargetEffects','_castTargetEffects'}
        controls=[protos[0]]
        if base:controls.extend(n['fields'] for n in base['roles']['_attack'] if n['type']==row['type'])
        shape_any(value,controls,lists,path)
        entries=[e for p in protos for key in lists for e in p[key]]
        for key in lists:
            require(isinstance(value[key],list),'invalid-effect-list',path+'/'+key)
            for effect in value[key]:
                # Names/counts and visual event selection do not modify combat;
                # retain all structural/control restrictions outside the emitter.
                require(any(set(effect)==set(e) for e in entries),'unknown-effect-fields',path+'/'+key)
                require(isinstance(effect['_effects'],list) and all(isinstance(x,str) for x in effect['_effects'])
                        and numeric(effect.get('_delayIfFirstAttack',0)) and effect.get('_delayIfFirstAttack',0)>=0
                        and effect.get('_hookEffectAfterFirstAttack','')=='',
                        'unsupported-visual-control',path+'/'+key,effect)

    def mode(self,character,index):
        require(type(index) is int and 0<=index<len(character['modes']),'mode-index-out-of-range')
        mode=character['modes'][index];fields=mode['fields']
        extra=[r for r in mode['companions'] if r['node_id']!=fields['_animatorHooker']['m_PathID']]
        require(not extra,'mode-root-extra-companions','mode/components',[r['type'] for r in extra])
        shape(fields,self.mode_reference,('_bodyTransform','_animatorHooker','_attack','_combat','_attackTrigger',
                                          '_addIndexToSignalId','_includeIndexZero','_generalAbilities'), 'mode')
        require(fields['_addIndexToSignalId'] in (0,1) and fields['_includeIndexZero'] in (0,1),'unsupported-mode-signal-policy')
        require(fields['_generalAbilities']==character['modes'][0]['fields']['_generalAbilities'],
                'mode-adds-general-abilities','mode/_generalAbilities',fields['_generalAbilities'])
        require(not mode['roles']['_combat'],'separate-combat-role','mode/_combat')
        if mode['animatorHook']:
            hook=mode['animatorHook'];f=clean(hook['fields'])
            require(hook['type']==C+'SimpleUnitAnimatorHooker' and set(f)=={'m_Enabled','_excludeAnimKeys','_replaceAnimPairs','_disableSwitchSettings'}
                    and f['m_Enabled']==1 and not f['_disableSwitchSettings']
                    and isinstance(f['_replaceAnimPairs'],list)
                    and all(set(p)=={'fromAnimKey','toAnimKey'} and all(isinstance(v,str) for v in p.values()) for p in f['_replaceAnimPairs'])
                    and isinstance(f['_excludeAnimKeys'],list) and all(isinstance(x,str) for x in f['_excludeAnimKeys']),
                    'unsupported-animator-hook','mode/_animatorHooker',f)
        return mode

    def channel(self,row):
        fields=clean(row['fields'])
        animations={'_default','_down','_up'}
        zero={'_overrideDownAnimation','_overrideUpAnimation','_faceToFront','_faceToDefault',
              '_waitForAttachFinishEvent','_earlyFinishEndIdleAnimation','_fireAttackFinishEvent',
              '_delayToFireAttackSkillEvent','_delaySecond','_fireAnimEndEvent','_dontPlayBeginAnimFromInterrupted',
              '_onlyPlayBeginAnimWhenFirstAttack','_delayToAnimateEndAnimation','_delayToAnimateEndAnimationTime','_playIdleAnimInTheEnd'}
        require(set(fields)==animations|zero|{'m_Enabled'} and fields['m_Enabled']==1,
                'unknown-channeling-fields','channeling',sorted(fields))
        require(all(fields[key]==0 for key in zero),'eventful-or-delayed-channeling','channeling')
        require(all(set(fields[key])=={'beginAnim','loopAnim','endAnim'} and all(isinstance(v,str) for v in fields[key].values())
                    for key in animations),'unknown-channeling-animation-shape')
        require(not any(fields[key].values() and any(fields[key].values()) for key in ('_down','_up')),
                'directional-channeling-not-supported')
        return dict(begin=fields['_default']['beginAnim'],loop=fields['_default']['loopAnim'],end=fields['_default']['endAnim'],
                    waitForAttachFinish=False,eventDriven=False)

    def oneshot(self,row,base):
        fields=clean(row['fields'])
        keys={'m_Enabled','_beginAnim','_oneshotAnim','_endAnim','_fixAnimWhenCooldownSlow',
              '_overrideDownAnimation','_down','_faceToTarget','_minAnimScale','_maxAnimScale','_onlyPlayBeginAnimWhenFirstAttack'}
        require(set(fields)==keys and fields['m_Enabled']==1
                and all(isinstance(fields[k],str) for k in ('_beginAnim','_oneshotAnim','_endAnim'))
                and fields['_fixAnimWhenCooldownSlow']==0 and fields['_overrideDownAnimation']==0
                and fields['_down']==dict(beginAnim='',oneshotAnim='',endAnim='')
                and fields['_faceToTarget']==0 and fields['_onlyPlayBeginAnimWhenFirstAttack'] in (0,1)
                and fields['_minAnimScale']==-1 and fields['_maxAnimScale']==-1,
                'unsupported-oneshot-presentation','mode/attack/oneshot',fields)

    def template(self,key):
        require(key in ('switch_mode','switch_mode_restart_fsm'),'unsupported-buff-template','buff/templateKey',key)
        template=self.templates[key];events=template['eventToActions']['_items'];restart=key.endswith('_restart_fsm')
        require(template['effectKey']=='' and template['onEventPriority']==0 and len(events)==2,'changed-mode-template',key)
        for i,event in enumerate(events):
            expected={'_modeIndex':1 if i==0 else 0,'_loadModeFromBlackboard':i==0,
                      '_restoreDefault':i==1,'_restartFSM':restart,'_targetType':'TARGET',
                      '$type':C+'Action.Nodes+SwitchMode'}
            require(event['key']==i and event['value'].get('decodedActions')==[expected]
                    and not event['value']['SerializedObjectReferences'],'changed-mode-template',key)
        return restart

    def buff_body(self,buff,consumed,path,mode=False):
        """Compile one complete self Buff, retaining its independent identity."""
        if buff.get('loadFromDB'):
            require(not mode,'loaded-mode-switch-buff')
            from skill_mode_self_buffs import compile_loaded_owner
            return compile_loaded_owner(self,buff,consumed)
        if not mode:
            require(buff['templateKey']=='empty','unsupported-buff-template',path+'/templateKey',buff['templateKey'])
            require(self.templates['empty']==dict(templateKey='empty',effectKey='',onEventPriority=0,
                eventToActions={'_items':[]}),'changed-empty-template')
            require(not buff['blackboard'],'non-mode-local-blackboard',path+'/blackboard',buff['blackboard'])
        variable={'attributes','buffKey','templateKey','blackboard','overrideEffectKey','audioSignal',
                  'disableOverride','triggerInterval','waitFirstTriggerInterval','durationKey','lifeTimeType','stripBlackboardParamsWithBuffKey'}
        shape(buff,self.buff,variable,path)
        require(buff['disableOverride'] in (0,1) and numeric(buff['triggerInterval']) and buff['triggerInterval']>=-1
                and buff['waitFirstTriggerInterval'] in (0,1),'unsupported-buff-controls',path)
        require(buff['durationKey'] in ('','duration') and buff['lifeTimeType'] in (1,2),'unsupported-buff-lifetime',path)
        require(buff['stripBlackboardParamsWithBuffKey'] in (0,1),'unsupported-buff-namespace',path)
        attrs=buff['attributes'];expected=self.buff['attributes']
        require(set(attrs)==set(expected),'unknown-buff-attribute-fields',path)
        require(all(not value for key,value in attrs.items() if key not in ('attributeModifiers','abnormalFlags')),
                'unsupported-buff-status-or-immunity',path)
        flags=attrs['abnormalFlags']
        require(isinstance(flags,list) and len(set(flags))==len(flags) and set(flags)<={7,11}
                and (mode or 11 not in flags),'unsupported-buff-abnormal-flags',path,flags)
        modifiers=[];seen=set()
        for modifier in attrs['attributeModifiers']:
            require(set(modifier)=={'attributeType','formulaItem','value','loadFromBlackboard','fetchBaseValueFromSourceEntity'}
                    and modifier['attributeType'] in ATTRIBUTES and modifier['formulaItem'] in FORMULAS
                    and modifier['loadFromBlackboard'] in (0,1) and modifier['fetchBaseValueFromSourceEntity']==0
                    and numeric(modifier['value']),'unsupported-attribute-modifier',path+'/attributes',modifier)
            attr=ATTRIBUTES[modifier['attributeType']];formula=FORMULAS[modifier['formulaItem']]
            require(attr!='ability_range_forward_extend' or formula=='addition',
                    'unsupported-range-extension-formula',path+'/attributes',modifier)
            require(attr!='taunt_level' or formula=='addition','unsupported-taunt-level-formula',path+'/attributes',modifier)
            require(attr not in ('def_penetrate','def_penetrate_fixed') or formula=='addition',
                    'unsupported-penetration-formula',path+'/attributes',modifier)
            require((attr,formula) not in seen,'duplicate-modifier',path);seen.add((attr,formula))
            # A nonzero serialized value with loading enabled introduces a
            # fallback contract not established by the old zero-default schema.
            require(mode or not modifier['loadFromBlackboard'] or modifier['value']==0,
                    'unknown-blackboard-fallback',path+'/attributes',modifier)
            key=(buff['buffKey']+'.' if buff['stripBlackboardParamsWithBuffKey'] else '')+attr
            value={'key':key} if modifier['loadFromBlackboard'] else {'constant':modifier['value']}
            if 'key' in value:consumed.add(key)
            modifiers.append(dict(attribute=attr,formula=formula,value=value))
        lifetime=dict(kind='timed',duration={'key':'duration'}) if buff['lifeTimeType']==1 else dict(kind='until_detach')
        output=dict(id=buff['buffKey'],scope='self',lifetime=lifetime,stacking=dict(max_stacks=1),modifiers=modifiers)
        if 7 in flags:output['flags']=['no_direct_heal']
        return output

    def compile(self,sid,skill,char_id,prefab):
        rows=self.components(prefab);types=Counter(row['type'] for row in rows)
        from skill_mode_toggle import maybe_compile as compile_toggle
        toggle=compile_toggle(self,sid,skill,char_id,prefab,rows)
        if toggle is not None:return toggle
        from skill_mode_passive import maybe_compile as compile_passive
        passive=compile_passive(self,sid,skill,char_id,prefab,rows)
        if passive is not None:return passive
        from skill_mode_flow import maybe_compile as compile_flow
        flow=compile_flow(self,sid,skill,char_id,prefab,rows)
        if flow is not None:return flow
        if C+'AppearSkill' in types:return compile_appearance(self,sid,skill,char_id,prefab,rows)
        if A+'AuraAbility' in types or A+'GlobalAuraAbility' in types:return compile_aura(self,sid,skill,char_id,prefab,rows)
        from skill_mode_blockees import maybe_compile
        blockee=maybe_compile(self,sid,skill,char_id,prefab,rows)
        if blockee is not None:return blockee
        from skill_mode_self_buffs import maybe_compile as compile_self
        self_buff=compile_self(self,sid,skill,char_id,prefab,rows)
        if self_buff is not None:return self_buff
        cast_type=C+('CastSkillWithLimitTimes' if C+'CastSkillWithLimitTimes' in types else 'CastSkill')
        from skill_mode_end_effects import compile_end_effects,TYPE as END_TYPE,BOUNDARIES as END_BOUNDARIES
        allowed={cast_type,A+'ActiveBuffAbility',A+'ThreePartChannelingAnimation',A+'UberEffectEmitter',END_TYPE}
        require(not set(types)-allowed,'unsupported-skill-companions','skill/components',sorted(set(types)-allowed))
        require(all(count==1 for count in types.values()),'duplicate-skill-components','skill/components',dict(types))
        cast=exactly_one(rows,cast_type)['fields'];active=exactly_one(rows,A+'ActiveBuffAbility')['fields']
        ammo=self.ammo.cast(cast) if cast_type.endswith('CastSkillWithLimitTimes') else None
        if not ammo:shape(cast,self.cast,('_switchToState','_attackBlackboardModeIndex','_rangeIdModeIndex','_defaultModeIndex',
                             '_playSkillBeginAnim','_beginAnim','_beginAnimDown','_beginEffect',
                             '_uninterruptibleOnAbilityPredelay'),'CastSkill')
        require(cast['_defaultModeIndex'] in (-1,0),'non-base-default-mode','CastSkill/_defaultModeIndex',cast['_defaultModeIndex'])
        require(cast['_playSkillBeginAnim'] in (0,1) and cast['_uninterruptibleOnAbilityPredelay'] in (0,1)
                and isinstance(cast['_beginAnim'],str) and isinstance(cast['_beginAnimDown'],str)
                and all(isinstance(x,str) for x in cast['_beginEffect']),'unsupported-cast-presentation')
        shape(active,self.active,('_buffs','_waitForCasting','_waitForAttackEvent','_interruptAbilityOnDetach'),'ActiveBuffAbility')
        require(active['_interruptAbilityOnDetach'] in (0,1),'unsupported-active-detach-policy')
        channel=next((self.channel(row) for row in rows if row['type']==A+'ThreePartChannelingAnimation'),None)
        for row in rows:
            if row['type']==A+'UberEffectEmitter':self.visual(row,'skill/emitter')
        switches=[(i,b) for i,b in enumerate(active['_buffs']) if b['templateKey'] in ('switch_mode','switch_mode_restart_fsm')]
        require(len(switches)==1,'required-single-mode-buff','ActiveBuffAbility/_buffs',
                [b['templateKey'] for b in active['_buffs']])
        mode_buff_index,buff=switches[0];restart=self.template(buff['templateKey'])
        consumed={'attack@trigger_time'} if ammo else set()
        end_effects=compile_end_effects(self,rows,skill['levels'],consumed)
        buffs=[self.buff_body(b,consumed,'buff/'+str(i),i==mode_buff_index) for i,b in enumerate(active['_buffs'])]
        require(len({b['id'] for b in buffs})==len(buffs),'duplicate-buff-identity')
        require(all(b['lifetime']['kind']==buffs[mode_buff_index]['lifetime']['kind'] for b in buffs),'mixed-mode-buff-lifetimes')
        modifiers=[m for b in buffs for m in b['modifiers']]
        require(not {'max_hp','hp_recovery_per_sec_by_max_hp_ratio'}<=set(m['attribute'] for m in modifiers),
                'mixed-max-hp-and-ratio-recovery')
        board=buff['blackboard']
        require(not board or len(board)==1 and board[0]['key']=='mode' and set(board[0])=={'key','value','valueStr'}
                and board[0]['valueStr']=='' and numeric(board[0]['value']) and int(board[0]['value'])==board[0]['value'],
                'non-mode-local-blackboard')
        # SwitchMode.Execute 0x2646ecc..0x2646efc uses serialized _modeIndex
        # when TryGetInt fails; both validated source templates default to one.
        index=int(board[0]['value']) if board else 1
        character=self.character(char_id);mode=self.mode(character,index)
        counter=self.ammo.actor(mode,ammo) if ammo else None
        if ammo:require(not channel and all(b['lifetime']=={'kind':'until_detach'} for b in buffs),'unsupported-ammo-buff-lifecycle')
        if any(m['attribute']=='ability_range_forward_extend' for m in modifiers):
            ranges=[n for nodes in [mode['roles']['_attackTrigger'],*mode['actorSelectors'].values()]
                    for n in nodes if n['type']==C+'AutoLoadBoxRange']
            require(ranges and all(n['fields']['_extendable']==1 for n in ranges),
                    'range-modifier-has-nonextendable-selector')
        require(cast['_attackBlackboardModeIndex'] in (-1,index) and cast['_rangeIdModeIndex'] in (-1,index),
                'other-mode-parameter-owner')
        disarmed=11 in buff['attributes']['abnormalFlags']
        lifecycle=(bool(channel),restart,cast['_switchToState'],active['_waitForCasting'],active['_waitForAttackEvent'])
        require(lifecycle==(True,True,0,1,0) if disarmed else
                not channel and cast['_switchToState'] in (0,1)
                and (active['_waitForCasting'],active['_waitForAttackEvent']) in ((0,0),(0,1),(1,0)),
                'unsupported-cast-channel-lifecycle')
        projectile=None
        if disarmed:
            require(any(m['attribute']=='hp_recovery_per_sec_by_max_hp_ratio' for m in modifiers),'channel-without-source-recovery')
            base=self.mode(character,0)
            def identity(mode):
                def body(n):
                    value=clean(n['fields'])
                    for key in ('_animKey','_endAnimKey','_downAnimKey','_downEndAnimKey','_upAnimKey','_upEndAnimKey'):
                        if key in value:value[key]=''
                    return dict(type=n['type'],fields=value)
                for nodes in mode['roles'].values():
                    for n in nodes:
                        if n['type']==A+'UberEffectEmitter':self.visual(n,'disarmed/mode/emitter')
                return {role:sorted([body(n) for n in nodes if n['type']!=A+'UberEffectEmitter'],key=lambda n:json.dumps(n,sort_keys=True))
                        for role,nodes in mode['roles'].items()}
            require(identity(base)==identity(mode),'disarmed-mode-changes-base-role-graph')
            action='none';plan=None;selection=None;actor=None;selector=None
        else:
            chain=None
            chain_actors=[n for n in mode['roles']['_attack'] if n['type']==A+'RangedAttack' and n['fields'].get('_waitForProjectileInvalid')==1]
            if chain_actors:
                require(len(chain_actors)==1,'ambiguous-chain-mode-actor')
                try:projectile=compile_chain(self.projectiles,chain_actors[0]['fields']['_projectileKey']);chain=projectile['chain']
                except ProjectileRejected as error:raise Rejected('unsupported-mode-projectile',error.category,error.detail) from error
            action,plan,selection,actor,selector=self.attack(mode,skill,consumed,character['modes'][0],chain,self.trait_bindings(char_id),counter)
            if actor['type'] in (A+'RangedAttack',A+'MultiRangedAttack'):
                known={p.get('_projectileKey') for p in self.prototypes[A+'RangedAttack']}
                known.update(n['fields'].get('_projectileKey') for n in character['modes'][0]['roles']['_attack'] if n['type']==A+'RangedAttack')
                if projectile is None and actor['fields']['_projectileKey'] not in known:
                    try:projectile=self.projectiles.compile(actor['fields']['_projectileKey'])
                    except ProjectileRejected as error:raise Rejected('unsupported-mode-projectile',error.category,error.detail) from error
                if projectile:
                    plan['delivery']='projectile';plan['projectile']=projectile
                    if chain:plan['waitForProjectile']=True
        levels=skill['levels'];keys=sorted(entry['key'] for entry in levels[0]['blackboard'])
        require(not any(key.startswith('attack@') for key in consumed) or cast['_attackBlackboardModeIndex']==index,
                'attack-blackboard-not-bound-to-selected-mode')
        require(set(keys)==consumed and len(keys)==len(consumed),'unconsumed-or-missing-blackboard',sid,
                dict(source=keys,consumed=sorted(consumed)))
        for level in levels:
            bb={item['key']:item['value'] for item in level['blackboard']}
            require(len(bb)==len(level['blackboard']) and sorted(bb)==keys and all(numeric(v) for v in bb.values()),'changed-level-blackboard')
            if ammo:self.ammo.level(level,prefab,bb)
            else:require(level['prefabId']==prefab and level['skillType'] in ('MANUAL','AUTO')
                    and (level['duration']>0 if buff['lifeTimeType']==1 else level['duration']==-1)
                    and level['durationType']=='NONE' and level['spData']['spType'] in
                        ('INCREASE_WITH_TIME','INCREASE_WHEN_ATTACK','INCREASE_WHEN_TAKEN_DAMAGE')
                    and level['spData']['spCost']>0,'unsupported-level-controller')
            require(level['rangeId'] is None or cast['_rangeIdModeIndex']==index,'range-mode-binding-mismatch')
            for b in buffs:
                if b['lifetime']['kind']=='timed':
                    expression=b['lifetime']['duration'];duration=expression.get('constant',
                        {**{'duration':level['duration']},**bb}.get(expression.get('key')))
                    require(numeric(duration) and duration==bb.get('duration',level['duration']),
                            'mixed-mode-buff-durations')
                shared=b.get('override_buff')
                if shared:
                    for m in shared['modifiers']:
                        v=bb[m['value']['key']]
                        require(0<=(1+v if v<0 else v)<=1,'invalid-finite-owner-status-resistance')
            if plan:
                get=lambda value:bb[value['key']] if isinstance(value,dict) and 'key' in value else value.get('constant',value.get('default')) if isinstance(value,dict) else value
                require(numeric(get(plan['targets'])) and int(get(plan['targets']))==get(plan['targets']) and 1<=get(plan['targets'])<=64
                        and numeric(get(plan['hits'])) and int(get(plan['hits']))==get(plan['hits']) and 1<=get(plan['hits'])<=32
                        and get(plan['scale'])>0,'invalid-level-attack-plan')
                require(selection.get('priorityApplyWay')!='ranged' or get(plan['targets'])==1 and plan['kind']=='single',
                        'unsupported-ranged-priority-budget')
                if plan.get('chainCount') is not None:
                    count=get(plan['chainCount']);decay=get(plan['chainDecay'])
                    require(numeric(count) and int(count)==count and 1<=count<=64 and numeric(decay) and 0<=decay<=1,'invalid-level-chain-plan')
            require(all(bb.get(key,0)>=0 for key in ('hp_recovery_per_sec','hp_recovery_per_sec_by_max_hp_ratio')),'negative-recovery')
            for modifier in modifiers:
                if modifier['attribute'] in ('def_penetrate','def_penetrate_fixed'):
                    expr=modifier['value'];v=bb[expr['key']] if 'key' in expr else expr['constant']
                    require(v>=0 and (modifier['attribute']!='def_penetrate' or v<=1),'invalid-def-penetration')
                if modifier['attribute']=='ability_range_forward_extend':
                    expression=modifier['value'];count=bb[expression['key']] if 'key' in expression else expression['constant']
                    require(type(count) in (int,float) and int(count)==count and count>=0,'invalid-range-extension')
        source=dict(graphSha256=digest(rows),modeGraphSha256=digest(mode),prefabId=prefab,
                    evidenceLevels=dict(serializedGraph='Verified',switchTemplateAndDefault='Verified',
                                        currentSimulationMapping='Inferred',nativeFrameEquivalence='unverified'),
                    skillGraphPointer='work/client-logic/program-compilation.json#/rejections/'+prefab+'/components'
                        if prefab in self.graphs['rejections'] else 'client-logic-database#prefab='+prefab,
                    characterPathId=character['characterPathId'],modePathId=mode['pathId'],
                    bundle=character['bundle'],bundleSha256=character['bundleSha256'],
                    attackNode=actor['node_id'] if actor else None,selectorNode=selector['node_id'] if selector else None,
                    actorType=actor['type'] if actor else None,
                    targetTiming=actor['fields']['_selectTargetTiming'] if actor else None,
                    repeatCountPolicy='CN-source-description-total' if 'attack@times' in consumed else 'serialized-additional-times-plus-one',
                    projectileKey=actor['fields'].get('_projectileKey') if actor else None,
                    projectile=projectile,
                    controller=dict(switchToState=cast['_switchToState'],waitForCasting=active['_waitForCasting'],
                        waitForAttackEvent=active['_waitForAttackEvent'],restartFSM=restart,
                        playSkillBeginAnim=cast['_playSkillBeginAnim'],beginAnim=cast['_beginAnim']),
                    sourceVersion=self.evidence.manifest['source_version'],model_boundaries=BOUNDARIES)
        lifetime=dict(kind='timed',duration={'key':'duration'}) if buff['lifeTimeType']==1 else dict(kind='until_detach')
        profile=dict(prefabId=prefab,charIds=[char_id],blackboardKeys=keys,levelCount=len(levels),modeIndex=index,lifetime=lifetime,
                     modeBuffIndex=mode_buff_index,
                     action=action,plan=plan,selector=selection,disarmed=disarmed,channeling=channel,source=source)
        program=dict(controller=dict(kind='cast_skill_active_buffs',activation='cast',duration_policy='max_buff_duration',
                    allow_no_target=True,sp_recovery_while_active=False,pre_delay=0,
                    interrupt_on_detach=bool(active['_interruptAbilityOnDetach']),wait_for_casting=bool(active['_waitForCasting']),
                    wait_for_attack_event=bool(active['_waitForAttackEvent'])),
                    buffs=buffs,source=source)
        if ammo:self.ammo.bind(profile,program,ammo,counter)
        if end_effects:
            profile['capability']='end-effects';profile['activation']='cast'
            program['endEffects']=end_effects
            source['endEffects']=[e['source'] for e in end_effects]
            source['model_boundaries']=source['model_boundaries']+END_BOUNDARIES
        return profile,program

    def attack(self,mode,skill,consumed,base,chain=None,trait_bindings=None,ammo_counter=None):
        actors=[row for row in mode['roles']['_attack'] if row['type'] in (A+'RangedAttack',A+'MeleeAttack',A+'MultiMeleeAttack',A+'MultiRangedAttack',A+'RangedHeal')]
        require(len(actors)==1,'unsupported-mode-action-set','mode/_attack',[r['type'] for r in mode['roles']['_attack']])
        actor=actors[0];fields=actor['fields'];heal=actor['type']==A+'RangedHeal'
        candidates=self.prototypes[actor['type']]
        variable={'_animKey','_endAnimKey','_downAnimKey','_downEndAnimKey','_upAnimKey','_upEndAnimKey',
                  '_projectileKey','_atkScale','_atkScaleKey','_damageType','_maxAnimScale','_selector',
                  '_interruptAbilityOnDetach','_selectTargetSource','_escapeTime','_faceToTarget','_faceToDefault',
                  '_additionalTimes','_addSpellCntToLastSignalId','_selectTargetTiming','_alwaysIncludeTarget','_allowNoTarget',
                  '_triggerDelta','_onlyTrigAudioSignalForFirstOne','_addSpellCntToSignalId','_activeBuffs'}
        variable.add('_waitForAttackEvent')
        variable.add('_preDelay')
        if heal:variable.add('_mountPointType')
        if chain:variable.add('_waitForProjectileInvalid')
        shape_any(fields,candidates,variable,'mode/attack')
        require(fields.get('_damageType',2) in (1,2) and numeric(fields.get('_atkScale',1)) and fields.get('_atkScale',1)>0,
                'unsupported-mode-damage')
        require(fields['_interruptAbilityOnDetach'] in (0,1) and fields['_selectTargetSource'] in (1,2)
                and fields['_waitForAttackEvent'] in (0,1)
                and fields['_selectTargetTiming'] in (0,1,3) and fields['_alwaysIncludeTarget'] in (0,1)
                and fields['_allowNoTarget'] in (0,1)
                and numeric(fields['_escapeTime']) and fields['_escapeTime']>=0
                and fields['_faceToTarget'] in (0,1) and fields['_faceToDefault'] in (0,1),'unsupported-attack-control')
        require(not heal or type(fields['_mountPointType']) is int and fields['_mountPointType']>=0,
                'invalid-heal-presentation-mount')
        require(numeric(fields['_preDelay']) and fields['_preDelay']>=0 and
                (fields['_preDelay']==0 or heal and fields['_waitForAttackEvent']==1 or
                 fields['_waitForAttackEvent']==0 and actor['type'] in (A+'MeleeAttack',A+'MultiMeleeAttack')),
                'unsupported-mode-attack-predelay')
        require(type(fields.get('_additionalTimes',0)) is int and 0<=fields.get('_additionalTimes',0)<=31,
                'unsupported-static-repeat-count')
        require(fields.get('_addSpellCntToLastSignalId',0) in (0,1),'unsupported-repeat-signal-policy')
        require(numeric(fields.get('_triggerDelta',0)) and fields.get('_triggerDelta',0)>=0
                and fields.get('_onlyTrigAudioSignalForFirstOne',0) in (0,1)
                and fields.get('_addSpellCntToSignalId',0) in (0,1),'unsupported-repeat-control')
        for row in mode['roles']['_attack']:
            if row is actor:continue
            if ammo_counter and row['type']==A+'AbilityEventCounter' and row['node_id']==ammo_counter['nodeId']:continue
            if row['type']==A+'UberEffectEmitter':self.visual(row,'mode/attack/emitter',base)
            elif row['type']==A+'ThreePartOneshotAnimation':self.oneshot(row,base)
            elif row['type']==A+'UpdateAtkScaleByTraitData':
                require(any(clean(row['fields'])==clean(proto) for proto in self.prototypes[row['type']]),'unsupported-trait-scale')
            else:raise Rejected('unsupported-mode-attack-sibling','mode/_attack',row['type'])
        trigger=exactly_one(mode['roles']['_attackTrigger'],C+'SelectorTrigger','mode/_attackTrigger')
        shape(trigger['fields'],self.prototypes[C+'SelectorTrigger'][0],path='mode/trigger')
        selectors=[r for r in mode['roles']['_attackTrigger'] if 'Selector' in r['type'] and r is not trigger]
        require(len(selectors)==1,'ambiguous-mode-selector');trigger_selector=selectors[0]
        own=mode['actorSelectors'].get(fields['_selector']['m_PathID'])
        if own:
            selector=next((r for r in own if r['node_id']==fields['_selector']['m_PathID']),None)
            require(selector is not None,'missing-resolved-attack-selector')
            # An explicit actor selector can share the trigger's owner or be a
            # dedicated range selector. Every extra component is still checked.
            for row in own:
                if row['node_id'] in {r['node_id'] for r in mode['roles']['_attackTrigger']}:continue
                if row is selector:continue
                require(row['type']==C+'AutoLoadBoxRange','unsupported-actor-selector-companion',actual=row['type'])
                shape(row['fields'],self.prototypes[C+'AutoLoadBoxRange'][0],('_extendable',),path='mode/actor-range')
                require(row['fields']['_extendable'] in (0,1),'unsupported-range-extension-policy')
        else:selector=trigger_selector
        sel=selector['fields']
        require(selector['type'] in self.prototypes,'unsupported-selector-type','mode/selector',selector['type'])
        selvars={'_targetMotion','_targetSide','_postFilter','_maxNum','_maxTargetKey','_maxHpRatio','_limitTargetNum',
                 '_abnormalFlag','_abnormalCombo','_limitedMaxTargetNumToBlockedCnt','_secondaryFilter','_filterTag',
                 '_filerMaxHp','_filterMinHp','_minHpRatio'}
        shape_any(sel,self.prototypes[selector['type']],selvars,'mode/selector')
        require(sel['_onlyIgnoreSomeOfTargetFreeCase']==0 and type(sel['_abnormalFlag']) is int
                and sel['_abnormalFlag']>=0 and type(sel['_abnormalCombo']) is int
                and sel['_abnormalCombo']>=0,'conditional-target-free-filter')
        require(sel.get('_limitedMaxTargetNumToBlockedCnt',0) in (0,1),'unsupported-block-target-limit')
        require(sel.get('_secondaryFilter',0) in (0,1,2) and
                (sel.get('_secondaryFilter',0)!=2 or isinstance(sel.get('_filterTag'),str) and bool(sel['_filterTag'])),
                'unsupported-secondary-target-filter')
        require(sel.get('_secondaryFilter')!=1 or sel['_limitTargetNum']==1 and sel['_maxNum']==1
                and sel.get('_sortByTauntAtLast',0)==0,'unsupported-ranged-priority-budget')
        if selector['node_id']!=trigger_selector['node_id']:
            ts=trigger_selector['fields']
            require(trigger_selector['type'] in self.prototypes,'unsupported-trigger-selector-type')
            shape_any(ts,self.prototypes[trigger_selector['type']],selvars,'mode/trigger-selector')
            require(ts['_onlyIgnoreSomeOfTargetFreeCase']==0,'conditional-trigger-target-free-filter')
            require(ts['_targetSide']==sel['_targetSide'] and ts['_targetMotion']==sel['_targetMotion']
                    and ts['_targetCategory']==sel['_targetCategory'] and ts['_postFilter']==sel['_postFilter'],
                    'different-trigger-and-attack-target-domains')
        require(sel['_targetSide']==(1 if heal else 2) and (sel['_postFilter'] in ((3,) if heal else (4,6,9))
                or not heal and sel['_postFilter']==0 and sel['_limitTargetNum']==0 and not sel.get('_limitedMaxTargetNumToBlockedCnt'))
                and sel['_targetMotion'] in (1,3) and sel['_limitTargetNum'] in (0,1),'unsupported-selector-filter')
        require(not heal or sel['_limitTargetNum']==1,'unlimited-healing-selector')
        require(fields['_selector']['m_PathID'] in ('0',selector['node_id']) and fields['_selector']['m_FileID']==0,
                'unresolved-attack-selector-reference')
        for row in mode['roles']['_attackTrigger']:
            if row is trigger or row is trigger_selector:continue
            require(row['type']==C+'AutoLoadBoxRange','unsupported-selector-companion',actual=row['type'])
            shape(row['fields'],self.prototypes[C+'AutoLoadBoxRange'][0],('_extendable',),path='mode/range')
            require(row['fields']['_extendable'] in (0,1),'unsupported-range-extension-policy')
        keys={b['key'] for b in skill['levels'][0]['blackboard']}
        def expr(key,default):
            if key in keys:consumed.add(key);return {'key':key}
            require(numeric(default),'non-numeric-attack-default',key,default)
            return {'constant':default}
        trait=[r['fields'] for r in mode['roles']['_attack'] if r['type']==A+'UpdateAtkScaleByTraitData']
        hits=1+fields.get('_additionalTimes',0)
        if 'attack@times' in keys:
            require(actor['type'] in (A+'MultiMeleeAttack',A+'MultiRangedAttack') and
                all(re.search(r'\{attack@times\}(?:</>)?连(?:射|击)',level['description']) for level in skill['levels']),
                'repeat-parameter-without-description-contract')
            consumed.add('attack@times');hits={'key':'attack@times'}
        plan=dict(kind='single' if sel['_limitTargetNum'] else 'rangeAll',damageType='arts' if heal else {1:'phys',2:'arts'}[fields['_damageType']],
                  hits=hits,targets=expr('attack@'+sel['_maxTargetKey'],sel['_maxNum']),
                  scale=expr('attack@'+fields.get('_atkScaleKey','atk_scale'),fields.get('_atkScale',1)),
                  rangedScale=round(trait[0]['_defaultValue'],6) if trait else 1)
        if fields['_preDelay']>0 and not heal:plan.update(delivery='direct',attackPreDelay=fields['_preDelay'])
        if heal and fields['_preDelay']>0:
            from skill_mode_flow import healing_timing
            plan['healTiming']=healing_timing(self,fields,base)
        if chain:
            require(not heal and actor['type']==A+'RangedAttack' and fields['_waitForProjectileInvalid']==1
                    and sel['_limitTargetNum']==1 and sel['_maxNum']==1,'unsupported-chain-primary-selector')
            count_key='attack@'+chain['countKey']
            if count_key in keys:count={'key':count_key};consumed.add(count_key)
            else:
                count=(trait_bindings or {}).get(chain['countKey'])
                require(count is not None,'missing-chain-count-trait')
                require(all(re.search(r'\{attack@max_target\}.*个敌人间跳跃',c['overrideDescripton'] or '')
                        for c in self.characters[count['source']['charId']]['trait']['candidates']),
                        'chain-count-without-source-description')
            decay=dict(traitKey='attack@chain.atk_scale',default=chain['decay'],useDefaultWhenMissing=True) if chain['useChainPrefix'] else dict(constant=chain['decay'])
            plan.update(kind='chain',targets={'constant':1},chainCount=deepcopy(count),chainDecay=decay,
                        chainRadius=chain['radius'],repeatChain=False)
        if fields.get('_activeBuffs'):
            require(not heal,'unsupported-heal-mode-hit-buff')
            try:plan['hitBuffs']=self.hit_buffs.compile(fields['_activeBuffs'],skill['levels'],
                    actor['type'] in (A+'RangedAttack',A+'MultiRangedAttack'),consumed,trait_bindings)
            except ProjectileRejected as error:raise Rejected('unsupported-mode-hit-buff',error.category,error.detail) from error
            if 'attack@buff_prob' in keys:
                require(actor['type']==A+'MeleeAttack' and hits==1 and len(plan['hitBuffs'])==1
                    and plan['hitBuffs'][0]['phase']=='after-body'
                    and all(re.search(r'\{attack@buff_prob[^}]*\}.*概率.*命中目标',level['description']) for level in skill['levels']),
                    'unsupported-mode-hit-probability-contract')
                require(all(numeric(b['value']) and 0<=b['value']<=1 for level in skill['levels']
                    for b in level['blackboard'] if b['key']=='attack@buff_prob'),'invalid-mode-hit-probability')
                consumed.add('attack@buff_prob');plan['hitBuffs'][0]['chance']={'key':'attack@buff_prob'}
                plan['hitBuffs'][0]['source']['probabilityPolicy']={
                    'binding':'Inferred from complete source blackboard plus every CN level description',
                    'draw':'one independent draw per target after body; probability 0/1 requires no draw',
                    'nativeRandomCorrelation':'unverified'}
        selection=dict(groundOnly=sel['_targetMotion']==1,blockedFirst=selector['type'].startswith(C+'BlockedOrAdvancedSelector'),
                       blockCountLimit=bool(sel.get('_limitedMaxTargetNumToBlockedCnt',0)),
                       priorityTag=sel.get('_postSortTag') or (sel.get('_filterTag') if sel.get('_secondaryFilter')==2 else None),
                       order='hp-ratio-ascending' if heal else 'defense-ascending' if sel['_postFilter']==9 else 'hatred-descending')
        if sel['_postFilter']==6:selection['airFirst']=True
        if sel.get('_secondaryFilter')==1:selection['priorityApplyWay']='ranged'
        if 'WithinHpRatio' in selector['type']:
            require(sel['_filerMaxHp'] in (0,1) and sel['_filterMinHp'] in (0,1)
                    and numeric(sel['_maxHpRatio']) and 0<=sel['_maxHpRatio']<=1
                    and numeric(sel['_minHpRatio']) and 0<=sel['_minHpRatio']<=1,'invalid-hp-filter')
            if sel['_filerMaxHp']:selection['hpMax']=round(sel['_maxHpRatio'],6)
            if sel['_filterMinHp']:selection['hpMin']=round(sel['_minHpRatio'],6)
            require(selection.get('hpMin',0)<=selection.get('hpMax',1),'invalid-hp-filter')
        return 'heal' if heal else 'attack',plan,selection,actor,selector
