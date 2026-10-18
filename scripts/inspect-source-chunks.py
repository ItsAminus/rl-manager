import re, sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'scratch/real-database-sources'
sys.stdout.reconfigure(encoding='utf-8')
for file in sys.argv[1:]:
    s=(root/file).read_text(encoding='utf-8')
    print(file)
    if s.lstrip().startswith('<'):
        print('\n'.join(re.findall(r'<script[^>]+src="([^"]+)',s)))
    else:
        for word in ['clientVersion','Client-Version','client-version','gql-public','publicPath']:
            for m in list(re.finditer(re.escape(word),s))[:8]:
                print(word, s[max(0,m.start()-200):m.start()+350])
        print('queries',re.findall(r'source:\{body:(.*?),name:"GraphQL request"',s)[:6])
        if len(s)<100000:
            print('fields', re.findall(r'name:\{kind:"Name",value:"([^"]+)"\}',s))
