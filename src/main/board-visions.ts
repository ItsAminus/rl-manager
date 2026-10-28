import type {AppDatabase} from './database';
import {addDays} from '../game/career-rules';

export const VISION_SPORT=[{label:'Establish the squad',value:45},{label:'Challenge the leaders',value:60},{label:'Set the standard',value:72}];
export const VISION_FINANCE=[{label:'Strict wage discipline',value:100},{label:'Controlled investment',value:110},{label:'Back the sporting project',value:125}];
export const VISION_YOUTH=[{label:'No youth selection quota',value:0},{label:'Develop young players',value:25},{label:'Build around young players',value:50}];
function requirements(rep:number){return {winRate:rep>=85?60:45,wagePercent:110,youthPercent:0};}
function validate(t:any){if(!t||!VISION_SPORT.some(x=>x.value===t.winRate)||!VISION_FINANCE.some(x=>x.value===t.wagePercent)||!VISION_YOUTH.some(x=>x.value===t.youthPercent))throw Error('Choose valid board objectives.');return {winRate:t.winRate,wagePercent:t.wagePercent,youthPercent:t.youthPercent};}
export function boardVision(db:AppDatabase,c:any){
 if(c.mode==='Path To Glory')return null;
 let row=db.prepare('SELECT * FROM board_visions WHERE careerId=?').get(c.id);
 if(!row){
  const t=db.prepare('SELECT reputation FROM teams WHERE id=?').get(c.teamId),terms=requirements(t.reputation||0);
  db.prepare('INSERT INTO board_visions VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(c.id,c.currentDate,addDays(c.currentDate,365),addDays(c.currentDate,1095),JSON.stringify({reputation:t.reputation||0,longReputation:t.reputation||0,longGain:Math.min(6,Math.max(0,100-(t.reputation||0)))}),'negotiating',0,JSON.stringify(terms),JSON.stringify(terms),'[]',60);
  row=db.prepare('SELECT * FROM board_visions WHERE careerId=?').get(c.id);
 }
 const terms=JSON.parse(row.terms),baseline=JSON.parse(row.baseline);
 const fixtures=db.prepare("SELECT f.* FROM fixtures f JOIN career_competitions cc ON cc.competitionId=f.competitionId WHERE cc.careerId=? AND f.status='completed' AND f.scheduledDate>=? AND f.scheduledDate<? AND (f.homeTeamId=? OR f.awayTeamId=?)").all(c.id,row.startedDate,addDays(c.currentDate<row.deadline?c.currentDate:row.deadline,1),c.teamId,c.teamId);
 const won=fixtures.filter(f=>f.homeTeamId===c.teamId?f.homeScore>f.awayScore:f.awayScore>f.homeScore).length;
 const youth=fixtures.filter(f=>db.prepare(`SELECT 1 FROM game_player_stats s JOIN game_results g ON g.id=s.gameResultId JOIN players p ON p.id=s.playerId WHERE g.fixtureId=? AND p.age<=21 AND EXISTS(SELECT 1 FROM competition_rosters r WHERE r.competitionId=? AND r.playerId=p.id AND r.teamId=?) LIMIT 1`).get(f.id,f.competitionId,c.teamId)).length;
 const t=db.prepare('SELECT cashBalance,reputation FROM teams WHERE id=?').get(c.teamId),a=db.prepare('SELECT wageLimit FROM club_accounts WHERE careerId=? AND teamId=?').get(c.id,c.teamId);
 const wages=db.prepare('SELECT COALESCE(SUM(salary),0) n FROM contracts WHERE teamId=? AND isActive=1').get(c.teamId).n;
 const progress={series:fixtures.length,wins:won,winRate:fixtures.length?Math.round(100*won/fixtures.length):0,youthPercent:fixtures.length?Math.round(100*youth/fixtures.length):0,wages,wageLimit:a?.wageLimit||0,cash:t.cashBalance,reputation:t.reputation||0};
 return {...row,terms,counter:JSON.parse(row.counter),baseline,history:JSON.parse(row.history),progress,options:{sport:VISION_SPORT,finance:VISION_FINANCE,youth:VISION_YOUTH},policy:'One-year measurable objectives, reviewed once at the deadline. Sporting and youth targets need at least ten completed series. The three-year reputation goal persists across annual reviews. Reviews adjust board confidence and the wage budget by at most 5%; they do not dismiss you.'};
}
export function negotiateVision(db:AppDatabase,c:any,input:any,acceptCounter=false){
 if(c.mode==='Path To Glory')throw Error('Board visions are for Manager Career.');
 const v=boardVision(db,c)!;if(v.status!=='negotiating')throw Error('Your signed vision stays in force until its annual review.');
 const offer=validate(acceptCounter?v.counter:input),t=db.prepare('SELECT reputation FROM teams WHERE id=?').get(c.teamId),minimum=requirements(t.reputation||0);
 // Sporting ambition or youth investment buys room for higher wages; a stricter
 // wage ceiling can buy a lower sporting target. These are actual trade-offs.
 const credit=(offer.winRate-minimum.winRate)*2+offer.youthPercent*.35+(110-offer.wagePercent);
 const accepted=acceptCounter||credit>=0;
 const rounds=v.rounds+1;
 const counter=accepted?offer:{...offer,winRate:Math.max(offer.winRate,minimum.winRate),wagePercent:110};
 const message=accepted?'The board accepts this annual vision. The objectives and spending ceiling now apply.':`The board wants more in return for this proposal. It counters with a ${counter.winRate}% series-win target and a ${counter.wagePercent}% wage ceiling. ${rounds>=3?'This is the final counteroffer; accept it to conclude talks.':'You can counter or accept.'}`;
 if(v.rounds>=3&&!acceptCounter)throw Error('The board has made its final counteroffer. Accept it to conclude talks.');
 const history=[...v.history,{date:c.currentDate,offer,response:message}];
 db.prepare('UPDATE board_visions SET status=?,rounds=?,terms=?,counter=?,history=? WHERE careerId=?').run(accepted?'agreed':'negotiating',rounds,JSON.stringify(accepted?offer:v.terms),JSON.stringify(counter),JSON.stringify(history),c.id);
 return {success:true,message};
}
export function reviewBoardVision(db:AppDatabase,c:any){
 const row=db.prepare('SELECT * FROM board_visions WHERE careerId=?').get(c.id);
 // Reading the finance page is optional; never impose retrospective objectives.
 if(!row||row.status!=='agreed'||row.deadline>c.currentDate)return;
 const v=boardVision(db,c)!,p=v.progress;
 const sport=p.series>=10?p.winRate>=v.terms.winRate:null,youth=v.terms.youthPercent?(p.series>=10?p.youthPercent>=v.terms.youthPercent:null):null;
 const finance=p.cash>=0&&p.wages<=p.wageLimit*v.terms.wagePercent/100;
 const longDue=c.currentDate>=v.longDeadline,longMet=longDue?p.reputation>=v.baseline.longReputation+v.baseline.longGain:null;
 const results=[sport,youth,finance,longMet].filter(x=>x!==null),score=results.reduce((n,x)=>n+(x?1:-1),0),change=score>0?5:score<0?-5:0;
 const confidence=Math.min(100,Math.max(0,v.confidence+score*5));
 db.prepare('UPDATE club_accounts SET wageLimit=ROUND(wageLimit*?) WHERE careerId=? AND teamId=?').run(1+change/100,c.id,c.teamId);
 const message=`Annual vision review: ${sport===null?'insufficient series for sporting review':sport?'sporting target met':'sporting target missed'}; ${youth===null?'no assessable youth quota':youth?'youth target met':'youth target missed'}; ${finance?'finances on target':'financial target missed'}.${longDue?` Three-year reputation goal ${longMet?'met':'missed'}.`:''} Board confidence ${confidence}/100. Wage budget ${change>0?'+':''}${change}%.`;
 const history=[...v.history,{date:c.currentDate,response:message}];
 const baseline={reputation:p.reputation,longReputation:longDue?p.reputation:v.baseline.longReputation,longGain:longDue?Math.min(6,100-p.reputation):v.baseline.longGain};
 const next=requirements(p.reputation);
 db.prepare('UPDATE board_visions SET startedDate=?,deadline=?,longDeadline=?,baseline=?,status=?,rounds=0,terms=?,counter=?,history=?,confidence=? WHERE careerId=?').run(c.currentDate,addDays(c.currentDate,365),longDue?addDays(c.currentDate,1095):v.longDeadline,JSON.stringify(baseline),'negotiating',JSON.stringify(next),JSON.stringify(next),JSON.stringify(history),confidence,c.id);
 db.prepare('INSERT INTO inbox_items(id,careerId,date,type,title,body,isRead,actions) VALUES(?,?,?,?,?,?,0,?)').run(`vision:${c.id}:${v.deadline}`,c.id,c.currentDate,'general','Annual board vision review',message,JSON.stringify([{label:'Negotiate next vision',action:'navigate',data:{href:'/finances'}}]));
}
