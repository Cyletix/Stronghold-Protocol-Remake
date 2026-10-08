"""Pure boundaries: planning must not promote raw values or mounting into execution."""
import unittest
from enemy_mode_selection_plan import analyze_selection


def record(fields=None):
    return dict(enemyId='enemy_fixture',entities=[{'componentKey':'entity'}],
        modes=[dict(modeIndex=0,status='resolved',targetComponentKey='mode0'),dict(modeIndex=1,status='resolved',targetComponentKey='mode1')],
        components={'provider':dict(scriptType='Torappu.Battle.Abilities.BuffToOwner',fields=fields or {})},
        references=[],entrypoints=[],switchNodes=[],modeBlackboardEntries=[],cachedChannels={'modes':[]})


class SelectionBoundaries(unittest.TestCase):
    def test_template_name_is_only_a_reference(self):
        r=record({'_buffs':[dict(templateKey='switch_mode_no_restore',blackboard=[dict(key='mode',value=1.0)])]})
        r['modeBlackboardEntries']=[dict(componentKey='provider',fieldPath='/_buffs/0/blackboard/0',fields=dict(key='mode',value=1.0))]
        p=analyze_selection(r,{})
        b=p['components']['blackboardBindings'][0]
        self.assertEqual(b['ownModeTarget']['modeIndex'],1)
        self.assertEqual(b['consumerStatus'],'unresolved')
        self.assertFalse(p['implementationReady'])
        self.assertIn('resolve-buff-template-graph',p['sharedOperators'])

    def test_mounting_and_call_path_remain_distinct(self):
        r=record({'_buffs':[dict(blackboard=[dict(key='mode',value=0)])]})
        r['modeBlackboardEntries']=[dict(componentKey='provider',fieldPath='/_buffs/0/blackboard/0',fields=dict(key='mode',value=0))]
        own=dict(status='matched-entity-and-mode-anchors',components={'provider':dict(ownershipOverlayEligible=True,hierarchyStatus='resolved',modeIndicesFromAncestorGameObjects=[0])})
        a=analyze_selection(r,own)
        self.assertEqual(a['components']['blackboardBindings'][0]['provider']['evidenceStage'],'structurally-mounted')
        r['entrypoints']=[dict(status='resolved',targetComponentKey='provider',kind='mode-field',modeIndex=0)]
        b=analyze_selection(r,own)
        self.assertEqual(b['components']['blackboardBindings'][0]['provider']['evidenceStage'],'entry-linked')
        self.assertFalse(b['implementationReady'])

    def test_invalid_mode_is_not_rounded_and_unrelated_switch_is_not_consumer(self):
        r=record({'_buffs':[dict(blackboard=[dict(key='mode',value=0.5)])],
                  '_other':{'$type':'Torappu.Battle.Action.Nodes+SwitchMode','_loadModeFromBlackboard':True}})
        r['modeBlackboardEntries']=[dict(componentKey='provider',fieldPath='/_buffs/0/blackboard/0',fields=dict(key='mode',value=0.5))]
        p=analyze_selection(r,{})
        self.assertIn('mode-parameter-invalid-or-ambiguous-index',p['subclasses'])
        self.assertEqual(p['components']['blackboardBindings'][0]['explicitInlineConsumers'],[])

    def test_birth_zero_does_not_close_later_transition_and_enemy_skill_is_not_basic_skill(self):
        r=record();r['components']['skill']=dict(scriptType='Torappu.Battle.EnemySkill',fields={'_trigger':{'m_PathID':123,'m_FileID':0}})
        own=dict(status='matched-entity-and-mode-anchors',initialModeZeroEvidence={'candidate':True},components={})
        p=analyze_selection(r,own)
        self.assertIn('default-mode-negative-getters-zero-candidate',p['subclasses'])
        self.assertIn('subsequent-mode-transition-invocation-absent',p['missingLinks'])
        self.assertEqual(p['components']['defaultModeGetters'],[])
        self.assertEqual(len(p['components']['skillTriggers']),1)


if __name__=='__main__':
    unittest.main()
