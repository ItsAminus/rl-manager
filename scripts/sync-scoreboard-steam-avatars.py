"""Cache public Steam avatars only from identity-confirmed Liquipedia links."""
import argparse, io, json, re, time, unicodedata, urllib.error, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ALIASES = {'TRK511':'Trk511','AppJack':'ApparentlyJack','Justin':'Jstn','Khalid':'OKhaliD',
           'Acronik':'AcroniK.','Kro':'Kronovi','ScrubKilla':'Scrub Killa','Greazy':'GReazymeister',
           'juicy':'Juicy (French Player)','diaz':'Diaz (Brazilian Player)','misty':'Misty (Australian Player)'}

def normalized(value):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', value or '').encode('ascii','ignore').decode().lower())

def field(wiki, name):
    wiki = re.sub(r'<!--.*?-->', '', wiki, flags=re.S)
    infobox = re.search(r'\{\{Infobox player\b(.*?)(?:\n\}\}|\Z)', wiki, re.S|re.I)
    values = re.findall(r'^\s*\|' + name + r'\s*=\s*([^\n|]*)', infobox[1] if infobox else '', re.M|re.I)
    return next((value.strip() for value in values if value.strip()), '')

def confirmed_identity(player, wiki, profile):
    pid = player['id']
    if pid.startswith('sg_player_'):
        source = profile.get('profileUrl', '')
        slug = source.rstrip('/').split('/')[-1] if '/user/' in source else ''
        if len(slug)>=8 and slug.casefold() in (field(wiki,'startgg') or field(wiki,'smashgg')).casefold():
            return 'Exact linked start.gg user'
        return None
    if re.fullmatch(r'pro_[a-f0-9-]{36}', pid) and pid[4:12] in field(wiki,'blasttv'):
        return 'Exact linked BLAST player UUID'
    real_name = normalized(player.get('realName'))
    if real_name and real_name in [normalized(field(wiki,'name')), normalized(field(wiki,'romanized_name'))]:
        return 'Matching confirmed real name'
    if player.get('birthDate') and player['birthDate']==field(wiki,'birth_date') and normalized(player['gamertag'])==normalized(field(wiki,'id')):
        return 'Matching birth date and player tag'
    return None

def steam_profile(wiki):
    link = field(wiki,'steam').rstrip('/')
    if not re.fullmatch(r'(?:profiles/\d{17}|id/[a-zA-Z0-9_-]+)',link):
        return None
    return 'https://steamcommunity.com/' + link

def avatar_from_xml(body, profile):
    root = ET.fromstring(body)
    if root.tag != 'profile': raise ValueError('Steam profile unavailable')
    if '/profiles/' in profile and root.findtext('steamID64') != profile.rsplit('/',1)[-1]:
        raise ValueError('Steam account identity mismatch')
    url = root.findtext('avatarFull') or root.findtext('avatarMedium') or ''
    parsed = urllib.parse.urlparse(url)
    allowed = parsed.hostname in ('avatars.steamstatic.com','avatars.fastly.steamstatic.com') or (
        parsed.hostname=='media.steampowered.com' and parsed.path.startswith('/steamcommunity/public/images/avatars/'))
    if not allowed or parsed.scheme not in ('https','http'): raise ValueError('Unrecognised Steam avatar source')
    return urllib.parse.urlunparse(parsed._replace(scheme='https'))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--list', action='store_true')
    args = parser.parse_args()
    read = lambda name: json.loads((ROOT / name).read_text(encoding='utf-8'))
    headshots, registry = read('data/player-headshots.json'), read('data/broadcast-profiles.json')['players']
    pages = read('scratch/headshot-sources/liquipedia-pages.json')
    manifest_path = ROOT / 'data/player-steam-avatars.json'
    manifest = read('data/player-steam-avatars.json')
    candidates = []
    for p in read('data/players.json'):
        if p['id'] in headshots: continue
        page = pages.get(ALIASES.get(p['gamertag'],p['gamertag']).casefold(),{})
        wiki = page.get('wiki','')
        proof = confirmed_identity(p,wiki,registry.get(p['id'],{}))
        profile = steam_profile(wiki)
        if proof and profile:
            candidates.append((p,profile,proof,'https://liquipedia.net/rocketleague/'+urllib.parse.quote(page['title'])))
    print(f'{len(candidates)} verified Steam fallback candidates',flush=True)
    if args.list:
        print('\n'.join(p['gamertag'] for p,_,_,_ in candidates))
        return
    cache = ROOT / 'scratch/steam-avatar-sources'
    cache.mkdir(parents=True,exist_ok=True)
    folder = ROOT / 'public/player-steam-avatars'
    folder.mkdir(parents=True,exist_ok=True)
    last_request = 0.
    def request(url):
        nonlocal last_request
        time.sleep(max(0,1.1-(time.monotonic()-last_request)))
        last_request = time.monotonic()
        req = urllib.request.Request(url,headers={'User-Agent':'RLManager/1.0 (personal offline scoreboard image cache)'})
        with urllib.request.urlopen(req,timeout=20) as response: return response.read()
    for player,profile,proof,source in sorted(candidates,key=lambda entry:-entry[0]['overall']):
        pid = player['id']
        target = folder / (pid + '.png')
        if pid in manifest and target.exists(): continue
        try:
            xml = cache / (pid + '.xml')
            body = xml.read_bytes() if xml.exists() else request(profile+'?xml=1')
            url = avatar_from_xml(body,profile)
            if not xml.exists(): xml.write_bytes(body)
            with Image.open(io.BytesIO(request(url))) as opened:
                image = ImageOps.exif_transpose(opened).convert('RGBA')
                if min(image.size)<32: raise ValueError('Avatar too small')
                image.thumbnail((256,256),Image.Resampling.LANCZOS)
                image.save(target,'PNG')
            manifest[pid] = {'path':'/player-steam-avatars/'+target.name,'source':profile,
                             'identitySource':source,'identity':proof,'avatarSource':url,
                             'checkedAt':time.strftime('%Y-%m-%d')}
            manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            print(f'Steam avatar cached: {player["gamertag"]}',flush=True)
        except urllib.error.HTTPError as error:
            print(f'Steam unavailable: {player["gamertag"]}: HTTP {error.code}',flush=True)
            if error.code==429:
                print('Rate limit reached; keeping completed cache and stopping.',flush=True)
                break
        except (OSError,ValueError,ET.ParseError) as error:
            print(f'Steam unavailable: {player["gamertag"]}: {error}',flush=True)
    print(f'{len(manifest)} verified Steam avatars cached',flush=True)

if __name__ == '__main__': main()
