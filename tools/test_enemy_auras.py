import copy
import unittest

from enemy_auras import (load_aura_candidates,compile_enemy_aura,read,TEMPLATES,AURA,PASSIVE,
    CIRCLE,APPEAR,STATUS_SOURCE)


class EnemyAuraContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources=load_aura_candidates()['enemies'];cls.good=next(iter(cls.sources.values()))
        cls.templates=read(TEMPLATES)

    def mutated(self):return copy.deepcopy(self.good)

    def reject(self,c,t=None):
        result=compile_enemy_aura(c,t or self.templates)
        self.assertFalse(result['accepted'],result)

    def change_field(self,c,typ,key,value):
        pid,row=next((pid,r) for pid,r in c['cnComponents'].items() if r['type']==typ)
        row['fields'][key]=value;c['graph']['nodes'][pid]['fields'][key]=copy.deepcopy(value)

    def test_whole_two_member_family(self):
        for eid,c in self.sources.items():
            result=compile_enemy_aura(c,self.templates);self.assertTrue(result['accepted'],result)
            p=result['enemyAura'];self.assertEqual(p['range']['radius'],.5)
            self.assertTrue(result['modes']['0']['sourceNoBasicAttack'])
            self.assertEqual(result['initialMode'],0)
            self.assertEqual(p['damage']['scale']['default'],1)
            self.assertEqual(p['damageEvent']['ratio']['default'],.05)
            self.assertEqual(p['selfResistance']['value']['default'],-.5)

    def test_identity_not_whitelist(self):
        c=self.mutated();c['enemyId']='synthetic-complete-same-structure'
        self.assertTrue(compile_enemy_aura(c,self.templates)['accepted'])

    def test_unknown_component_field_even_zero(self):
        c=self.mutated();self.change_field(c,AURA,'_unknownGameplayFlag',0);self.reject(c)

    def test_missing_dependency_and_external_validator(self):
        for kind in ('component','reference'):
            c=self.mutated()
            if kind=='component':
                pid=next(pid for pid,r in c['cnComponents'].items() if r['type']==CIRCLE)
                del c['graph']['nodes'][pid]
            else:self.change_field(c,AURA,'_targetValidator',{'m_FileID':1,'m_PathID':123})
            self.reject(c)

    def test_extra_enabled_talent_component(self):
        c=self.mutated();n=copy.deepcopy(next(n for n in c['graph']['nodes'].values() if n['unityType']=='MonoBehaviour'))
        n['pathId']='100000';c['graph']['nodes']['100000']=n;self.reject(c)

    def test_range_root_and_collider_contracts(self):
        for kind in ('rootScale','radius','offset','rangeOverride'):
            c=self.mutated()
            if kind=='rootScale':c['rootTransform']['fields']['m_LocalScale']['x']=2
            elif kind=='rangeOverride':self.change_field(c,APPEAR,'_applyTalentRange',1)
            else:
                f=next(n['fields'] for n in c['graph']['nodes'].values() if n['unityType']=='CircleCollider2D')
                if kind=='radius':f['m_Radius']=0
                else:f['m_Offset']['x']=1
            self.reject(c)

    def test_unknown_template_action_rejects_whole_chain(self):
        t=copy.deepcopy(self.templates);row=t['enemy_dsubrl_aoe[aura]']['eventToActions']['_items'][0]['value']
        row['decodedActions'].append({'$type':'UnknownGameplay'})
        self.reject(self.good,t)

    def test_source_event_and_lifetime_cannot_be_dropped(self):
        t=copy.deepcopy(self.templates);t['trap_creep_ep_damage']['eventToActions']['_items'][0]['key']=10
        self.reject(self.good,t)
        c=self.mutated();pid,row=next((pid,r) for pid,r in c['cnComponents'].items() if r['type']==AURA)
        row['fields']['_buffs'][0]['disableOverride']=0
        c['graph']['nodes'][pid]['fields']['_buffs'][0]['disableOverride']=0;self.reject(c)

    def test_parameter_inheritance_and_exact_namespace(self):
        c=self.mutated();c['levels'].append({'level':1,'enemyData':{'talentBlackboard':None}})
        self.assertTrue(compile_enemy_aura(c,self.templates)['accepted'])
        c['levels'][0]['enemyData']['talentBlackboard'][0]['key']='unrelated.one_minus_status_resistance';self.reject(c)

    def test_changed_level_parameter_requires_complete_binding(self):
        c=self.mutated();level=copy.deepcopy(c['levels'][0]);level['level']=1
        level['enemyData']['talentBlackboard'][0]['value']=-.8;c['levels'].append(level);self.reject(c)

    def test_ordinary_output_cannot_be_suppressed_without_empty_graph(self):
        for field,value in (('_activeBuffs',[{}]),('_animKey','Attack')):
            c=self.mutated();s=c['ordinarySource']
            pid,row=next((pid,r) for pid,r in s['cnComponents'].items() if r['type'].endswith('EmptyAnimatedAbility'))
            row['fields'][field]=value;s['nodes'][pid]['fields'][field]=value;self.reject(c)

    def test_extra_mode_and_disconnected_root_reject(self):
        c=self.mutated();s=c['ordinarySource']
        pid,row=next((pid,r) for pid,r in s['cnComponents'].items() if r['type'].endswith('.Enemy'))
        row['fields']['_modes'].append({'m_FileID':0,'m_PathID':123})
        s['nodes'][pid]['fields']['_modes'].append({'m_FileID':0,'m_PathID':'123'});self.reject(c)
        c=self.mutated();c['rootTransform']['pathId']='123';self.reject(c)

    def test_override_metadata_is_required_and_structural(self):
        self.assertFalse(compile_enemy_aura(self.good,self.templates,{})['accepted'])
        status=read(STATUS_SOURCE)['buff'];c=self.mutated();status['buffKey']='synthetic_status'
        for pid,row in c['cnComponents'].items():
            if row['type']==PASSIVE and row['fields']['_buffs'][0]['attributes']['attributeModifiers']:
                row['fields']['_buffs'][0]['overrideKey']='synthetic_status'
                c['graph']['nodes'][pid]['fields']['_buffs'][0]['overrideKey']='synthetic_status'
        result=compile_enemy_aura(c,self.templates,{'synthetic_status':status})
        self.assertTrue(result['accepted'],result)
        self.assertEqual(result['enemyAura']['statusOverrides']['synthetic_status']['priority'],-1)
        status['disableOverride']=True
        self.assertFalse(compile_enemy_aura(c,self.templates,{'synthetic_status':status})['accepted'])


if __name__=='__main__':unittest.main()
