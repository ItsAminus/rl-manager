"""Offline match assignment preview. Never starts a game."""
import json
import sys
from rating_bots import rating_plan


def plan(context):
    return rating_plan(context,allow_partial=True)


if __name__ == '__main__':
    try:
        print(json.dumps({'success': True, **plan(json.load(sys.stdin))}))
    except Exception as exc:
        print(json.dumps({'success': False, 'error': str(exc)}))
        sys.exit(1)
