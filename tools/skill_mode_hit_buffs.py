"""Finite on-hit mode statuses using the existing complete Buff validators.

Mode attack blackboards occupy the source ``attack@`` namespace. Missing
duration/value bindings reject the mode; they do not inherit guessed defaults.
"""
from copy import deepcopy

from direct_skill_compiler import BuffCompiler
from next_attack_compiler import Rejected, contract, digest, finite, require
from next_attack_hit_buffs import HitBuffCompiler, BUFF_FIXED, ATTRS


class ModeHitBuffCompiler:
    def __init__(self, templates, database):
        self.templates=templates
        self.shared=HitBuffCompiler(templates,database)
        self.inline=BuffCompiler(templates,database)

    def compile(self, buffs, levels, ranged, consumed, fallback=None, namespace='attack@'):
        require(isinstance(buffs,list),'mode-hit-buff','Buff list required')
        require(namespace in ('attack@',''),'mode-hit-buff','Unsupported source blackboard namespace')
        keys={b['key'] for b in levels[0]['blackboard']}
        result=[];seen=set();fallback=fallback or {}
        for buff in buffs:
            if buff.get('loadFromDB'):
                effects=self.shared.compile([buff])
            elif buff.get('lifeTimeType')==1 and buff.get('attributes',{}).get('abnormalFlags')==[0]:
                effects=self.inline.compile(buff,'target')
            else:
                effects=self.attribute_multiplier(buff)
            require(len(effects)==1 and effects[0]['kind'] in ('stun','movement-multiplier','attack-multiplier'),
                    'mode-hit-buff','only finite source status bodies')
            effect=deepcopy(effects[0]);key=effect['key']
            require(isinstance(key,str) and key and key not in seen,'mode-hit-buff','duplicate or absent Buff identity')
            seen.add(key)
            for field in ('durationKey','valueKey'):
                if field not in effect:continue
                raw=effect[field]
                prefix=key+'.' if buff.get('stripBlackboardParamsWithBuffKey') else ''
                scoped=namespace+prefix+raw
                if scoped in keys:
                    effect[field]=scoped;consumed.add(scoped)
                else:
                    expr=fallback.get(raw)
                    require(isinstance(expr,dict) and (finite(expr.get('constant')) or
                            isinstance(expr.get('traitKey'),str) and finite(expr.get('default'))) and expr.get('source'),
                            'mode-hit-buff','missing attack parameter '+scoped)
                    effect.pop(field)
                    require(field=='durationKey' or 'constant' in expr,'mode-hit-buff','trait-derived scalar needs a separate formula contract')
                    effect[field[:-3]]=deepcopy(expr) if 'traitKey' in expr else expr['constant']+(1 if field=='valueKey' else 0)
                    effect.setdefault('source',{})['inherited'+field]=deepcopy(expr)
            effect.setdefault('source',{}).update(buffSha256=digest(buff),blackboardNamespace=namespace,
                stripBlackboardParamsWithBuffKey=bool(buff.get('stripBlackboardParamsWithBuffKey')))
            effect['phase']='before-body' if ranged else 'after-body'
            for level in levels:
                bb={b['key']:b['value'] for b in level['blackboard']}
                duration=bb.get(effect.get('durationKey')) if 'durationKey' in effect else effect.get('duration')
                if isinstance(duration,dict):duration=duration['default']
                value=1+bb.get(effect['valueKey'],float('nan')) if 'valueKey' in effect else effect.get('value')
                require(finite(duration) and duration>0 and (effect['kind']=='stun' or finite(value) and 0<=value<1),
                        'mode-hit-buff','invalid finite status value/duration')
            result.append(effect)
        return result

    def attribute_multiplier(self,buff):
        fixed=dict(BUFF_FIXED,lifeTimeType=1,triggerLifeType=0,triggerCnt=0,triggerInterval=-1,firstTriggerInterval=-1)
        for key in ('attributes','durationKey','overrideEffectKey','stripBlackboardParamsWithBuffKey'):fixed.pop(key)
        contract(buff,fixed,{'buffKey','templateKey','attributes','durationKey','overrideEffectKey',
                            'stripBlackboardParamsWithBuffKey'},'finite mode attribute Buff')
        require(isinstance(buff['durationKey'],str) and isinstance(buff['overrideEffectKey'],str),
                'mode-hit-buff','attribute duration/effect reference')
        require(type(buff['stripBlackboardParamsWithBuffKey']) is int and buff['stripBlackboardParamsWithBuffKey'] in (0,1),
                'mode-hit-buff','unknown Buff blackboard namespace')
        attrs=buff['attributes']
        contract(attrs,{k:[] for k in ATTRS if k!='attributeModifiers'},{'attributeModifiers'},'finite attributes')
        modifiers=attrs['attributeModifiers']
        require(len(modifiers)==1,'mode-hit-buff','one finite attribute modifier')
        contract(modifiers[0],{'formulaItem':3,'value':0,'loadFromBlackboard':1,
                              'fetchBaseValueFromSourceEntity':0},{'attributeType'},'attribute final scaler')
        supported={1:('attack-multiplier','atk'),6:('movement-multiplier','move_speed')}
        attribute=modifiers[0]['attributeType']
        require(type(attribute) is int and attribute in supported,'mode-hit-buff','unsupported final-scaler attribute')
        kind,value_key=supported[attribute]
        template=self.shared._empty_template(buff['templateKey'])
        return [dict(kind=kind,key=buff['buffKey'],durationKey=buff['durationKey'] or 'duration',
                     valueKey=value_key,independentSource=False,
                     source=dict(templateSha256=digest(template),buffSha256=digest(buff)))]
