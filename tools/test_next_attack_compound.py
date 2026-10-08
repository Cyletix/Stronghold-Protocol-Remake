import json
import unittest
from copy import deepcopy
from build_next_attack_skill_data import ROOT,PATHS
from next_attack_compiler import compile_replacement,Rejected
from next_attack_compound import GROUP,LISTENER,HEAL
from next_attack_hit_buffs import HitBuffCompiler

class CompoundTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        graph,skills=[json.loads((ROOT/p).read_text(encoding='utf-8')) for p in PATHS[:2]]
        cls.rows=graph['rejections']['skchr_blemsh_1']['components'];cls.levels=skills['skchr_blemsh_1']['levels']
        cls.templates=json.loads((ROOT/PATHS[5]).read_text(encoding='utf-8'))
    def compile(self,rows=None,levels=None,templates=None):
        levels=deepcopy(levels or self.levels)
        for lv in levels:lv['prefabId']='source-equivalent-fixture'
        return compile_replacement('source-equivalent-fixture',rows or self.rows,levels,['fixture'],None,HitBuffCompiler(templates or self.templates))
    def test_complete_levels_not_id_dispatch(self):
        p=self.compile();self.assertEqual(p['levelCount'],10);self.assertEqual(p['hits'],1)
        self.assertEqual(p['spellExtras'][0]['event'],'ON_ABILITY_SPELL_ON');self.assertEqual(p['blackboardKeys'],['atk_scale','ct','heal_scale'])
    def test_unknown_sibling_and_control(self):
        for change in ['sibling','child','control']:
            rows=deepcopy(self.rows);group=next(r for r in rows if r['type']==GROUP)
            if change=='sibling':rows.append(dict(rows[0],node_id='extra',type='UnknownAbility'))
            elif change=='child':group['fields']['_abilities'].append(group['fields']['_abilities'][0])
            else:group['fields']['_finishAllAbilitiesIfOneFinish']=1
            with self.assertRaises(Rejected):self.compile(rows)
    def test_alias_and_controller_reference(self):
        for kind in [HEAL,LISTENER]:
            rows=deepcopy(self.rows);r=next(r for r in rows if r['type']==kind)
            if kind==HEAL:r['fields']['_metadata']['namedAsAlias']='wrong'
            else:r['fields']['m_GameObject']['m_PathID']='orphan'
            with self.assertRaises(Rejected):self.compile(rows)
    def test_event_once_and_source_actions(self):
        key=next(r for r in self.rows if r['type']==LISTENER)['fields']['_buffs'][0]['templateKey']
        for mutation in ['event','actions']:
            templates=deepcopy(self.templates);event=templates[key]['eventToActions']['_items'][0]
            if mutation=='event':event['key']=21
            else:event['value']['decodedActions'].pop()
            with self.assertRaises(Rejected):self.compile(templates=templates)
    def test_all_levels_values_and_consumption(self):
        for mutation in ['scale','unknown','range']:
            levels=deepcopy(self.levels)
            if mutation=='scale':next(b for b in levels[9]['blackboard'] if b['key']=='heal_scale')['value']=-1
            elif mutation=='range':levels[9]['rangeId']=None
            else:levels[9]['blackboard'].append(dict(key='extra',value=1))
            with self.assertRaises(Rejected):self.compile(levels=levels)

if __name__=='__main__':unittest.main()
