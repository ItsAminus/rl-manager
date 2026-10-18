"""Prepare identity-keyed, offline team crests; never invent an official logo."""
import argparse, io, json, re, sys, time, urllib.request, unicodedata
from collections import Counter, deque
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
OUTPUT = PUBLIC / 'broadcast-crests'
OUTPUT.mkdir(exist_ok=True)
sys.path.insert(0, str(ROOT / 'bakkesmod/build/logo-deps'))
import resvg_py

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def canonical(name):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', name).casefold())

def decode(content):
    if b'<svg' in content[:4000]:
        content = resvg_py.svg_to_bytes(svg_string=content.decode('utf-8'), width=512, skip_system_fonts=True)
    return ImageOps.exif_transpose(Image.open(io.BytesIO(content))).convert('RGBA')

def crest(image):
    # Remove only the near-white background connected to an image edge.
    # Closed white details inside the logo are retained.
    image = ImageOps.contain(image, (512, 512), Image.Resampling.LANCZOS)
    pixels = image.load(); width, height = image.size
    def white_background(pixel):
        red,green,blue,alpha=pixel
        return alpha>=250 and min(red,green,blue)>225 and max(red,green,blue)-min(red,green,blue)<22
    # A white wordmark on transparent SVG is foreground, not a white backdrop.
    opaque_white = all(white_background(pixels[x,y]) for x,y in ((0,0),(width-1,0),(0,height-1),(width-1,height-1)))
    queue = deque([(x, y) for x in range(width) for y in (0, height-1)] +
                  [(x, y) for y in range(height) for x in (0, width-1)]) if opaque_white else deque()
    seen = set()
    while queue:
        x, y = queue.popleft()
        if (x, y) in seen or not (0 <= x < width and 0 <= y < height): continue
        seen.add((x, y)); red, green, blue, alpha = pixels[x, y]
        if alpha == 0 or min(red, green, blue) > 225 and max(red, green, blue)-min(red, green, blue) < 22:
            pixels[x, y] = (red, green, blue, 0)
            queue.extend(((x+1, y), (x-1, y), (x, y+1), (x, y-1)))
    bounds = image.getbbox()
    if not bounds: raise ValueError('Empty logo')
    image = ImageOps.contain(image.crop(bounds), (256, 256), Image.Resampling.LANCZOS)
    return image

def badge(team):
    # Distinct neutral monograms for teams with no published image.
    # Explicitly labelled as generated in the registry, never as official.
    words = re.findall(r'[A-Za-z0-9]+', team['name'])
    letters = ''.join(word[0] for word in words[:3]).upper() if len(words)>1 else (words[0][:3].upper() if words else '?')
    hash_value = 0
    for char in team['id']: hash_value = (hash_value*31+ord(char)) & 0xffffffff
    color = ['#476FAB', '#985BBB', '#287D75', '#B56042', '#636CA2', '#AB794B'][hash_value % 6]
    image = Image.new('RGBA', (512, 512), (0, 0, 0, 0)); draw = ImageDraw.Draw(image)
    points = [(36, 32), (476, 32), (468, 320), (400, 412), (256, 486), (112, 412), (44, 320)]
    draw.polygon(points, fill=color)
    draw.line(points+[points[0]], fill=(227, 232, 238), width=10)
    font = ImageFont.truetype('C:/Windows/Fonts/seguisb.ttf', 152 if len(letters)<3 else 126)
    draw.text((256, 230), letters, font=font, anchor='mm', fill='white')
    return image.resize((256, 256), Image.Resampling.LANCZOS)

def contrast_frame(image, team_id):
    foreground=[pixel for pixel in image.getdata() if pixel[3]>128]
    if not foreground or sum(.2126*r+.7152*g+.0722*b for r,g,b,a in foreground)/len(foreground)>=72:
        return image, False
    # Preserve the published crest's pixels. Dark crests get a presentation
    # backing, rather than becoming invisible against the black logo tower.
    palettes=dict(re.findall(r"(team_\d+):'(#\w{6})'", (ROOT/'src/services/broadcast-colors.ts').read_text(encoding='utf-8')))
    color=palettes.get(team_id, '#CBD5E1')
    framed=Image.new('RGBA',(256,256),(0,0,0,0));draw=ImageDraw.Draw(framed)
    draw.rounded_rectangle((4,4,251,251),radius=44,fill=color)
    image=ImageOps.contain(image,(212,212),Image.Resampling.LANCZOS)
    framed.alpha_composite(image,((256-image.width)//2,(256-image.height)//2))
    return framed, True

def main(fetch=False):
    teams = read(ROOT / 'data/teams.json')
    profiles = read(ROOT / 'data/broadcast-profiles.json')['teams']
    specs = {team['id']:team for team in read(ROOT / 'data/real-rosters.json')['teams']}
    blast = read(ROOT / 'scratch/profile-image-sources/blast-team-index.json')
    by_name = {}
    for key, record in blast.items(): by_name.setdefault(canonical(record['name']), []).append(key)
    original = ROOT / 'scratch/profile-image-originals/team-crests'; original.mkdir(parents=True, exist_ok=True)
    mapping = {}; downloads = 0
    for team in teams:
        record = profiles.get(team['id'], {})
        result = None; source_url = record.get('broadcastLogoSource') or record.get('avatarSource')
        for url in (record.get('broadcastLogoUrl'), record.get('avatarUrl')):
            if url and url.startswith('/') and '..' not in url and (PUBLIC / url.lstrip('/')).is_file():
                try: result = crest(decode((PUBLIC / url.lstrip('/')).read_bytes())); break
                except (OSError, ValueError): pass
        # Cached BLAST team IDs are only assigned to established organisations
        # or an exact source ID. A qualifier sharing its name cannot borrow it.
        spec = specs.get(team['id'], {})
        candidates = []
        if team['id'].startswith('real_team_') and team['id'][10:] in blast:
            candidates = [team['id'][10:]]
        elif not team['id'].startswith('sg_team_') and spec.get('source', '').startswith('https://liquipedia.net/rocketleague/'):
            candidates = by_name.get(canonical(team['name']), [])
        cached = original / (team['id']+'.asset')
        if result is None and len(candidates) == 1:
            source_url = 'https://blast.tv/rl/team/'+candidates[0]+'/'
            try:
                if not cached.exists() and fetch:
                    url = 'https://assets.blast.tv/images/teams/'+candidates[0]+'?format=auto&width=512'
                    request = urllib.request.Request(url, headers={'User-Agent':'RLManager/1.0 personal offline game'})
                    with urllib.request.urlopen(request, timeout=15) as response:
                        if not response.headers.get('Content-Type', '').startswith('image/'): raise ValueError('Not an image')
                        content = response.read(4*1024*1024+1)
                        if len(content)>4*1024*1024: raise ValueError('Image too large')
                        cached.write_bytes(content)
                    downloads += 1
                    time.sleep(.4)
                if cached.exists(): result = crest(decode(cached.read_bytes()))
            except (OSError, ValueError) as error: print('Unavailable:', team['name'], str(error)[:100], flush=True)
        kind = 'published_logo' if result else 'initials_fallback'
        if result is None: result = badge(team); source_url = None
        backing=False
        if kind=='published_logo':result,backing=contrast_frame(result,team['id'])
        destination = OUTPUT / (team['id']+'.png'); result.save(destination)
        mapping[team['id']] = {'name':team['name'], 'logo':'/broadcast-crests/'+destination.name, 'kind':kind, 'source':source_url}
        if backing:mapping[team['id']]['presentationBacking']=True
    (ROOT / 'data/team-broadcast-logos.json').write_text(json.dumps(mapping, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    count = Counter(record['kind'] for record in mapping.values())
    report = {'total':len(teams), 'publishedLogos':count['published_logo'], 'initialsFallbacks':count['initials_fallback'], 'missing':0, 'downloaded':downloads}
    (ROOT / 'data/team-logo-coverage.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report), flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--fetch', action='store_true')
    main(parser.parse_args().fetch)
