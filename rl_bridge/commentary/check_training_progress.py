"""Print an approximate overall percentage for the detached V2 pipeline."""
import json
from pathlib import Path
import re

RUN = Path(__file__).resolve().parents[2] / 'rl_bridge/local_runtime/training_v2'
stages = [('preparation', 0.15), ('caster_two-sovits', .2125), ('caster_two-gpt', .2125),
          ('caster_one-sovits', .2125), ('caster_one-gpt', .2125)]
status = json.loads((RUN/'status.json').read_text()) if (RUN/'status.json').exists() else {}
current = status.get('stage', 'unknown')
active_name = (str(status.get('speaker','')) + '-' + str(status.get('model',''))).strip('-')
done = 0.0
for name, weight in stages:
    preparation_ready = (RUN/'dataset_summary.json').exists() and all(
        (RUN/speaker/'6-name2semantic.tsv').exists() and (RUN/speaker/'2-name2text.txt').exists()
        for speaker in ('caster_two', 'caster_one'))
    if (name == 'preparation' and preparation_ready) or (RUN/(name+'.done')).exists():
        done += weight
        continue
    if name in current or active_name == name:
        log = RUN/(name+'.log')
        text = log.read_text(errors='ignore') if log.exists() else ''
        epochs = [int(x) for x in re.findall(r'(?:Epoch|epoch)[^0-9]{0,8}(\d+)', text)]
        if not epochs:
            steps = [int(x) for x in re.findall(r'global_step[^0-9]*(\d+)', text)]
            epochs = [int(max(steps, default=0) / 56)]
        total = 12 if name.endswith('sovits') else 15
        done += weight * min(1, (max(epochs) / total if epochs else 0))
        break
    break
print(json.dumps({'overall_percent': round(done*100, 1), 'stage': current,
                  'speaker': status.get('speaker'), 'model': status.get('model'),
                  'log': status.get('log'), 'status_file': str(RUN/'status.json')}))
