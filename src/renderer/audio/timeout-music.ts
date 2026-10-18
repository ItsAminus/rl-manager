import {publicAssetUrl} from '../utils/public-assets';
import {readSoundSettings, type SoundSettings} from './ui-sounds';

type TimeoutCue={key:string;endsAt:number;startedAt:number};

export class TimeoutMusic {
  revision=0;
  private audio?:HTMLAudioElement;
  private cue:TimeoutCue|null=null;
  private timer?:ReturnType<typeof setTimeout>;
  private pending=false;
  constructor(private create=()=>new Audio(publicAssetUrl('/audio/timeout.ogg')),
              private settings:()=>SoundSettings=readSoundSettings){}

  sync(cue:TimeoutCue|null){
    this.revision++;
    if(!cue||cue.endsAt<=Date.now()){this.stop();return;}
    if(this.cue?.key!==cue.key){
      this.stop();
      this.cue=cue;
      this.audio ||= this.create();
      this.audio.loop=true;
      this.audio.preload='auto';
      this.seek();
    }else this.cue=cue;
    if(this.timer)clearTimeout(this.timer);
    // Stop at the deadline itself, independently of the UI's one-second poll.
    this.timer=setTimeout(()=>this.stop(),Math.max(0,cue.endsAt-Date.now()));
    this.resume();
  }
  private seek(){
    if(!this.audio||!this.cue)return;
    const elapsed=Math.max(0,(Date.now()-this.cue.startedAt)/1000);
    try{this.audio.currentTime=Number.isFinite(this.audio.duration)&&this.audio.duration>0?elapsed%this.audio.duration:elapsed;}catch{/* Seek after metadata on the next resume. */}
  }
  resume(){
    if(!this.cue||!this.audio)return;
    if(this.cue.endsAt<=Date.now()){this.stop();return;}
    const settings=this.settings();
    this.audio.volume=settings.volume;
    if(!settings.enabled||!settings.volume){this.audio.pause();return;}
    if(!this.audio.paused||this.pending)return;
    this.seek();
    this.pending=true;
    // An opponent timeout can begin without a click. If autoplay is blocked,
    // the next interaction retries; rejected playback never blocks the game.
    void this.audio.play().catch(()=>{}).finally(()=>{
      this.pending=false;
      const current=this.settings();
      if(!this.cue||this.cue.endsAt<=Date.now()||!current.enabled||!current.volume)this.audio?.pause();
    });
  }
  stop(){
    this.revision++;
    if(this.timer)clearTimeout(this.timer);
    this.timer=undefined;
    this.cue=null;
    if(this.audio){this.audio.pause();try{this.audio.currentTime=0;}catch{}}
  }
}

export const timeoutMusic=new TimeoutMusic();
export function syncTimeoutMusic(careerId:string,fixtureId:string|null,state:any){
  const active=state?.active;
  const offset=Date.now()-state.serverNow;
  timeoutMusic.sync(active&&fixtureId?{
    key:`${careerId}:${fixtureId}:${active.side}:${active.endsAt}`,
    endsAt:active.endsAt+offset,
    startedAt:(active.startedAt??active.endsAt-60_000)+offset,
  }:null);
}
