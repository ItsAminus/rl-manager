"""Check each local policy in isolation, retaining actionable import failures."""
import argparse
import json
import subprocess
import sys
from pathlib import Path
from bot_assignment import engine_config

BOT_LOAD_TIMEOUT = 60

# Descending local strength, including policies used by legacy series locks.
LOCAL_LADDER = (
    ('Nexto',), ('Necto', 'Element'), ('Botimus Prime', 'ReliefBot', 'Bumblebee', 'RedBot'),
    ('Stick', 'Codename Cryo', 'Wildfire'),
    ('PenguinBot', 'VirxEB', 'Bribblebot', 'Lanfear', 'Beast from the East'), ('Career Rookie',),
)


def candidates(engine):
    for index, pool in enumerate(LOCAL_LADDER):
        if engine in pool:
            levels=sorted((i for i in range(len(LOCAL_LADDER)) if i!=index),
                          key=lambda i:(abs(i-index),i<index))
            return [engine, *[name for name in pool if name != engine],
                    *[name for i in levels for name in LOCAL_LADDER[i]]]
    return [engine]


def check_bot(cfg, python=None):
    if cfg is None or not Path(cfg).is_file():
        return False, 'Bot configuration is missing from the selected bot pack.'
    cfg = Path(cfg).resolve()
    check = '''import sys
from pathlib import Path
from importlib.metadata import distribution
from packaging.requirements import Requirement
from rlbot.parsing.bot_config_bundle import get_bot_config_bundle
from rlbot.utils.class_importer import import_agent
b=get_bot_config_bundle(sys.argv[1])
if b.requirements_file:
    for line in Path(b.requirements_file).read_text(encoding='utf-8-sig').splitlines():
        line=line.split(' #',1)[0].strip()
        if not line or line.startswith(('#','--find-links','--index-url','--extra-index-url')):continue
        req=Requirement(line)
        if req.marker is None or req.marker.evaluate():distribution(req.name)
import_agent(b.python_file).get_loaded_class()('test',0,0)
'''
    try:
        result = subprocess.run([str(python or sys.executable), '-B', '-c', check, str(cfg)],
                                cwd=str(cfg.parent), capture_output=True, text=True, errors='replace',
                                timeout=BOT_LOAD_TIMEOUT, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if result.returncode == 0:return True, ''
        return False, (result.stderr or result.stdout or f'Exit code {result.returncode}')[-4000:].strip()
    except subprocess.TimeoutExpired:
        return False, f'Bot import/constructor exceeded {BOT_LOAD_TIMEOUT} seconds.'
    except OSError as exc:
        return False, str(exc)


def audit(folder, python=None):
    return {name: dict(zip(('healthy', 'error'), check_bot(engine_config(folder, name), python)))
            for pool in LOCAL_LADDER for name in pool}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--botpack', required=True)
    parser.add_argument('--python')
    parser.add_argument('--report')
    args = parser.parse_args()
    results = audit(Path(args.botpack), args.python)
    output = json.dumps(results, indent=2)
    if args.report:Path(args.report).write_text(output, encoding='utf-8')
    print(output)
    sys.exit(0 if all(row['healthy'] for row in results.values()) else 1)
