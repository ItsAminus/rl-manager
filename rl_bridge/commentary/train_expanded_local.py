"""Train both expanded interview datasets, stopping on incomplete features."""
import time
from pathlib import Path
import train_v2_local as training

def main():
    for speaker in training.REFS:
        training.features(speaker)
    for speaker in training.REFS:
        folder = training.RUN / speaker
        # Preserve every prior run; never resume a model from a different list.
        backup = folder / ('before_expanded_' + time.strftime('%Y%m%d_%H%M%S'))
        backup.mkdir()
        for name in ('logs_s2_v2', 'logs_s1', 'weights'):
            source = folder / name
            if source.exists():
                source.rename(backup / name)
            source.mkdir()
        for stage, script, option, config in (
            ('sovits', 's2_train.py', '--config', 's2.json'),
            ('gpt', 's1_train.py', '--config_file', 's1.yaml'),
        ):
            log = f'{speaker}-expanded-{stage}.log'
            training.status('training_expanded', speaker=speaker, model=stage, log=log)
            training.command([training.SOURCE/'GPT_SoVITS'/script, option, folder/config], log, {'hz':'25hz'})
    training.status('expanded_training_complete')

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        training.status('failed', error=str(exc))
        raise
