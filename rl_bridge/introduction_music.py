"""Independent PCM music lane, software-ducked below player-card speech."""
from array import array
import ctypes
import math
import os
from pathlib import Path
import threading
import time
import wave
from commentary.windows_audio import WaveFormat, WaveHeader


def gain_block(data, first, last):
    samples=array('h');samples.frombytes(data)
    length=max(1,len(samples)-1)
    return array('h',(round(sample*(first+(last-first)*index/length)) for index,sample in enumerate(samples))).tobytes()


def play_music(source, stopped, target, on_started, fade):
    with wave.open(str(source),'rb') as wav:
        channels,rate,width=wav.getnchannels(),wav.getframerate(),wav.getsampwidth()
        if width!=2 or wav.getcomptype()!='NONE':raise ValueError('Introduction music requires PCM16')
        pcm=wav.readframes(wav.getnframes())
    api=ctypes.WinDLL('winmm')
    api.waveOutOpen.argtypes=[ctypes.POINTER(ctypes.c_void_p),ctypes.c_uint,ctypes.POINTER(WaveFormat),ctypes.c_size_t,ctypes.c_size_t,ctypes.c_uint]
    for name in ('waveOutPrepareHeader','waveOutWrite','waveOutUnprepareHeader'):
        getattr(api,name).argtypes=[ctypes.c_void_p,ctypes.POINTER(WaveHeader),ctypes.c_uint]
    for name in ('waveOutReset','waveOutClose'):getattr(api,name).argtypes=[ctypes.c_void_p]
    def check(code):
        if code:raise RuntimeError('Windows music output failed ('+str(code)+')')
    alignment=channels*width;fmt=WaveFormat(1,channels,rate,rate*alignment,alignment,16,0);handle=ctypes.c_void_p()
    check(api.waveOutOpen(ctypes.byref(handle),0xffffffff,ctypes.byref(fmt),0,0,0))
    queued=[];offset=0;step=max(alignment,int(rate*.08)*alignment);level=0.;fade_start=None;fade_level=0.;started=False
    try:
        while True:
            for header,buffer in list(queued):
                if header.flags&1:
                    api.waveOutUnprepareHeader(handle,ctypes.byref(header),ctypes.sizeof(header));queued.remove((header,buffer))
            now=time.monotonic()
            if stopped.is_set() and fade_start is None:fade_start=now;fade_level=level
            if fade_start is not None and now-fade_start>=fade:break
            if len(queued)>=2:time.sleep(.005);continue
            desired=fade_level*max(0.,1-(now-fade_start)/max(.001,fade)) if fade_start is not None else target()
            next_level=desired if fade_start is not None else level+(desired-level)*(1-math.exp(-.08/(.2 if desired<level else 1.)))
            part=pcm[offset:offset+step]
            if len(part)<step:part+=pcm[:step-len(part)]
            offset=(offset+step)%len(pcm)
            buffer=ctypes.create_string_buffer(gain_block(part,level,next_level));level=next_level
            header=WaveHeader(ctypes.cast(buffer,ctypes.c_void_p),len(buffer)-1,0,0,0,0,None,0)
            check(api.waveOutPrepareHeader(handle,ctypes.byref(header),ctypes.sizeof(header)))
            queued.append((header,buffer));check(api.waveOutWrite(handle,ctypes.byref(header),ctypes.sizeof(header)))
            if not started:on_started();started=True
    finally:
        api.waveOutReset(handle)
        for header,buffer in queued:api.waveOutUnprepareHeader(handle,ctypes.byref(header),ctypes.sizeof(header))
        api.waveOutClose(handle)


class IntroductionMusic:
    def __init__(self,log=print,source=None,sink=None,fade=.65):
        self.log=log
        self.source=Path(source or os.environ.get('RLM_INTRO_MUSIC','') or Path(__file__).resolve().parents[1]/'public/audio/introduction-anticipation.wav')
        self.sink=sink or play_music;self.fade=fade
        self.stopped=threading.Event();self.ready=threading.Event();self.ducked=False;self.thread=None
    def start(self):
        if self.thread or not self.source.is_file():return False
        self.thread=threading.Thread(target=self._run,name='player-introduction-music',daemon=True);self.thread.start();return True
    def set_ducked(self,active):self.ducked=bool(active)
    def stop(self,wait=True):
        self.stopped.set()
        if wait and self.thread and self.thread is not threading.current_thread():self.thread.join(self.fade+.8)
    def _run(self):
        def on_started():
            self.ready.set();self.log('Player introductions: Anticipation music started; dedicated background lane')
        try:self.sink(self.source,self.stopped,lambda:.18 if self.ducked else .4,on_started,self.fade)
        except Exception as error:self.log('Introduction music unavailable; player speech continues: '+str(error))
        finally:self.ready.set()
