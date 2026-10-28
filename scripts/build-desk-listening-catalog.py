"""Build a local listening page from the actual storyline manifest."""
import json
from html import escape
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
rows=json.loads((ROOT/'data/desk-storylines.json').read_text(encoding='utf-8'))
html=['''<!doctype html><html lang="en"><meta charset="utf-8"><title>RLM analyst voice bank — 100 storylines</title>
<style>body{font:16px system-ui;background:#0c1724;color:#e5edf5;max-width:1100px;margin:45px auto;padding:0 25px}h1{color:#edbd69}article{padding:20px;margin:16px 0;background:#152436;border:1px solid #32465c;border-radius:12px}p{line-height:1.6}small{color:#adc3d6}audio{width:100%}summary{cursor:pointer;font-size:21px;font-weight:bold}.variants{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:22px}input{width:100%;box-sizing:border-box;padding:14px;background:#152436;color:white;border:1px solid #576b80;border-radius:8px}</style>
<h1>RL Manager · Analyst recordings</h1><p>Three original variations for each of the 100 supplied situations. Voice: Afro American RLCS Analyst · ElevenLabs v3. Prepared for offline playback.</p>
<input id="search" aria-label="Find a scenario" placeholder="Find a scenario: underdog, rivalry, final…"><main>''']
for number in range(1,101):
    group=[row for row in rows if row['scenarioNumber']==number]
    html.append('<article data-search="'+escape(group[0]['scenario'].lower())+'"><details><summary>'+str(number)+'. '+escape(group[0]['scenario'])+'</summary><div class="variants">')
    for index,row in enumerate(group,1):
        html.append('<section><h3>Variation '+str(index)+'</h3><audio controls preload="none" src="'+escape(row['file'])+'"></audio><p>'+escape(row['text'])+'</p><small>'+escape(row['phase'].replace('_',' '))+' · Context evidence required</small></section>')
    html.append('</div></details></article>')
html.append('''</main><script>document.querySelector('#search').addEventListener('input',e=>{document.querySelectorAll('article').forEach(a=>a.hidden=!a.dataset.search.includes(e.target.value.toLowerCase()))});document.addEventListener('play',e=>{document.querySelectorAll('audio').forEach(a=>{if(a!==e.target)a.pause()})},true);</script></html>''')
(ROOT/'public/audio/desk-analyst/storyline-review.html').write_text('\n'.join(html),encoding='utf-8')
print('Listening catalogue updated: 100 scenarios, 300 recordings.')
