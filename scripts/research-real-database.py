"""Cache public, unauthenticated roster/stat sources without printing page bodies."""
import argparse, gzip, hashlib, json, urllib.error, urllib.request, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
parser = argparse.ArgumentParser()
parser.add_argument('urls', nargs='+')
args = parser.parse_args()
folder = Path(__file__).resolve().parents[1] / 'scratch' / 'real-database-sources'
folder.mkdir(parents=True, exist_ok=True)
for url in args.urls:
    key = hashlib.sha256(url.encode()).hexdigest()[:16]
    target = folder / (key + '.body')
    try:
        request = urllib.request.Request(url, headers={'User-Agent': 'RLManager/1.0 (personal career game; public roster research)', 'Accept-Encoding': 'gzip'})
        with urllib.request.urlopen(request, timeout=45) as response:
            body = response.read()
            if response.headers.get('Content-Encoding') == 'gzip': body = gzip.decompress(body)
            target.write_bytes(body)
            (folder / (key + '.json')).write_text(json.dumps({'url': url, 'status': response.status, 'file': target.name}, indent=2), encoding='utf-8')
            print(json.dumps({'url': url, 'status': response.status, 'bytes': len(body), 'file': target.name}))
    except urllib.error.HTTPError as error:
        print(json.dumps({'url': url, 'status': error.code}))
        if error.code == 429: break
    except Exception as error:
        print(json.dumps({'url': url, 'error': str(error)}))
