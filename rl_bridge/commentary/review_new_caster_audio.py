"""Create a listening index and flag potential repeats of existing clips."""
import difflib
import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'commentary/prepared_audio/finals_vocals'
rows=json.loads((OUT/'segments.json').read_text(encoding='utf8'))
old=json.loads((ROOT/'local_runtime/training_v2/segments.json').read_text(encoding='utf8'))
def tokens(text): return re.findall(r"[a-z']+",text.lower())
def stamp(t): return f'{int(t)//60}:{t%60:04.1f}'
for row in rows:
    voice_reasons={'weak_speaker_match','possible_turn_change_or_overlap','insufficient_voice_audio'}
    row['speaker_match_label']=(row['speaker_candidate'] if row.get('speaker_candidate') and
        not voice_reasons.intersection(row['reasons']) else 'uncertain')
    words=tokens(row['text'])
    if len(words)<6: continue
    matches=[]
    for prior in old:
        pwords=tokens(prior['text'])
        matcher=difflib.SequenceMatcher(None,words,pwords,autojunk=False)
        longest=matcher.find_longest_match().size
        if longest>=8 or (len(words)>=8 and matcher.ratio()>=.85):
            matches.append({'start':prior['start'],'text':prior['text'],
                            'path':prior['path'],'text_similarity':round(matcher.ratio(),3)})
    if matches: row['possible_existing_clip_matches']=matches
(OUT/'review-metadata.json').write_text(json.dumps(rows,indent=2),encoding='utf8')
summary=json.loads((OUT/'summary.json').read_text(encoding='utf8'))
summary['possible_repeat_clips']=sum(bool(r.get('possible_existing_clip_matches')) for r in rows)
summary['speaker_matches']={label:{'clips':sum(r['speaker_match_label']==label for r in rows),
    'minutes':round(sum(r['duration_seconds'] for r in rows if r['speaker_match_label']==label)/60,2)}
    for label in ('alex','caster_one','uncertain')}
(OUT/'summary.json').write_text(json.dumps(summary,indent=2),encoding='utf8')
lines=['# New finals recording: speaker review','',
       'These are automatic speaker candidates. Speech overlap has not been unmixed. Check the speaker, transcript, background noise, and vocal clarity before training. The running Caster One dataset is unchanged.','',
       '## Totals','']
for label in ('alex','caster_one','review'):
    item=summary[label]
    lines.append(f"- {label.title()}: {item['clips']} clips, {item['minutes']} minutes.")
lines.extend(['', 'Speaker matches independent of transcript quality: ' + str(summary['speaker_matches']), '',
              f"Potential repeats of existing match clips: {summary['possible_repeat_clips']}. These need checking before adding training material.",''])
for label in ('alex','caster_one','review'):
    lines.extend([f'## {label.title()}','', '| Time | Speaker match | Audio | Transcript | Notes |',
                  '|---|---|---|---|---|'])
    for row in rows:
        if row['label']!=label: continue
        notes=', '.join(row['reasons'])
        if row.get('possible_existing_clip_matches'): notes+=' possible existing clip'
        text=row['text'].replace('|','/').replace('\n',' ')
        path=Path(row['path']).as_posix()
        lines.append(f"| {stamp(row['start'])}–{stamp(row['end'])} | {row['speaker_match_label'].title()} | [Listen](<{path}>) | {text} | {notes} |")
    lines.append('')
(OUT/'review.md').write_text('\n'.join(lines),encoding='utf8')
print(json.dumps(summary,indent=2))
