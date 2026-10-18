"""Resume safe ID-based face-photo discovery without overwriting account avatars."""
import gzip, io, json, re, sys, time, unicodedata, urllib.parse, urllib.request
from pathlib import Path
from PIL import Image, ImageOps

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'scratch/headshot-sources'
CACHE.mkdir(parents=True, exist_ok=True)
FOLDER = ROOT / 'public/player-headshots'
FOLDER.mkdir(parents=True, exist_ok=True)
HEADERS = {'User-Agent': 'RLManager/1.0 (personal offline player portrait cache)', 'Accept-Encoding': 'gzip'}
ALIASES = {'TRK511': 'Trk511', 'AppJack': 'ApparentlyJack', 'Justin': 'Jstn', 'Khalid': 'OKhaliD', 'Acronik': 'AcroniK.', 'Kro': 'Kronovi', 'ScrubKilla': 'Scrub Killa', 'Greazy': 'GReazymeister'}
ALIASES.update({'juicy': 'Juicy (French Player)', 'diaz': 'Diaz (Brazilian Player)', 'misty': 'Misty (Australian Player)'})
last_request = 0

def read(path, default):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default

def write(path, data):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(path)

def request(url):
    global last_request
    time.sleep(max(0, 2.1 - (time.monotonic() - last_request)))
    last_request = time.monotonic()
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=35) as response:
        body = response.read()
        return gzip.decompress(body) if response.headers.get('Content-Encoding') == 'gzip' else body

def api(wiki, **params):
    params['format'] = 'json'
    result = json.loads(request('https://liquipedia.net/' + wiki + '/api.php?' + urllib.parse.urlencode(params)))
    if result.get('error'): raise ValueError(str(result['error']))
    return result

def normalized(text):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', text or '').encode('ascii', 'ignore').decode().lower())

def field(wiki, name):
    wiki = re.sub(r'<!--.*?-->', '', wiki, flags=re.S)
    infobox = re.search(r'\{\{Infobox player\b(.*?)(?:\n\}\}|\Z)', wiki, re.S | re.I)
    if not infobox: return ''
    values = re.findall(r'^\s*\|' + name + r'\s*=\s*([^\n|]*)', infobox[1], re.M | re.I)
    return next((value.strip() for value in values if value.strip()), '')

def requested_title(player):
    return player['gamertag'] if player['id'].startswith('sg_player_') else ALIASES.get(player['gamertag'], player['gamertag'])

players = read(ROOT / 'data/players.json', [])
registry = read(ROOT / 'data/broadcast-profiles.json', {}).get('players', {})
legacy = read(ROOT / 'data/player-portraits.json', {})
manifest_path = ROOT / 'data/player-headshots.json'
manifest = read(manifest_path, {})
pages_path = CACHE / 'liquipedia-pages.json'
pages = read(pages_path, {})
metadata_path = CACHE / 'commons-images.json'
metadata = read(metadata_path, {})
audit_path = ROOT / 'data/player-headshot-coverage.json'
audit = read(audit_path, {}).get('players', {})
organizer_ids = {}
for cached in (ROOT / 'scratch/real-database-sources').glob('*.body.decoded.json'):
    for record in read(cached, []):
        if isinstance(record, dict) and record.get('role') == 'player' and record.get('nickname'):
            organizer_ids[(normalized(record['nickname']), normalized(record.get('firstName', '') + record.get('lastName', '')))] = record['id']

# Preserve original face-photo URLs, and protect them from subsequent avatar imports.
for player in players:
    pid, tag = player['id'], player['gamertag'].lower().rstrip('.')
    if pid.startswith('sg_player_'): continue
    tag = {'jstn': 'justin', 'apparentlyjack': 'appjack'}.get(tag, tag)
    photo = legacy.get(tag, {})
    if photo.get('path') and (ROOT / 'public' / photo['path'].lstrip('/')).exists():
        manifest.setdefault(pid, dict(photo, identity='Established pro roster identity'))
    profile = registry.get(pid, {})
    if profile.get('imageOrigin') == 'Official team roster portrait' and profile.get('avatarUrl', '').startswith('/'):
        manifest.setdefault(pid, {'path': profile['avatarUrl'], 'source': profile['avatarSource'], 'origin': 'Official team roster portrait', 'identity': 'Official roster identity'})
write(manifest_path, manifest)

def fetch_pages(batch):
    titles = list(dict.fromkeys(requested_title(p) for p in batch))
    missing = [title for title in titles if title.casefold() not in pages]
    for offset in range(0, len(missing), 40):
        chunk = missing[offset:offset + 40]
        result = api('rocketleague', action='query', titles='|'.join(chunk), redirects=1, prop='revisions', rvprop='content', rvslots='main')
        query = result.get('query', {})
        redirects = {r['from'].casefold(): r['to'] for r in query.get('redirects', [])}
        norm = {r['from'].casefold(): r['to'] for r in query.get('normalized', [])}
        found = {p['title'].casefold(): p for p in query.get('pages', {}).values()}
        for requested in chunk:
            title = norm.get(requested.casefold(), requested)
            for _ in range(5): title = redirects.get(title.casefold(), title)
            page = found.get(title.casefold(), {})
            revisions = page.get('revisions', [])
            wiki = revisions[0].get('slots', {}).get('main', {}).get('*', '') if revisions else ''
            pages[requested.casefold()] = {'title': title, 'wiki': wiki, 'checked': time.strftime('%Y-%m-%d')}
        write(pages_path, pages)
        print(f'Liquipedia lookup: {len(pages)} distinct names checked', flush=True)

def identity(player, page):
    wiki = page['wiki']
    if not re.search(r'\{\{Infobox player\b', wiki, re.I): return None
    if player['id'].startswith('sg_player_'):
        source = registry.get(player['id'], {}).get('profileUrl', '')
        slug = source.rstrip('/').split('/')[-1] if '/user/' in source else ''
        linked = field(wiki, 'startgg') or field(wiki, 'smashgg')
        if slug and len(slug) >= 8 and slug.casefold() in linked.casefold(): return 'Exact linked start.gg user'
        return None
    if player['id'].startswith('pro_') and player['id'][4:12] in field(wiki, 'blasttv'):
        return 'Exact linked BLAST player UUID'
    names = [field(wiki, 'romanized_name'), field(wiki, 'name')]
    if normalized(player.get('realName')) and normalized(player.get('realName')) in [normalized(n) for n in names]:
        return 'Matching confirmed real name'
    if player.get('birthDate') and player['birthDate'] == field(wiki, 'birth_date') and normalized(player['gamertag']) == normalized(field(wiki, 'id')):
        return 'Matching birth date and player tag'
    return None

def fetch_metadata(filenames):
    missing = [f for f in dict.fromkeys(filenames) if f.casefold() not in metadata]
    for offset in range(0, len(missing), 40):
        chunk = missing[offset:offset + 40]
        result = api('commons', action='query', titles='|'.join('File:' + f for f in chunk), prop='imageinfo', iiprop='url', iiurlwidth=384)
        by_name = {p['title'][5:].replace('_', ' ').casefold(): p.get('imageinfo', [{}])[0] for p in result.get('query', {}).get('pages', {}).values()}
        for filename in chunk: metadata[filename.casefold()] = by_name.get(filename.replace('_', ' ').casefold(), {})
        write(metadata_path, metadata)

def cache_photo(player, url, source, origin, proof, filename=None):
    target = FOLDER / (player['id'] + ('-blast' if origin.startswith('BLAST') else '') + '.webp')
    if not target.exists():
        body = request('https:' + url if url.startswith('//') else url)
        with Image.open(io.BytesIO(body)) as image:
            photo = ImageOps.exif_transpose(image).convert('RGB')
            if min(photo.size) < 64: raise ValueError('Image too small for a headshot')
            if origin.startswith('BLAST'):
                small = list(photo.convert('L').resize((9, 8)).getdata())
                signature = sum((small[y*9+x] > small[y*9+x+1]) << (y*8+x) for y in range(8) for x in range(8))
                if (signature ^ 0x7070707070303030).bit_count() <= 3:
                    raise ValueError('Organizer placeholder, not a face photo')
            if origin == 'Liquipedia Commons' and photo.width / photo.height > 1.8:
                raise ValueError('Wide event/group photo unsuitable as a player headshot')
            photo.thumbnail((384, 512), Image.Resampling.LANCZOS)
            photo.save(target, 'WEBP', quality=92)
    manifest[player['id']] = {'path': '/player-headshots/' + target.name, 'source': source, 'origin': origin, 'identity': proof, 'file': filename}
    audit[player['id']] = {'gamertag': player['gamertag'], 'status': 'headshot', 'source': source}
    write(manifest_path, manifest)
    print(f'Face photo cached: {player["gamertag"]} ({len(manifest)} verified photos)', flush=True)

def sync(batch):
    fetch_pages(batch)
    candidates = []
    for player in batch:
        if player['id'] in manifest:
            audit[player['id']] = {'gamertag': player['gamertag'], 'status': 'headshot', 'source': manifest[player['id']]['source']}
            continue
        page = pages.get(requested_title(player).casefold(), {'wiki': '', 'title': ''})
        proof = identity(player, page)
        filename = field(page['wiki'], 'image') if proof else ''
        audit[player['id']] = {'gamertag': player['gamertag'], 'status': 'no_confirmed_headshot', 'reason': 'No usable verified face photo'}
        if filename and '{{' not in filename:
            candidates.append((player, filename, proof))
        else:
            audit[player['id']] = {'gamertag': player['gamertag'], 'status': 'no_confirmed_headshot', 'reason': 'No infobox face photo' if proof else 'No matching verified photo identity'}
    fetch_metadata([f for _, f, _ in candidates])
    for player, filename, proof in candidates:
        info = metadata.get(filename.casefold(), {})
        url = info.get('thumburl') or info.get('url')
        if not url: continue
        try: cache_photo(player, url, info.get('descriptionurl'), 'Liquipedia Commons', proof, filename)
        except Exception as error: print(f'Unavailable photo: {player["gamertag"]}: {error}', flush=True)
    # The organizer endpoint uses the exact UUID already confirmed in the database.
    for player in batch:
        pid = player['id']
        if pid in manifest or pid.startswith('sg_player_'): continue
        uuid = pid[4:] if re.fullmatch(r'pro_[a-f0-9-]{36}', pid) else organizer_ids.get((normalized(player['gamertag']), normalized(player.get('realName'))))
        if not uuid: continue
        try:
            cache_photo(player, 'https://assets.blast.tv/images/players/' + uuid + '?format=auto&height=512',
                        'https://blast.tv/rl/player/' + uuid[:8] + '/' + urllib.parse.quote(player['gamertag']),
                        'BLAST official player portrait', 'Exact confirmed BLAST player UUID')
        except Exception as error: print(f'No organizer headshot: {player["gamertag"]}: {error}', flush=True)
    write(audit_path, {'checkedAt': time.strftime('%Y-%m-%d'), 'totalPlayers': len(players), 'headshots': len(manifest), 'lookedUpNames': len(pages), 'players': audit})

core = [p for p in players if not p['id'].startswith('sg_player_')]
sync(core)
print(f'Established roster check complete: {len(manifest)} face photos. Checking qualifier identities...', flush=True)
qualifiers = [p for p in players if p['id'].startswith('sg_player_')]
for offset in range(0, len(qualifiers), 200): sync(qualifiers[offset:offset + 200])
for player in players:
    audit.setdefault(player['id'], {'gamertag': player['gamertag'], 'status': 'no_confirmed_headshot', 'reason': 'No usable verified face photo'})
write(audit_path, {'checkedAt': time.strftime('%Y-%m-%d'), 'totalPlayers': len(players), 'headshots': len(manifest), 'lookedUpNames': len(pages), 'players': audit})
print(f'Done: {len(manifest)} verified face photos; all {len(players)} player records checked.', flush=True)
