"""Render a design proof using the same cached glyphs and crest assets as the HUD."""
import json
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
fonts = root / 'bakkesmod/build/fonts'
registry = json.loads((fonts / 'glyphs.json').read_text(encoding='utf-8'))
profiles = json.loads((root / 'data/broadcast-profiles.json').read_text(encoding='utf-8'))
timer_logos = json.loads((root / 'data/team-broadcast-logos.json').read_text(encoding='utf-8'))
out = root / 'scratch/hud-test'
out.mkdir(parents=True, exist_ok=True)
DISPLAY_SCALE = .75

def render(best_of, winners, clock, blue_score, orange_score, filename, blue_team=('team_13', 'FLCN'), orange_team=('team_9', 'SSG'), event='WORLD CHAMPIONSHIP GRAND FINAL'):
    image = Image.new('RGBA', (540, 132), (5, 7, 9, 255))
    draw = ImageDraw.Draw(image)
    def box(x, y, width, height, color):
        draw.rectangle((round(x*DISPLAY_SCALE), round(y*DISPLAY_SCALE), round((x+width)*DISPLAY_SCALE)-1, round((y+height)*DISPLAY_SCALE)-1), fill=color)
    def text(value, x, y, size, color=(245, 247, 251), italic=False, centered_width=0):
        x *= DISPLAY_SCALE; y *= DISPLAY_SCALE; centered_width *= DISPLAY_SCALE
        font = min(registry['italic' if italic else 'regular'], key=lambda item: abs(item['height']-round(size*22*DISPLAY_SCALE)))
        atlas = Image.open(fonts / font['file']).convert('RGBA')
        glyphs = [font['glyphs'].get(char, font['glyphs']['?']) for char in value]
        if centered_width:
            x += (centered_width-sum(g['advance'] for g in glyphs))/2
        for glyph in glyphs:
            tile = atlas.crop((glyph['x'], glyph['y'], glyph['x']+glyph['width'], glyph['y']+glyph['height']))
            tint = Image.new('RGBA', tile.size, (*color, 255)); tint.putalpha(tile.getchannel('A'))
            image.alpha_composite(tint, (round(x-glyph['pad']), round(y)))
            x += glyph['advance']
    text(event.upper(), 14, 5, 1.0)
    text(f'G{len(winners)+1}  BO{best_of}', 612, 7, .85, (187, 192, 197))
    for side, (team_id, label) in enumerate((blue_team, orange_team)):
        x = 600 if side else 0
        box(x, 32, 120, 144, (3, 5, 7))
        box(x if side else x+119, 32, 1, 144, (46, 49, 52))
        logo_path = root / 'public' / timer_logos[team_id]['logo'].lstrip('/')
        logo = Image.open(logo_path).convert('RGBA'); logo.thumbnail((60, 60), Image.Resampling.LANCZOS)
        image.alpha_composite(logo, (round((x+20)*DISPLAY_SCALE)+(60-logo.width)//2, 36+(60-logo.height)//2))
        text(label, x, 146, 1.0, centered_width=120)
    box(240, 32, 240, 112, (250, 250, 248))
    for strip in range(28):
        t = strip/27
        box(120, 32+strip*4, 120, 4, tuple(int(c) for c in (23+23*t, 54+77*t, 128+68*t)))
        box(480, 32+strip*4, 120, 4, tuple(int(c) for c in (173+57*t, 107+72*t, 36+48*t)))
    box(120, 32, 120, 2, (89, 150, 225)); box(480, 32, 120, 2, (248, 211, 127))
    box(120, 142, 480, 2, (46, 49, 52))
    text(str(blue_score), 120, 41, 4.2, italic=True, centered_width=120)
    text(str(orange_score), 480, 41, 4.2, italic=True, centered_width=120)
    text(clock, 240, 49, 3.0 if clock.startswith('+') else 3.6, (6, 7, 8), True, 240)
    segment = 468/best_of
    for j in range(best_of):
        x, width = 126+j*segment, segment-6
        box(x, 154, width, 14, (241, 209, 112) if j == best_of//2 else (59, 62, 64))
        color = (45, 117, 204) if j < winners.count(0) else (218, 165, 67) if j >= best_of-winners.count(1) else (34, 37, 39)
        box(x+2, 156, width-4, 10, color)
    image.save(out / filename)

render(7, [0, 0, 1], '2:38', 1, 0, 'worlds-timer-design.png')
render(3, [1, 0], '+1:24', 2, 2, 'worlds-timer-overtime.png')
render(5, [0, 1, 0], '2:38', 1, 0, 'worlds-timer-bo5.png')
render(9, [0, 1, 0, 1, 0, 1, 0, 1], '0:10', 10, 9, 'worlds-timer-decider.png')
comparison = Image.new('RGBA', (540, 432), (18, 22, 29, 255))
for index, filename in enumerate(('worlds-timer-overtime.png', 'worlds-timer-bo5.png', 'worlds-timer-design.png')):
    comparison.alpha_composite(Image.open(out / filename), (0, index*150))
comparison.save(out / 'worlds-timer-series-preview.png')
render(5, [0, 1], '3:42', 2, 1, 'timer-dynamic-teams.png', ('team_1', 'VIT'), ('team_16', 'FUR'), 'RLCS MAJOR 2')
print(out / 'worlds-timer-design.png')
