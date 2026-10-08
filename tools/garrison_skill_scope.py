"""Shared identity scope for Garrison batch compilers.

Membership comes from the existing source-linked roster index. Manual progress,
descriptions and handler-registration flags do not determine eligibility or the
scope fingerprint, so checking an acceptance box cannot invalidate game data.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = 'docs/checklists/implementation-checklist.json'


def load_scope(root=ROOT):
    rows = json.loads((Path(root) / INDEX).read_text(encoding='utf-8-sig'))['operators']
    projection = sorted((dict(charId=row['id'], fixed=bool(row['fixed']),
                              skillIds=sorted({skill['id'] for skill in row['skills']}))
                         for row in rows if row['scope'] == 'mode'), key=lambda row: row['charId'])
    if not projection or len({row['charId'] for row in projection}) != len(projection):
        raise ValueError('Missing or duplicate Garrison roster identity')
    encoded = json.dumps(projection, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
    return dict(charIds=[row['charId'] for row in projection],
                fixedCharIds=[row['charId'] for row in projection if row['fixed']],
                skillIds=sorted({sid for row in projection for sid in row['skillIds']}),
                fixedSkillIds=sorted({sid for row in projection if row['fixed'] for sid in row['skillIds']}),
                identities=projection,
                sources={INDEX + '#garrison-identity-projection': hashlib.sha256(encoded).hexdigest()})
