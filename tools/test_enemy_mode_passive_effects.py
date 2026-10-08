import unittest
from copy import deepcopy
from enemy_mode_passive_effects import compile_passive_effects, DAMAGE_DEFAULTS, DAMAGE_TYPE


def graph():
    return dict(declarationComplete=True, bindingStatus='matched-pinned-template',
        fields=dict(templateKey='fixture', blackboard=[], attributes=dict(abnormalFlags=[], abnormalImmunes=[],
            abnormalAntis=[], abnormalCombos=[], abnormalComboImmunes=[], attributeModifiers=[
                dict(attributeType=2, formulaItem=1, value=0, loadFromBlackboard=1, fetchBaseValueFromSourceEntity=0),
                dict(attributeType=3, formulaItem=1, value=0, loadFromBlackboard=1, fetchBaseValueFromSourceEntity=0)])),
        payload=dict(templateKey='fixture', onEventPriority='DEFAULT', effectKey='', eventToActions={
            'ON_OUTPUT_DAMAGE': [{'$type': DAMAGE_TYPE+', Assembly-CSharp', **DAMAGE_DEFAULTS}]}))


def compile_graph(g):
    return compile_passive_effects(g, [0, 1], 0, target_binding={'scope':'TARGET', 'binding':'owner'})


class PassiveEffectsTests(unittest.TestCase):
    def test_complete_defense_resistance_and_output_listener(self):
        source=graph(); before=deepcopy(source); result=compile_graph(source)
        self.assertTrue(result['accepted'])
        self.assertEqual([item.get('stat') for item in result['effects']], ['def','magic_resistance',None])
        self.assertEqual(result['effects'][2]['value'], {'key':'damage_scale','default':1})
        self.assertEqual(result['events'], {'ON_BUFF_START':[], 'ON_BUFF_FINISH':[]})
        self.assertEqual(source,before)

    def test_local_zero_is_retained_and_unknown_sibling_refuses_all_effects(self):
        source=graph();source['fields']['blackboard']=[{'key':'damage_scale','value':0}]
        self.assertEqual(compile_graph(source)['effects'][2]['value']['local'],0)
        source['payload']['eventToActions']['ON_OUTPUT_DAMAGE'].append({'$type':'Unknown'})
        result=compile_graph(source)
        self.assertFalse(result['accepted']);self.assertEqual(result['effects'],[]);self.assertEqual(result['events'],{})

    def test_filtered_damage_and_unknown_attribute_are_not_dropped(self):
        for change in ('filter','attribute','abnormal'):
            source=graph()
            if change=='filter':source['payload']['eventToActions']['ON_OUTPUT_DAMAGE'][0]['_filterDamageType']=True
            if change=='attribute':source['fields']['attributes']['attributeModifiers'][0]['formulaItem']=3
            if change=='abnormal':source['fields']['attributes']['abnormalFlags']=[1]
            self.assertFalse(compile_graph(source)['accepted'])

if __name__=='__main__':unittest.main()
