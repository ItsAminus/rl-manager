"""Independent Windows waveOut lanes, without third-party audio dependencies."""
import ctypes
from ctypes import wintypes
import io
import wave


class WaveFormat(ctypes.Structure):
    _pack_ = 2
    _fields_ = [('format', wintypes.WORD), ('channels', wintypes.WORD),
                ('rate', wintypes.DWORD), ('bytes_per_second', wintypes.DWORD),
                ('alignment', wintypes.WORD), ('bits', wintypes.WORD), ('extra', wintypes.WORD)]


class WaveHeader(ctypes.Structure):
    _fields_ = [('data', ctypes.c_void_p), ('length', wintypes.DWORD),
                ('recorded', wintypes.DWORD), ('user', ctypes.c_size_t),
                ('flags', wintypes.DWORD), ('loops', wintypes.DWORD),
                ('next', ctypes.c_void_p), ('reserved', ctypes.c_size_t)]


def play_windows(wav, cancelled):
    """Use the Windows default output; reset only this lane on a goal cut-in."""
    with wave.open(io.BytesIO(wav), 'rb') as source:
        channels, rate, width = source.getnchannels(), source.getframerate(), source.getsampwidth()
        if source.getcomptype() != 'NONE' or width != 2:
            raise ValueError('Windows audio requires PCM16 recordings')
        pcm = source.readframes(source.getnframes())
    api = ctypes.WinDLL('winmm')
    api.waveOutOpen.argtypes = [ctypes.POINTER(ctypes.c_void_p), wintypes.UINT,
                               ctypes.POINTER(WaveFormat), ctypes.c_size_t, ctypes.c_size_t, wintypes.DWORD]
    for name in ('waveOutPrepareHeader', 'waveOutWrite', 'waveOutUnprepareHeader'):
        getattr(api, name).argtypes = [ctypes.c_void_p, ctypes.POINTER(WaveHeader), wintypes.UINT]
    for name in ('waveOutReset', 'waveOutClose'):
        getattr(api, name).argtypes = [ctypes.c_void_p]
    def check(code, operation):
        if code:
            description = ctypes.create_unicode_buffer(256)
            api.waveOutGetErrorTextW(code, description, len(description))
            raise RuntimeError(f'{operation}: {description.value} ({code})')
    alignment = channels * width
    fmt = WaveFormat(1, channels, rate, rate * alignment, alignment, width * 8, 0)
    handle = ctypes.c_void_p()
    check(api.waveOutOpen(ctypes.byref(handle), 0xffffffff, ctypes.byref(fmt), 0, 0, 0), 'Open Windows output')
    buffer = ctypes.create_string_buffer(pcm)
    header = WaveHeader(ctypes.cast(buffer, ctypes.c_void_p), len(pcm), 0, 0, 0, 0, None, 0)
    prepared = False
    try:
        check(api.waveOutPrepareHeader(handle, ctypes.byref(header), ctypes.sizeof(header)), 'Prepare Windows audio')
        prepared = True
        if cancelled.is_set():
            return False
        check(api.waveOutWrite(handle, ctypes.byref(header), ctypes.sizeof(header)), 'Play Windows audio')
        while not header.flags & 1:  # WHDR_DONE
            if cancelled.wait(.01):
                check(api.waveOutReset(handle), 'Stop Windows audio')
                return False
        return not cancelled.is_set()
    finally:
        api.waveOutReset(handle)
        if prepared:
            api.waveOutUnprepareHeader(handle, ctypes.byref(header), ctypes.sizeof(header))
        api.waveOutClose(handle)
