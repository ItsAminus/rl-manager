"""Private runtime environment; never changes the user's global Java/Python."""
import os
import sys
from pathlib import Path
root=Path(sys.executable).resolve().parent.parent
# The shipped neural policies and speech model use PyTorch, not TensorFlow/Flax.
os.environ.setdefault('USE_TF','0')
os.environ.setdefault('USE_FLAX','0')
java=root/'java'
homes=([java] if (java/'bin/java.exe').is_file() else sorted(p for p in java.glob('*') if (p/'bin/java.exe').is_file()))
if homes:
    os.environ['JAVA_HOME']=str(homes[0])
    os.environ['PATH']=str(homes[0]/'bin')+os.pathsep+os.environ.get('PATH','')
