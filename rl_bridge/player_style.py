"""Small ground-support biases, not new skills or changes to neural weights."""


def style_profile(player):
    attributes = player.get('attributes') or {}
    traits = player.get('traits') or {}
    raw = str(player.get('tendency', 'Balanced / Flex'))
    tendency = {'AGGRESSIVE_FIRST_MAN': 'Aggressive First Man',
                'MECHANICAL_CARRY': 'Mechanical Carry', 'PLAYMAKER': 'Playmaker',
                'SUPPORT': 'Support', 'DEFENSIVE_ANCHOR': 'Defensive Anchor',
                'DEMO_DISRUPTION': 'Demo / Disruption', 'BALANCED_FLEX': 'Balanced / Flex',
                'BALANCED': 'Balanced / Flex', 'STRIKER': 'Aggressive First Man'}.get(raw, raw)
    if raw.startswith('First Man'):tendency='Aggressive First Man'
    elif raw.startswith('Second Man'):tendency='Playmaker'
    elif raw.startswith('Third Man'):tendency='Defensive Anchor'
    discipline = max(0, min(1, (attributes.get('rotations', 80) +
                              attributes.get('positioning', 80)) / 200))
    # (support distance offset, teammate distance advantage before yielding,
    #  lateral support width). Actual career enum values, not unused aliases.
    settings = {
        'Aggressive First Man': (-180, 420, .55),
        'Mechanical Carry': (-100, 380, .55),
        'Playmaker': (80, 260, .85),
        'Support': (220, 220, .8),
        'Defensive Anchor': (350, 180, .45),
        'Demo / Disruption': (-80, 350, .65),
        'Balanced / Flex': (0, 300, .6),
        'Defensive': (350, 180, .45),
        'Aggressive': (-180, 420, .55),
    }
    offset, margin, width = settings.get(tendency, (0, 300, .6))
    orientation = max(0, min(1, traits.get('teamOrientation', 80) / 100))
    return {'supportDistance': 950 + 450 * discipline + offset,
            'yieldMargin': margin + 100 * (.8 - orientation),
            'supportWidth': width, 'tendency': tendency}
