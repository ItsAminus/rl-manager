"""Exercise the exact shipped recording bank and native match audio helpers."""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
sys.path[:0] = [str(ROOT), str(ROOT.parent)]
from clip_broadcast import ClipBank
from native_audio import ClipPlayer


def check(play=False, silent=False):
    bank = ClipBank(ROOT / 'voice_bank', 48000)
    result = {'success': True, 'recordings': len(bank.clips), 'invalidFiles': bank.errors, 'lanes': []}
    if bank.errors:
        raise RuntimeError('Unreadable recordings: ' + '; '.join(bank.errors[:3]))
    for name, category in (('Commentary', 'kickoff'), ('Goal crowd', 'crowd_goal'), ('10-second countdown', 'countdown')):
        chosen = bank.draw(category)
        if chosen is None:
            raise RuntimeError(f'{name} recordings are missing; rerun the complete setup')
        player = ClipPlayer(continuous_output=True)
        try:
            if play or silent:
                pcm = bank.np.zeros(4800, dtype=bank.np.float32) if silent else chosen[1]
                player.play(pcm, interruptible=True)
                if not player.finished.wait(len(pcm) / 48000 + 35):
                    raise TimeoutError(f'{name} playback timed out')
                player.check_health()
            result['lanes'].append({'name': name, 'clip': chosen[0],
                                    'played': play or silent, 'diagnostics': list(player.sink.diagnostics)})
        finally:
            player.close()
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--play', action='store_true')
    parser.add_argument('--silent', action='store_true')
    args = parser.parse_args()
    try:
        print(json.dumps(check(args.play, args.silent)), flush=True)
    except Exception as exc:
        print(json.dumps({'success': False, 'error': str(exc)}), flush=True)
        sys.exit(1)
