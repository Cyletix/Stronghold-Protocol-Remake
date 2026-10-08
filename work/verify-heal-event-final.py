import json, subprocess, sys
from pathlib import Path

p=Path('work/client-logic/mechanism-candidates.json')
before=json.loads(p.read_text(encoding='utf-8'))
subprocess.run([sys.executable,'-B','tools/build_client_mechanism_candidates.py'],check=True)
after=json.loads(p.read_text(encoding='utf-8'))
changed=[k for k in after if before.get(k)!=after[k]]
assert changed==['inputs'],changed
print('Candidate input provenance refreshed:',{k:after['inputs'][k] for k in after['inputs'] if before['inputs'].get(k)!=after['inputs'][k]})
subprocess.run([sys.executable,'-B','tools/build_client_mechanism_candidates.py','--check'],check=True)
assert after['summary']['groups']==690
print('No graph, registration, rejection or group semantic drift')
