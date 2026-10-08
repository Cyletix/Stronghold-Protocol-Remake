"""Complete ordinary chain-lightning subtrees, shared by operator providers.

Only the already-cached projectile graph is read. Character trait/skill BB
inheritance is the caller's contract. Nearest-target ties and same-frame hops
remain the simulator's explicit model, not recovered native scheduling.
"""
from copy import deepcopy

from enemy_chain_projectiles import (CHAIN, MOVEMENT, SIMPLE, SELECTOR,
    FIXED_FIELDS, VARIABLE_FIELDS, VISUAL_FIELDS, UNITY_FIELDS)
from next_attack_compiler import contract, digest, finite, local_ref, require

CIRCLE = 'Torappu.Battle.CircleRange'
REQUIRED = {CHAIN, MOVEMENT, SIMPLE, SELECTOR, CIRCLE}


def compile_chain(compiler, key):
    cache = getattr(compiler, '_operator_chain_cache', None)
    if cache is None:
        cache = compiler._operator_chain_cache = {}
    if key in cache:
        return deepcopy(cache[key])
    nodes, roots = compiler.bundle['nodes'], compiler.assets.get(key, [])
    require(len(roots) == 1 and local_ref(roots[0]), 'chain-projectile', key + ': root')
    root = roots[0]
    seen, transforms, components, colliders = set(), {}, [], []

    def node(ref):
        require(local_ref(ref) and str(ref['m_PathID']) in nodes,
                'chain-projectile', key + ': unresolved reference')
        return nodes[str(ref['m_PathID'])]

    def visit(ref):
        go = node(ref)
        require(go['unityType'] == 'GameObject' and go['fields'].get('m_IsActive') == 1,
                'chain-projectile', key + ': inactive owner')
        pid = str(go['pathId'])
        require(pid not in seen, 'chain-projectile', key + ': repeated owner')
        seen.add(pid)
        for reference in go['fields']['m_Component']:
            c = node(reference['component']); f = c['fields']
            require(f.get('m_GameObject') == ref, 'chain-projectile', key + ': component owner')
            if c['unityType'] == 'Transform':
                require(f['m_LocalScale'] == dict(x=1, y=1, z=1), 'chain-projectile', key + ': scaled range')
                if ref != root:
                    require(f['m_LocalPosition'] == dict(x=0, y=0, z=0), 'chain-projectile', key + ': displaced range')
                transforms[str(c['pathId'])] = deepcopy(c)
                for child in f.get('m_Children', []):
                    visit(node(child)['fields']['m_GameObject'])
            elif c['unityType'] == 'CircleCollider2D':
                colliders.append(deepcopy(c))
            elif c['unityType'] == 'MonoBehaviour':
                name = compiler.script_types.get(str(f.get('m_Script', {}).get('m_PathID')))
                require(name in REQUIRED | set(VISUAL_FIELDS) and f.get('m_Enabled') == 1,
                        'chain-projectile', key + ': unsupported component ' + str(name))
                body = {k: v for k, v in f.items() if k not in UNITY_FIELDS}
                fixed = dict(FIXED_FIELDS.get(name, {}))
                variable = set(VARIABLE_FIELDS.get(name, VISUAL_FIELDS.get(name, set())))
                if name == CHAIN:
                    fixed.pop('_useChainPrefix'); variable.add('_useChainPrefix')
                contract(body, fixed, variable, name)
                components.append(dict(nodeId=str(c['pathId']), type=name, fields=deepcopy(f)))
            else:
                require(False, 'chain-projectile', key + ': unsupported Unity component ' + c['unityType'])

    visit(root)
    typed = {name: [c for c in components if c['type'] == name] for name in REQUIRED | set(VISUAL_FIELDS)}
    require(all(len(typed[name]) == 1 for name in REQUIRED) and all(len(typed[name]) <= 1 for name in VISUAL_FIELDS)
            and len(colliders) == 1, 'chain-projectile', key + ': ambiguous graph')
    hit, movement, simple, selector, circle = [typed[t][0] for t in (CHAIN, MOVEMENT, SIMPLE, SELECTOR, CIRCLE)]
    h, m, s, sel = [r['fields'] for r in (hit, movement, simple, selector)]
    require(all(row['fields']['m_GameObject'] == root for row in (hit, movement, simple)),
            'chain-projectile', key + ': nested gameplay owner')
    require(local_ref(h['_selector']) and str(h['_selector']['m_PathID']) == selector['nodeId'],
            'chain-projectile', key + ': selector reference')
    require(h['_useChainPrefix'] in (0, 1) and finite(h['_atkScale']) and 0 <= h['_atkScale'] <= 1,
            'chain-projectile', key + ': unsupported attenuation')
    require(local_ref(h['_rangeToLoad'], nonzero=False) and
            str(h['_rangeToLoad']['m_PathID']) in ('0', circle['nodeId']),
            'chain-projectile', key + ': external range')
    require(sel['m_GameObject'] == circle['fields']['m_GameObject'] == colliders[0]['fields']['m_GameObject'],
            'chain-projectile', key + ': selector/range owner')
    collider = colliders[0]['fields']
    contract(collider, dict(m_Enabled=1, m_Density=1, m_Material={'m_FileID': 0, 'm_PathID': '0'},
        m_IsTrigger=True, m_UsedByEffector=False, m_UsedByComposite=False, m_Offset=dict(x=0, y=0)),
        {'m_GameObject', 'm_Radius'}, 'chain collider')
    require(finite(collider['m_Radius']) and collider['m_Radius'] > 0 and
            finite(m['_speed']) and m['_speed'] > 0 and finite(s['_lifeTime']) and s['_lifeTime'] > 0,
            'chain-projectile', key + ': invalid geometry/speed/lifetime')
    require(local_ref(s['_bodyTransform']) and str(s['_bodyTransform']['m_PathID']) in transforms,
            'chain-projectile', key + ': body transform')
    result = dict(key=key, speed=m['_speed'], life=s['_lifeTime'],
        chain=dict(radius=collider['m_Radius'], decay=h['_atkScale'], useChainPrefix=bool(h['_useChainPrefix']),
                   countKey='max_target', allowRepetition=False, interval=0),
        source=dict(graphSha256=digest(dict(components=components, colliders=colliders, transforms=transforms)),
                    componentIds=sorted(c['nodeId'] for c in components), colliderId=colliders[0]['pathId'],
                    boundary='Complete cached chain-lightning graph; native per-hop phase and nearest-target ties remain simulation conventions.'))
    cache[key] = result
    return deepcopy(result)
