import json, collections
base='data/ArknightsGameData/zh_CN/gamedata/levels/activities/act1vautochess/'
lv=json.load(open(base+'level_act1vautochess_01-01.json',encoding='utf-8'))
md=lv['mapData']; mp=md['map']; tiles=md['tiles']
def mask(r,c):
    if 0<=r<len(mp) and 0<=c<len(mp[r]):
        idx=mp[r][c]
        if idx is not None and idx<len(tiles): return tiles[idx].get('passableMask','ALL')
    return 'FORBIDDEN'
def walkable(r,c,motion):
    m=mask(r,c)
    if motion=='FLY': return m in ('ALL','FLY_ONLY')
    return m in ('ALL','WALK_ONLY')
def bfs(a,b,motion):
    if a==b: return [a]
    prev={a:None}; q=collections.deque([a])
    while q:
        cur=q.popleft()
        if cur==b: break
        for dr,dc in ((1,0),(-1,0),(0,1),(0,-1)):
            n=(cur[0]+dr,cur[1]+dc)
            if n==b or (n not in prev and walkable(n[0],n[1],motion)):
                if n not in prev:
                    prev[n]=cur; q.append(n)
    if b not in prev: return None
    p=[]; c=b
    while c is not None: p.append(c); c=prev[c]
    return p[::-1]
for ridx in (0,4):
    r=lv['routes'][ridx]
    motion=r.get('motionMode','WALK')
    sp=[r['startPosition']['row'],r['startPosition']['col']]
    ep=[r['endPosition']['row'],r['endPosition']['col']]
    pts=[sp]
    for c in r['checkpoints']:
        t=c['type']; pos=c.get('position') or {}
        if t in ('MOVE','APPEAR_AT_POS'): pts.append([pos['row'],pos['col']])
    pts.append(ep)
    print('route',ridx,'motion',motion,'pts',pts)
    for i in range(len(pts)-1):
        a=tuple(pts[i]); b=tuple(pts[i+1])
        p=bfs(a,b,motion)
        print('   ',a,'->',b,'walklen',len(p) if p else 'NO PATH', 'mask',mask(*a),mask(*b))
        if p and len(p)>2: print('       path',p[:6],'...' if len(p)>6 else '')
