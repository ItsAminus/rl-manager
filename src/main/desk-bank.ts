import bank from '../../data/desk-voice-bank.json';
import scenarios from '../../data/desk-scenarios.json';
import storylines from '../../data/desk-storylines.json';
import names from '../../data/desk-team-names.json';
import finals from '../../data/desk-finals.json';

export type DeskTurn={speaker:string;voice:string;text:string;clipId:string;file:string;category:string};
export type DeskContext=Record<string,number>;
type Rule=[string,string,number];
type Line={id:string;category:string;slot:string;when:Rule[];text:string;file:string};
const defaults:Record<string,{slot:string;when:Rule[]}>= {
  opening:{slot:'opening',when:[]},balanced:{slot:'matchup',when:[['absGap','<',2]]},favourite:{slot:'matchup',when:[['gap','>=',2]]},underdog:{slot:'matchup',when:[['gap','<=',-2]]},
  form_good:{slot:'form',when:[['ownWins','>=',3]]},form_poor:{slot:'form',when:[['ownWins','<=',1],['ownRecentCount','>=',3]]},rematch:{slot:'story',when:[['headCount','>=',1]]},
  aerial:{slot:'tactics',when:[['oppAerial','>=',85]]},passing:{slot:'tactics',when:[['oppPassing','>=',85]]},defence:{slot:'tactics',when:[]},
  semifinal:{slot:'stage',when:[['isSemi','==',1]]},final:{slot:'stage',when:[['isFinal','==',1]]},pick_favourite:{slot:'prediction',when:[['absGap','>=',2]]},pick_close:{slot:'prediction',when:[['absGap','<',2]]},closing:{slot:'closing',when:[]}
};
export const deskLines:Line[]=[...bank.lines.map(line=>({...line,...(defaults[line.category]||{slot:'connector',when:[]})})),...scenarios as unknown as Line[],...storylines as unknown as Line[],...finals as unknown as Line[]];
export function eligibleDeskLine(line:{when:Rule[]},context:DeskContext){
  return line.when.every(([key,op,target])=>{const value=context[key];if(!Number.isFinite(value))return false;return op==='>='?value>=target:op==='<='?value<=target:op==='<'?value<target:op==='>'?value>target:op==='=='?value===target:false;});
}
const hash=(value:string)=>{let h=2166136261;for(const char of value)h=Math.imul(h^char.charCodeAt(0),16777619);return h>>>0;};
export function preparedDeskTurns(tier:string,seed:string,context:DeskContext,ownId:string,opponentId:string,ownName?:string,opponentName?:string):DeskTurn[]{
  if(tier==='graphics')return [];
  const used=new Set<string>(),turns:DeskTurn[]=[];
  const append=(line:Line)=>{used.add(line.category);turns.push({speaker:'Desk analyst',voice:bank.voiceName,text:line.text,clipId:line.id,file:'audio/desk-analyst/'+line.file,category:line.category});};
  const pick=(...slots:string[])=>{
    const slot=slots.join(':');
    const choices=deskLines.filter(line=>slots.includes(line.slot)&&!used.has(line.category)&&eligibleDeskLine(line,context)&&!(context.isNational&&/\bclubs?\b/i.test(line.text)));
    if(!choices.length)return;
    // Every eligible situation can appear; richer conditions receive a modest
    // preference without making the same story win every fixture.
    choices.sort((a,b)=>(hash(seed+':'+slot+':'+b.id)/0xffffffff+b.when.length*.12)-(hash(seed+':'+slot+':'+a.id)/0xffffffff+a.when.length*.12));
    append(choices[0]);
  };
  const own=(names as Record<string,{name:string;file:string}>)[ownId],other=(names as Record<string,{name:string;file:string}>)[opponentId];
  const prefix=deskLines.find(l=>l.id==='matchup_intro_01'),connector=deskLines.find(l=>l.id==='matchup_against_01');
  const sameName=(recorded:string,current?:string)=>!current||recorded.trim().toLowerCase()===current.trim().toLowerCase();
  if(own&&other&&prefix&&connector&&sameName(own.name,ownName)&&sameName(other.name,opponentName)){
    append(prefix);
    turns.push({speaker:'Desk analyst',voice:bank.voiceName,text:own.name,clipId:'team:'+ownId,file:'audio/desk-team-names/'+own.file,category:'team_name'});
    append(connector);
    turns.push({speaker:'Desk analyst',voice:bank.voiceName,text:other.name,clipId:'team:'+opponentId,file:'audio/desk-team-names/'+other.file,category:'team_name'});
  }
  pick(context.isFinal===1?'final_opening':'opening');
  if(tier==='extended')pick('stage');
  pick('matchup');
  if(tier==='extended'){pick('form');pick('story');pick('mentality');}
  else pick('form','story');
  pick('tactics');
  if(tier==='extended')pick('tactics');
  if(context.isFinal===1)pick('final_pressure');
  pick('prediction');pick(context.isFinal===1?'final_closing':'closing');
  return turns;
}
