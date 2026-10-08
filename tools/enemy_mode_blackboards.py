"""Read only required enemies' inherited talent blackboards once per source."""
import json
from pathlib import Path
from enemy_attack_capabilities import DATABASE, ROOT, read, digest, save

CACHE = ROOT / 'work/enemy-mode-blackboards.json'
RULE = 'mode-provider-talent-blackboards-v1'


def load_blackboards(member_ids):
    members = sorted(set(member_ids))
    state = dict(rule=RULE, databaseSha256=digest(DATABASE), memberIDs=members,
                 importerSha256=digest(Path(__file__)))
    old = read(CACHE) if CACHE.is_file() else None
    if old and old['inputs'] == state:
        return old, True
    result = {}
    for row in read(DATABASE)['enemies']:
        if row['Key'] not in members:
            continue
        current, levels = None, []
        for level in sorted(row['Value'], key=lambda item: item['level']):
            value = level.get('enemyData', {}).get('talentBlackboard')
            if value is not None:
                current = value
            levels.append(dict(level=level['level'], blackboard=current))
        boards = {json.dumps(item['blackboard'], sort_keys=True) for item in levels}
        result[row['Key']] = dict(levels=levels,
            blackboard=levels[0]['blackboard'] if len(boards) == 1 else None,
            status='all-levels-agree' if len(boards) == 1 and current is not None else 'missing-or-level-dependent',
            sourceRef=dict(path=str(DATABASE.relative_to(ROOT)), enemyKey=row['Key'], field='Value[].enemyData.talentBlackboard'))
    output = dict(rule=RULE, inputs=state, enemies=result)
    save(CACHE, output)
    return output, False
