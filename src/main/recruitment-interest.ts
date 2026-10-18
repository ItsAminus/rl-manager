import type {AppDatabase} from './database';
import {addDays,wageDemands} from '../game/career-rules';
export function recruitmentInterest(db:AppDatabase,careerId:string,buyerId:string,p:any,date:string,role='Core Starter'){
  const buyer=db.prepare('SELECT * FROM teams WHERE id=?').get(buyerId),seller=p.teamId&&db.prepare('SELECT * FROM teams WHERE id=?').get(p.teamId);
  const current=db.prepare('SELECT * FROM contracts WHERE playerId=? AND isActive=1').get(p.id);
  const squad=(id:string)=>{const rows=db.prepare('SELECT overall FROM players WHERE teamId=? AND id<>? ORDER BY overall DESC LIMIT 3').all(id,p.id);return rows.length?rows.reduce((n,r)=>n+r.overall,0)/rows.length:55;};
  const quality=squad(buyerId),reputation=buyer?.reputation??50;
  const request=db.prepare('SELECT transferRequested FROM manager_relationships WHERE careerId=? AND playerId=?').get(careerId,p.id)?.transferRequested;
  const listed=db.prepare('SELECT playerId FROM transfer_listings WHERE careerId=? AND playerId=?').get(careerId,p.id);
  const recent=db.prepare("SELECT f.homeTeamId,f.homeScore,f.awayScore FROM fixtures f JOIN competitions c ON c.id=f.competitionId WHERE f.status='completed' AND c.type<>'SCRIM' AND (f.homeTeamId=? OR f.awayTeamId=?) AND (SELECT AVG(overall) FROM players WHERE teamId=CASE WHEN f.homeTeamId=? THEN f.awayTeamId ELSE f.homeTeamId END)>=? ORDER BY f.scheduledDate DESC LIMIT 8").all(buyerId,buyerId,buyerId,p.overall-12);
  const wins=recent.filter(f=>f.homeTeamId===buyerId?f.homeScore>f.awayScore:f.awayScore>f.homeScore).length;
  const established=recent.length>=5&&wins/recent.length>=.6;
  const unhappy=!!request||!!listed||(p.morale??50)<45;
  const expiring=current&&current.endDate<=addDays(date,90);
  const reasons:string[]=[];
  const affiliation=db.prepare('SELECT status FROM player_affiliations WHERE playerId=?').get(p.id)?.status;
  if(!p.teamId&&['unverified','inactive'].includes(affiliation))reasons.push('This player is not a confirmed available free agent.');
  if(p.teamId!==buyerId){
    if(p.overall>=94&&!((reputation>=88&&quality>=p.overall-10)||(reputation>=70&&quality>=p.overall-4&&established)))reasons.push('The squad strength and competitive track record do not match this player’s championship ambitions.');
    else if(p.overall>=85&&((p.reputation??p.overall)-reputation>22||p.overall-quality>15))reasons.push('This would be too large a step down in club stature or teammate quality.');
    if(seller&&p.overall>=94&&!unhappy&&!expiring&&reputation<(seller.reputation??50)+4&&quality<squad(seller.id)+3)reasons.push('The player is committed to their current club and does not want a sideways or weaker move.');
    if(role==='Substitute'&&p.overall>=85)reasons.push('The player expects a starting role and will not accept a substitute contract.');
    const better=db.prepare('SELECT COUNT(*) AS n FROM players WHERE teamId=? AND id<>? AND overall>?').get(buyerId,p.id,p.overall).n;
    if(role!=='Substitute'&&better>=3)reasons.push('There is no credible starting place alongside the club’s stronger players.');
  }
  const base=wageDemands(p),relocation=buyer?.region!==p.region?1.15:1,downward=quality<p.overall-5?1.15:1;
  const salary=Math.round(Math.max(base.salary,current?.salary?current.salary*1.05:0)*relocation*downward);
  return {willing:!reasons.length,reasons,demands:{salary,bonus:Math.round(salary*2.5)},minimumDuration:p.overall>=94?24:12,
    explanation:reasons[0]||`${p.gamertag} is willing to discuss a ${role.toLowerCase()} role. Salary, contract security and club finances still need agreement.`};
}
