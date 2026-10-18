"""Retry Caster One GPT with existing data/config; never rerun SoVITS or features."""
import train_v2_local as training
try:
    training.status('training_expanded', speaker='caster_one', model='gpt', log='caster_one-expanded-gpt.log')
    training.command([training.SOURCE/'GPT_SoVITS/s1_train.py', '--config_file',
                      training.RUN/'caster_one/s1.yaml'], 'caster_one-expanded-gpt.log', {'hz':'25hz'})
    training.status('expanded_training_complete')
except Exception as exc:
    training.status('failed',error=str(exc))
    raise
