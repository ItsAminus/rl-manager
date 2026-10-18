import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {TimeoutMusic} from '../src/renderer/audio/timeout-music';

let audio:any,music:TimeoutMusic,settings:{enabled:boolean;volume:number};
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(100_000);
  settings={enabled:true,volume:.3};
  audio={paused:true,currentTime:0,duration:69.64,loop:false,volume:0,preload:'',
    play:vi.fn(async()=>{audio.paused=false;}),pause:vi.fn(()=>{audio.paused=true;})};
  music=new TimeoutMusic(()=>audio,()=>settings);
});
afterEach(()=>{music.stop();vi.useRealTimers();});
const cue=(key='manager',endsAt=160_000)=>({key,startedAt:endsAt-60_000,endsAt});

describe('timeout music lifecycle',()=>{
  it('starts and loops immediately, ignores repeated state polls, and cuts off at the exact deadline',async()=>{
    music.sync(cue());await Promise.resolve();
    expect(audio.play).toHaveBeenCalledOnce();expect(audio.loop).toBe(true);expect(audio.volume).toBe(.3);
    await vi.advanceTimersByTimeAsync(25_000);music.sync(cue());
    expect(audio.play).toHaveBeenCalledOnce();expect(audio.currentTime).toBe(0);
    await vi.advanceTimersByTimeAsync(34_999);expect(audio.paused).toBe(false);
    await vi.advanceTimersByTimeAsync(1);expect(audio.paused).toBe(true);expect(audio.currentTime).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('supports opponent timeouts, resumes at their elapsed time after reload, and stops when the active timeout disappears',async()=>{
    vi.setSystemTime(120_000);music.sync(cue('opponent'));await Promise.resolve();
    expect(audio.currentTime).toBe(20);expect(audio.paused).toBe(false);
    music.sync(null);expect(audio.paused).toBe(true);expect(audio.currentTime).toBe(0);
  });
  it('never starts expired audio and cannot leave a delayed play promise running after cancellation',async()=>{
    music.sync(cue('expired',99_999));expect(audio.play).not.toHaveBeenCalled();
    let finish!:()=>void;
    audio.play.mockImplementation(()=>new Promise<void>(resolve=>{finish=()=>{audio.paused=false;resolve();};}));
    music.sync(cue());music.stop();finish();
    await Promise.resolve();await Promise.resolve();await Promise.resolve();
    expect(audio.paused).toBe(true);
  });
  it('respects mute/volume changes and resumes within the original minute without extending it',async()=>{
    settings.enabled=false;music.sync(cue());expect(audio.play).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);settings.enabled=true;settings.volume=.6;music.resume();
    await Promise.resolve();expect(audio.volume).toBe(.6);expect(audio.currentTime).toBe(10);
    settings.volume=0;music.resume();expect(audio.paused).toBe(true);
    await vi.advanceTimersByTimeAsync(50_000);settings.volume=.3;music.resume();
    expect(audio.play).toHaveBeenCalledOnce();expect(audio.paused).toBe(true);
  });
  it('can retry blocked autoplay on a later interaction, without overlapping players',async()=>{
    audio.play.mockRejectedValueOnce(new Error('Autoplay blocked'));
    music.sync(cue());await Promise.resolve();await Promise.resolve();await Promise.resolve();
    music.resume();await Promise.resolve();
    expect(audio.play).toHaveBeenCalledTimes(2);expect(audio.paused).toBe(false);
  });
});
