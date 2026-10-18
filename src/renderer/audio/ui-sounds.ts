export type UISound='tap'|'navigate'|'chirp'|'post'|'like'|'repost'|'follow'|'message'|'success'|'error'|'match';
export type SoundSettings={enabled:boolean;volume:number};
const key='rl-manager-ui-sounds';
export function readSoundSettings():SoundSettings{
  try{const value=JSON.parse(localStorage.getItem(key)||'{}');return {enabled:value.enabled!==false,volume:Math.max(0,Math.min(1,Number.isFinite(value.volume)?value.volume:.3))};}
  catch{return {enabled:true,volume:.3};}
}
export function saveSoundSettings(value:SoundSettings){localStorage.setItem(key,JSON.stringify(value));window.dispatchEvent(new Event('rl-manager-sound-settings'));}
let context:AudioContext|undefined,lastType='',lastAt=0,voices=0;
export function playUiSound(type:UISound){
  const settings=readSoundSettings();
  if(!settings.enabled||!settings.volume||document.visibilityState==='hidden')return;
  const stamp=performance.now();if(type===lastType&&stamp-lastAt<100)return;
  if(voices>=6)return;
  lastAt=stamp;lastType=type;
  try{
    context ||= new AudioContext();
    if(context.state==='suspended')void context.resume().catch(()=>{});
    const audio=context,start=audio.currentTime+.005;
    const tone=(frequency:number,end:number,offset:number,duration:number,shape:OscillatorType='sine')=>{
      const oscillator=audio.createOscillator(),gain=audio.createGain();voices++;
      oscillator.type=shape;oscillator.frequency.setValueAtTime(frequency,start+offset);
      oscillator.frequency.exponentialRampToValueAtTime(end,start+offset+duration);
      gain.gain.setValueAtTime(.0001,start+offset);
      gain.gain.exponentialRampToValueAtTime(settings.volume*.17,start+offset+.012);
      gain.gain.exponentialRampToValueAtTime(.0001,start+offset+duration);
      oscillator.connect(gain);gain.connect(audio.destination);
      oscillator.onended=()=>{voices--;oscillator.disconnect();gain.disconnect();};
      oscillator.start(start+offset);oscillator.stop(start+offset+duration+.01);
    };
    if(type==='chirp'||type==='post'){
      tone(2100,4100,0,.11);tone(3700,1700,.10,.11);tone(2400,3900,.26,.10);
      if(type==='post')tone(3500,1700,.37,.09);
    }else if(type==='success'){tone(520,520,0,.10);tone(660,660,.09,.10);tone(830,830,.18,.16);}
    else if(type==='error'){tone(220,140,0,.18,'triangle');}
    else if(type==='message'){tone(880,880,0,.09);tone(1175,1175,.10,.15);}
    else if(type==='follow'){tone(660,990,0,.11);tone(990,1320,.12,.13);}
    else if(type==='repost'){tone(480,750,0,.09);tone(750,480,.10,.09);}
    else if(type==='like'){tone(350,950,0,.09,'triangle');}
    else if(type==='match'){tone(330,660,0,.22);tone(495,990,.09,.22);}
    else if(type==='navigate'){tone(520,740,0,.075);}
    else tone(420,290,0,.035,'triangle');
  }catch{/* Missing audio support never blocks an action. */}
}
