import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import type { ChirpMatchContext } from './chirp-match-context';

export type TextJob = {id:string; context:{author:string;role:string;draft:string;thread?:string;topic:string;voice?:string;tone?:string;intent?:string;conversation?:{author:string;body:string}[];avoid?:string[];matchContext?:ChirpMatchContext;managerClub?:string}};
export interface ChirpTextGenerator {generate(jobs:TextJob[]):Promise<Record<string,string>>;close():void;pause?(paused:boolean):void}

// Facts stay in the database. The model changes the phrasing, never the results.
export function validChirpText(body:unknown, job:TextJob):body is string {
  if(typeof body!=='string' || body.trim().length<2 || body.length>500 || /<\|im_|https?:\/\//i.test(body))return false;
  if(/[{}]|\b(?:body|replyTo|verifiedMatch)"\s*:|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/i.test(body))return false;
  if(/as an ai|in conclusion|i'm all ears|we need more details|reviews? from the referees|keep up the (?:great|good) work|great job,|keep it up!|please let the last guy breathe this week/i.test(body))return false;
  const facts=job.context.draft; // Parent posts are conversation context, not verified match facts.
  const discussionFacts=facts+' '+(job.context.thread||'')+' '+(job.context.conversation||[]).map(p=>p.body).join(' ')+' '+JSON.stringify(job.context.matchContext||{});
  if(/fraud watch|my grandma|big talk|couldn't disagree|hope.*backs it up/i.test(facts) && /great job|well done|keep it up|good luck|love seeing/i.test(body))return false;
  if(/speculation|speculative|wishlist|not a report|not.*confirmed/i.test(facts) && !/speculation|speculative|wishlist|not a report|unconfirmed|not.*confirmed|could|would|might/i.test(body))return false;
  const numbers=new Set(facts.match(/\b\d+(?:\.\d+)?\b/g)||[]);
  const allowedNumbers=new Set(discussionFacts.match(/\b\d+(?:\.\d+)?\b/g)||[]);
  const spokenNumbers=new Set(body.match(/\b\d+(?:\.\d+)?\b/g)||[]);
  if([...spokenNumbers].some(n=>!allowedNumbers.has(n))||[...numbers].some(n=>!spokenNumbers.has(n)))return false;
  const scoreTokens=facts.match(/\b\d+(?:[–-]\d+)+\b/g)||[];
  if(scoreTokens.some(score=>!body.includes(score)))return false;
  // Having seen the digits 5 and 0 elsewhere is not evidence for a 5–0 score.
  const pairs=(s:string)=>[...s.matchAll(/\b(\d+)\s*(?:[–—-]|to)\s*(\d+)\b/gi)].map(m=>[Number(m[1]),Number(m[2])].sort((a,b)=>a-b).join(':'));
  const suppliedPairs=new Set(pairs(discussionFacts));
  if(pairs(body).some(pair=>!suppliedPairs.has(pair)))return false;
  if(job.context.matchContext){
    const match=job.context.matchContext;
    const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const actual=match.seriesScore.split('–').map(Number);
    if(match.status==='completed' && actual.length===2 && actual[0]!==actual[1]){
      const loser=actual[0]<actual[1]?match.home:match.away;
      const winner=loser===match.home?match.away:match.home;
      if(new RegExp(`${escape(loser)} (?:just )?(?:won|win|wins|take|takes|took) (?:the |this )?series\\b`,'i').test(body))return false;
      const wrongWin=new RegExp(`${escape(loser)}([^.!?\\n]{0,80})\\b(?:won|wins?)\\b[^.!?\\n]{0,35}(?:\\bseries\\b|\\b${Math.max(...actual)}[–-]${Math.min(...actual)}\\b)`,'gi');
      for(const claim of body.matchAll(wrongWin))if(!claim[1].toLowerCase().includes(winner.toLowerCase())&&!/could|should|would|might|almost|\bif\b/i.test(claim[1]))return false;
    }
    const lead=match.facts.join(' ').match(/(.+?) led the series (\d+)–0, then/);
    if(lead){
      const leader=[match.home,match.away].find(n=>lead[1].endsWith(n));
      if(leader){const other=leader===match.home?match.away:match.home;
        if(new RegExp(`${escape(other)} (?:led|lead|were up|was up|went up) (?:the series )?${lead[2]}[–-]0`,'i').test(body))return false;
      }
    }
  }
  const counts=body.match(/\b\d+ (?:games?|series|wins?|losses?|minutes?|seconds?)\b/gi)||[];
  if(counts.some(count=>!discussionFacts.toLowerCase().includes(count.toLowerCase())))return false;
  if(job.context.thread){
    const words=(s:string)=>s.toLowerCase().match(/[a-z]+/g)||[];
    const original=new Set(words(job.context.thread)),reply=words(body);
    if(reply.length>8 && reply.filter(w=>original.has(w)).length/reply.length>.75)return false;
  }
  const subject=facts.match(/^(.+?) (?:missed|made|scored|removed|finishes|win|wins|take|takes|renew|joins)\b/i)?.[1];
  if(subject&&!body.toLowerCase().includes(subject.toLowerCase()))return false;
  const values=[...facts.matchAll(/\b(\d+) (goals?|assists?|saves?|shots?)\b/g)];
  for(const [,value,stat] of values)if(!new RegExp(`\\b${value} ${stat.replace(/s$/,'')}s?\\b`,'i').test(body))return false;
  for(const [,value,stat] of body.matchAll(/\b(\d+) (goals?|assists?|saves?|shots?)\b/g))
    if(!new RegExp(`\\b${value} ${stat.replace(/s$/,'')}s?\\b`,'i').test(discussionFacts))return false;
  for(const [claim,allowed] of [
    [/open[ -]?net|empty[ -]?net/i,/open[ -]?net|empty[ -]?net/i],
    [/own[ -]?goal/i,/own[ -]?goal/i],
    [/double[ -]?commit/i,/double[ -]?commit/i],
    [/missed|whiffed|blunder/i,/missed|miss|whiff|mistake|blunder/i],
    [/reverse[ -]?(?:sweep|swept)/i,/reverse[ -]?sweep/i],
  ])if(claim.test(body)&&!allowed.test(discussionFacts))return false;
  // Preserve explicitly named subjects, scores and incident counts in factual reports.
  const mentions=facts.match(/\b[^.!?]+?: \d+ goals/)?.[0]?.split(':')[0];
  if(mentions && !body.includes(mentions))return false;
  return true;
}

export class LocalChirpText implements ChirpTextGenerator {
  private process?:ChildProcess;
  private starting?:Promise<string>;
  private closed=false;
  private paused=false;
  private generation=0;
  private repliesInWorker=0;
  constructor(private runtime:string,private diagnostic?:(id:string,body:unknown,accepted:boolean)=>void,private modelFile?:string){}
  close(){this.closed=true;this.process?.kill();}
  pause(paused:boolean){
    this.paused=paused;
    if(paused){this.generation++;this.process?.kill();this.process=undefined;this.starting=undefined;}
  }
  private async start():Promise<string> {
    if(this.closed||this.paused)throw new Error('Chirp text generation paused');
    if(this.starting)return this.starting;
    const generation=this.generation;
    this.starting=(async()=>{
      // Share the compact model with the commentary director instead of
      // installing a second 2 GB model just for Chirp. Workers stay CPU-only
      // and are terminated when gameplay starts. Explicit test overrides stay.
      const model=path.join(this.runtime,'text_model',this.modelFile||'qwen2.5-1.5b-instruct-q4_k_m.gguf');
      const exe=path.join(this.runtime,'llama','llama-server.exe');
      if(!fs.existsSync(exe)||!fs.existsSync(model))throw new Error('Local Chirp model is unavailable');
      const port=await new Promise<number>((resolve,reject)=>{const socket=net.createServer();socket.on('error',reject);socket.listen(0,'127.0.0.1',()=>{const port=(socket.address() as net.AddressInfo).port;socket.close(()=>resolve(port));});});
      const proc=this.process=spawn(exe,['-m',model,'--host','127.0.0.1','--port',String(port),'-c','4096','-np','1','-ngl','0','-t','2','-tb','2','--poll','0','--log-disable'],{windowsHide:true,stdio:'ignore'});
      let failed:Error|undefined;proc.on('error',e=>{failed=e;});
      try{if(proc.pid)os.setPriority(proc.pid,os.constants.priority.PRIORITY_BELOW_NORMAL);}catch{/* Priority is optional. */}
      const url=`http://127.0.0.1:${port}`;
      this.repliesInWorker=0;
      for(let i=0;i<120;i++){
        if(this.closed || this.paused || failed || proc.exitCode!==null)throw failed||new Error('Local model stopped');
        try{const r=await fetch(url+'/health',{signal:AbortSignal.timeout(500)});if(r.ok)return url;}catch{}
        await new Promise(r=>setTimeout(r,250));
      }
      throw new Error('Local model startup timed out');
    })().catch(e=>{if(generation===this.generation){this.process?.kill();this.starting=undefined;}throw e;});
    return this.starting;
  }
  async generate(jobs:TextJob[]) {
    const output:Record<string,string>={};
    // One conversation per prompt prevents this small local model from mixing
    // the identities and facts of neighbouring matches in a batch.
    for(const job of jobs){
      if(this.closed)break;
      if(this.paused)throw new Error('Chirp text generation paused');
      const url=await this.start();
      // Preserve factual clauses outside the model. It supplies the reaction,
      // so a small model cannot turn three saves into an invented three games.
      const sentences=job.context.draft.split(/(?<=[.!?])\s+(?!has\b|had\b|is\b|made\b|missed\b|scored\b|removed\b|joins\b|renews\b)/i);
      const fixed=sentences.filter(s=>/\d|\bjoins\b|renews with|speculation|wishlist|not a report|not.*confirmed/i.test(s)).join(' ');
      const voice=job.context.voice||(job.context.role==='Fan'?'casual fan typing on their phone; lowercase, short and opinionated':'conversational '+job.context.role);
      const reactionDraft=sentences.filter(s=>!fixed.includes(s)).join(' ')||'Give a brief opinion on these facts.';
      const focused='Write one fictional Rocket League Chirp '+(job.context.thread?'reply':'post')+' as author, in the supplied voice. Return JSON {"body":"text"}. '+
        'Use ONE informal sentence, 10-25 words. Answer a specific point in replyTo; do not speak as its author. Use intent for your opinion and verifiedMatch for evidence. Do not repeat the earlier conversation. '+
        (job.context.role==='Fan'?'You are a spectator typing a casual sports-fan reaction, not a manager or player. Be direct; slang or an emoji is fine. ':'Use the author\'s role, not a helpful assistant voice. ')+
        'Use a relevant saved fact for your reaction. Only quote exact scores or statistics from verifiedMatch. Never invent events or signings. Shot totals do not prove misses. Avoid generic encouragement, lectures, repeated wording, slurs and personal allegations.';
      const match=job.context.matchContext;
      const series=match?.seriesScore.split('–').map(Number);
      const winner=match && series && series[0]!==series[1]?(series[0]>series[1]?match.home:match.away):undefined;
      const loser=winner && match?(winner===match.home?match.away:match.home):undefined;
      const verifiedMatch=match?{competition:match.competition,format:match.format,status:match.status,winner,loser,
        managerTeam:job.context.managerClub,managerResult:job.context.managerClub===loser?'LOST':job.context.managerClub===winner?'WON':undefined,facts:match.facts,
        recentGames:match.games.slice(-3).map(g=>`Game ${g.game}: ${g.blue} ${g.score} ${g.orange}`),incidents:match.incidents,statistics:match.statistics}:undefined;
      const messages=[{role:'system',content:focused},{role:'user',content:JSON.stringify({author:job.context.author,role:job.context.role,voice,intent:job.context.intent||job.context.tone,opinion:fixed?reactionDraft:job.context.draft,earlierConversation:job.context.conversation,situation:fixed||undefined,verifiedMatch,replyTo:job.context.thread||undefined,avoid:job.context.avoid})}];
      let r:Response;
      // Let the local server apply Qwen's own chat template and JSON grammar.
      // Hand-written special tokens/grammar produced unstable replies and
      // repeated-request failures in the live worker check.
      try{r=await fetch(url+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages,max_tokens:96,temperature:.75,top_p:.9,stream:false,response_format:{type:'json_object'}}),signal:AbortSignal.timeout(90000)});}
      catch(error){
        // A stopped worker must be restarted by the next background retry,
        // instead of keeping a resolved startup promise for a dead socket.
        this.process?.kill();this.process=undefined;this.starting=undefined;
        throw error;
      }
      if(!r.ok)throw new Error(`Local text engine returned ${r.status}`);
      const result=await r.json();
      if(++this.repliesInWorker>=2){
        // Bound the worker lifetime. Long repeated-request checks exposed
        // connection failures; recycling only affects unpublished background
        // work and keeps a growing model session out of the desktop's memory.
        this.process?.kill();this.process=undefined;this.starting=undefined;this.repliesInWorker=0;
      }
      if(this.paused)throw new Error('Chirp text generation paused');
      const content=result.choices?.[0]?.message?.content;
      let parsed:any;try{parsed=JSON.parse(content);}catch{this.diagnostic?.(job.id,content,false);continue;}
      // The verified report already carries the statistics. Discard any
      // generated statistical sentence instead of duplicating or trusting it.
      let reaction=String(parsed.body||'').trim();
      if(fixed)reaction=reaction.split(/(?<=[.!?])\s+/).filter(s=>!/[0-9]/.test(s)).join(' ');
      if(!reaction){this.diagnostic?.(job.id,parsed.body,false);continue;}
      if(job.context.role==='Fan')reaction=reaction.toLowerCase();
      const candidate=(fixed?fixed+' ':'')+reaction;
      const accepted=validChirpText(candidate,job);this.diagnostic?.(job.id,parsed.body,accepted);
      if(accepted)output[job.id]=candidate.trim();
    }
    return output;
  }
}
