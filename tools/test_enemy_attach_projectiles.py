import unittest
from copy import deepcopy
from enemy_attach_projectiles import load_attach_candidates,compile_attach_attack

class AttachedBodyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.c=next(iter(load_attach_candidates().values()))
    def test_complete_both_channels(self):
        r=compile_attach_attack(self.c);self.assertTrue(r['accepted'],r)
        p=r['attachedProjectile'];self.assertEqual(p['channels'],['combat','attack'])
        self.assertEqual(p['action']['damageType'],'phys');self.assertEqual(p['projectile']['delay'],3)
        self.assertEqual(p['selector']['range']['default'],2);self.assertFalse(p['projectile']['forceTraceHit'])
    def test_incomplete_mode(self):
        c=deepcopy(self.c);del c['modeBindings']['modes'][0]['channels']['combat'];self.assertFalse(compile_attach_attack(c)['accepted'])
    def test_unknown_sibling(self):
        c=deepcopy(self.c);c['sourceRelatedComponents'].append(c['sourceRelatedComponents'][0]);self.assertFalse(compile_attach_attack(c)['accepted'])
    def test_changed_action_rejected(self):
        for key,value in [('_damageType',999),('_followUnexpected',1),('_waitForProjectileInvalid',1)]:
            c=deepcopy(self.c);c['sourceAction']['fields'][key]=value
            for ch in c['modeBindings']['modes'][0]['channels'].values():ch['fields'][key]=value
            self.assertFalse(compile_attach_attack(c)['accepted'],key)
    def test_missing_owned_component(self):
        c=deepcopy(self.c);c['projectileGraph']['nodes'].pop(next(iter(c['projectileGraph']['nodes'])));self.assertFalse(compile_attach_attack(c)['accepted'])
    def test_cross_snapshot_mismatch(self):
        c=deepcopy(self.c);c['sourceRelatedComponents'][0]['fields']['_keepTarget']=1;self.assertFalse(compile_attach_attack(c)['accepted'])
    def test_no_id_dispatch(self):
        c=deepcopy(self.c);c['modeBindings']['enemyId']='source-equivalent-test';self.assertTrue(compile_attach_attack(c)['accepted'])

if __name__=='__main__':unittest.main()
