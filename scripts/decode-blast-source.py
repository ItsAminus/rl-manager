import json, re, sys, collections
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
root=Path(__file__).resolve().parents[1]/'scratch/real-database-sources'
for name in sys.argv[1:]:
    html=(root/name).read_text(encoding='utf-8')
    chunks=[]
    for encoded in re.findall(r'streamController\.enqueue\(("(?:[^"\\]|\\.)*")\)',html):
        text=json.loads(encoded).strip()
        if text.startswith('P'): text=text.split(':',1)[1]
        try: chunks.append(json.loads(text))
        except ValueError: continue
    values=[]
    # Turbo-stream references are global across all chunks, including each root.
    for i, chunk in enumerate(chunks):
        values.extend(chunk)
    print(name,'chunks',[len(c) for c in chunks],'values',len(values))
    cache={}
    busy=set()
    def decode(ref, depth=0):
        if depth>4: return None
        if not isinstance(ref,int): return ref
        if ref<0: return { -1:None, -2:None, -3:float('nan'), -5:None }.get(ref)
        if ref>=len(values): return None
        if (ref,depth) in cache: return cache[(ref,depth)]
        if ref in busy: return None
        busy.add(ref)
        v=values[ref]
        if isinstance(v,dict): result={str(decode(int(k[1:]),depth+1)):decode(x,depth+1) for k,x in v.items() if k.startswith('_')}
        elif isinstance(v,list): result=v if v and isinstance(v[0],str) else [decode(x,depth+1) for x in v]
        else: result=v
        cache[(ref,depth)]=result
        busy.remove(ref)
        return result
    decoded=[decode(i) for i,v in enumerate(values) if isinstance(v,dict)]
    (root/(name+'.decoded.json')).write_text(json.dumps(decoded,ensure_ascii=False,indent=2),encoding='utf-8')
    counts=collections.Counter(k for obj in decoded for k in obj)
    print('keys', counts.most_common(45))
    shown=0
    for obj in decoded:
        if any(k in obj for k in ['nickname','gamerTag','roster','players','rating','members']):
            shown+=1
            if shown<=2: print(json.dumps(obj,ensure_ascii=False)[:1300])
