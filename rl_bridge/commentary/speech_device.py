"""Select an actual working compute device, without a GPU model whitelist."""
from dataclasses import dataclass


@dataclass(frozen=True)
class SpeechDevice:
    device: str
    backend: str
    label: str
    reason: str = ''


def cpu_device(reason=''):
    return SpeechDevice('cpu', 'cpu', 'CPU (Caster One and Caster Two)', reason)


def select_device(torch, preference='auto'):
    if preference not in ('auto', 'cpu'):
        raise ValueError('Speech device must be auto or cpu')
    if preference == 'cpu':
        return cpu_device('CPU selected in Settings')
    try:
        if not torch.cuda.is_available():
            return cpu_device('GPU acceleration is unavailable in this speech runtime')
        # ROCm intentionally exposes the torch.cuda API too. Test a kernel,
        # rather than accepting an adapter name or an unverified driver alone.
        torch.ones(1, device='cuda').add_(1).cpu()
        backend = 'rocm' if getattr(torch.version, 'hip', None) else 'cuda'
        return SpeechDevice('cuda', backend, torch.cuda.get_device_name(0))
    except Exception as error:
        return cpu_device(f'GPU probe failed: {error}')
