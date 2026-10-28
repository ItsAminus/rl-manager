import {afterEach,expect,it,vi} from 'vitest';
import path from 'node:path';
import {DeskAudio} from '../src/main/desk-audio';
import {deskLines,eligibleDeskLine,preparedDeskTurns} from '../src/main/desk-bank';
import storylines from '../data/desk-storylines.json';
const publicFolder=path.resolve('public');
const line=deskLines.find(l=>l.id==='opening_01')!;
const turn={speaker:'Desk analyst',voice:'Afro American RLCS Analyst',text:line.text,clipId:line.id,file:'audio/desk-analyst/'+line.file,category:line.category};
afterEach(()=>vi.restoreAllMocks());
it('provides three distinct scripts for every supplied scenario and gates untracked stories',()=>{
 expect(storylines).toHaveLength(300);
 expect(new Set(storylines.map(l=>l.text)).size).toBe(300);
 for(let number=1;number<=100;number++){
  const variants=storylines.filter(l=>l.scenarioNumber===number);
  expect(variants).toHaveLength(3);
  expect(variants.every(l=>l.when.length>0)).toBe(true);
 }
 const lastShot=deskLines.find(l=>l.id==='story_051_veteran_last_shot_01')!;
 expect(eligibleDeskLine(lastShot,{ownAvg:99,ownWins:5})).toBe(false);
 expect(eligibleDeskLine(lastShot,{storyEvidence051:1})).toBe(true);
 expect(storylines.filter(l=>l.phase==='between_games').every(l=>l.slot==='series')).toBe(true);
});
it('loads prepared speech immediately and never calls a network provider',()=>{
 const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('Network forbidden'));
 const desk=new DeskAudio();expect(desk.prepare('save:fixture',[turn],publicFolder)).toMatchObject({state:'ready',clips:[0]});
 expect(desk.audio('save:fixture',0)).toMatch(/^data:audio\/mpeg;base64,/);
 expect(desk.audio('other:fixture',0)).toBeNull();desk.cancel('save:fixture');expect(network).not.toHaveBeenCalled();
});
it('handles missing recordings and refuses paths outside approved audio folders',()=>{
 const desk=new DeskAudio();
 expect(desk.prepare('save',[{...turn,file:'audio/desk-analyst/missing_recording.mp3'},{...turn,file:'../package.json'}],publicFolder)).toMatchObject({state:'unavailable',clips:[]});
 expect(desk.audio('save',1)).toBeNull();
});
it('has over one hundred distinct situations and uses only satisfied evidence rules',()=>{
 expect(new Set(deskLines.filter(l=>l.slot!=='connector').map(l=>l.category)).size).toBeGreaterThanOrEqual(100);
 const struggling=deskLines.find(l=>l.category==='favourite_in_bad_form')!;
 expect(eligibleDeskLine(struggling,{gap:8,ownWins:1,ownRecentCount:5})).toBe(true);
 expect(eligibleDeskLine(struggling,{gap:8,ownWins:4,ownRecentCount:5})).toBe(false);
 expect(eligibleDeskLine(struggling,{gap:8,ownWins:0,ownRecentCount:0})).toBe(false);
 expect(eligibleDeskLine(struggling,{})).toBe(false);
});
it('selects varied stable offline programmes, includes names and does not invent a rematch',()=>{
 const context={gap:8,absGap:8,ownAvg:95,oppAvg:87,ownRecentCount:5,oppRecentCount:5,ownWins:1,oppWins:4,headCount:0,format:7,isFinal:1,ownFatigue:5,oppFatigue:5};
 const first=preparedDeskTurns('extended','save:series:date',context,'team_1','team_2');
 expect(first).toEqual(preparedDeskTurns('extended','save:series:date',context,'team_1','team_2'));
 expect(first.filter(t=>t.category==='team_name').map(t=>t.text)).toEqual(['Team Vitality','Karmine Corp']);
 expect(first.some(t=>t.category==='rematch_after_defeat')).toBe(false);
 expect(first.every(t=>t.voice==='Afro American RLCS Analyst')).toBe(true);
 const programmes=new Set(Array.from({length:30},(_,i)=>preparedDeskTurns('short','series:'+i,context,'team_1','team_2').map(t=>t.clipId).join('|')));
 expect(programmes.size).toBeGreaterThan(10);
 expect(preparedDeskTurns('graphics','save',context,'team_1','team_2')).toEqual([]);
 expect(preparedDeskTurns('short','save',context,'team_1','team_2','My renamed club','Karmine Corp').some(t=>t.category==='team_name')).toBe(false);
});
it('plays finals hype only in the championship final and has every new recording bundled',()=>{
 const context={gap:0,absGap:0,headCount:0,ownAvg:85,oppAvg:85};
 for(const isFinal of [0,1]){
  const turns=preparedDeskTurns('extended','final-check',{...context,isFinal},'team_1','team_2');
  expect(turns.filter(t=>t.category.startsWith('final_hype')).length).toBe(isFinal?3:0);
 }
 const finals=deskLines.filter(l=>l.category.startsWith('final_hype'));
 expect(finals).toHaveLength(12);
 const desk=new DeskAudio();
 expect(desk.prepare('finals',finals.map(l=>({...turn,text:l.text,file:'audio/desk-analyst/'+l.file})),publicFolder).state).toBe('ready');
});
