import json, re, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
folder = Path(__file__).resolve().parents[1] / 'scratch/real-database-sources'
for filename in sys.argv[1:]:
    text = (folder / filename).read_text(encoding='utf-8')
    print(filename)
    for attrs, body in re.findall(r'<script([^>]*)>(.*?)</script>', text, re.S):
        print('script', attrs[:200], 'body-length', len(body), body[:140])
        if 'application/json' in attrs or '__NEXT_DATA__' in attrs:
            try:
                data = json.loads(body)
                dest = folder / (filename + '.json')
                dest.write_text(json.dumps(data,ensure_ascii=False,indent=2), encoding='utf-8')
                print('json keys',list(data) if isinstance(data, dict) else 'list', 'saved',dest.name)
            except Exception: pass
    for keyword in ['__INITIAL_STATE__','entrants','participants','api.smash.gg','api.start.gg','graphql','playerStats','playerRows','overall','ratings','stats','static/']:
        match = re.search(re.escape(keyword),text)
        if match: print(keyword, text[max(0,match.start()-80):match.start()+200])
