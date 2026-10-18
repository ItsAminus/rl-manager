import unittest,tempfile
from pathlib import Path
from unittest.mock import patch
import sys
sys.path.insert(0,str(Path(__file__).parent/'commentary'))
from runtime_paths import speech_python,speech_model,speech_pythons

class PortableRuntimeTests(unittest.TestCase):
    def test_optional_amd_speech_runtime_does_not_replace_the_bot_runtime(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as name:
            root=Path(name);(root/'python').mkdir();(root/'python/python.exe').touch()
            optional=root/'AMD speech.exe';optional.touch()
            self.assertEqual(speech_pythons(root,{'RLM_SPEECH_PYTHON':str(optional)}),[optional,root/'python/python.exe'])
            self.assertEqual(speech_pythons(root,{'RLM_SPEECH_PYTHON':str(root/'missing.exe')}),[root/'python/python.exe'])
    def test_portable_python_and_models_do_not_depend_on_original_username(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as name:
            root=Path(name)/'another user runtime'
            (root/'python').mkdir(parents=True);(root/'python/python.exe').touch()
            (root/'chatterbox_model').mkdir();(root/'chatterbox_model/t3_cfg.safetensors').touch()
            with patch('runtime_paths.Path.home',return_value=Path(name)/'empty profile'):
                self.assertEqual(speech_python(root),root/'python/python.exe')
                self.assertEqual(speech_model(root),root/'chatterbox_model')
    def test_old_development_runtime_still_works(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as name:
            root=Path(name)
            model=root/'.cache/huggingface/hub/models--ResembleAI--chatterbox/snapshots/old'
            model.mkdir(parents=True);(model/'t3_cfg.safetensors').touch()
            with patch('runtime_paths.Path.home',return_value=root):
                self.assertEqual(speech_python(root),root/'chatterbox_venv/Scripts/python.exe')
                self.assertEqual(speech_model(root),model)
