import type {AppDatabase} from './database';
import {RecruitmentNetwork} from './recruitment-network';

const groups={
  'Attacking & mechanics':{mechanical:'Mechanics',groundControl:'Dribbling / ground control',aerial:'Aerial ability',shooting:'Shooting',shotPower:'Shot power',shotAccuracy:'Shot accuracy'},
  'Team play & defence':{passing:'Passing',defense:'Defending',goalkeeping:'Goalkeeping',positioning:'Positioning',rotations:'Rotations',fiftyFifty:'50/50 challenges'},
  'Movement & decisions':{boostManagement:'Boost management',speed:'Speed',recovery:'Recovery',demolitions:'Demolitions',gameSense:'Game sense',consistency:'Consistency',clutch:'Clutch performance'}
};
const personalities={aggression:'Aggression',riskTolerance:'Risk tolerance',teamOrientation:'Team orientation',adaptability:'Adaptability',pressureResistance:'Pressure resistance',developmentRate:'Development rate',professionalism:'Professionalism',confidence:'Confidence',tiltTendency:'Tilt tendency'};
const estimate=(v:number,width:number)=>`${Math.max(1,Math.floor(v/width)*width)}–${Math.min(100,Math.floor(v/width)*width+width-1)}`;
export function scoutDossier(db:AppDatabase,c:any,playerId:string){
  const p=db.prepare('SELECT p.*,t.name teamName FROM players p LEFT JOIN teams t ON t.id=p.teamId WHERE p.id=?').get(playerId);
  if(!p)throw Error('Player not found.');
  const network=new RecruitmentNetwork(db),depth=network.depth(c.id,playerId);
  const view=network.visible(c,p),observation=db.prepare('SELECT * FROM scout_observations WHERE careerId=? AND playerId=?').get(c.id,playerId);
  if(!view)throw Error('This player has not been discovered by your scouts.');
  const assignments=db.prepare('SELECT id,startedDate,dueDate,depth,status FROM scout_assignments WHERE careerId=? AND playerId=? ORDER BY dueDate DESC,rowid DESC').all(c.id,playerId);
  const intervals=assignments.filter(a=>a.status==='completed').map(a=>[Date.parse(a.startedDate),Date.parse(a.dueDate)]).filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b)&&b>=a).sort((a,b)=>a[0]-b[0]);
  let days=0,end=0;for(const [start,finish] of intervals){days+=Math.max(0,finish-Math.max(start,end))/86400000;end=Math.max(end,finish);}
  const attributes=depth&&observation?JSON.parse(observation.attributes):{},traits=depth&&observation?JSON.parse(observation.traits):{};
  const basic=new Set(['shooting','passing','aerial','groundControl','goalkeeping']);
  const sections=Object.entries(groups).map(([name,fields])=>({name,skills:Object.entries(fields).map(([key,label])=>({key,label,assessment:!depth||!Number.isFinite(attributes[key])||depth===1&&!basic.has(key)?'Not assessed':depth>=3?String(Math.round(attributes[key])):estimate(attributes[key],depth===2?10:20)}))}));
  const personality=Object.entries(personalities).map(([key,label])=>({key,label,assessment:depth<2||!Number.isFinite(traits[key])?'Not assessed':depth>=3?String(Math.round(traits[key])):traits[key]>=70?'High':traits[key]<=35?'Low':'Moderate'}));
  const ranked=Object.entries(groups).flatMap(([,fields])=>Object.entries(fields)).filter(([key])=>Number.isFinite(attributes[key])&&(depth>=2||basic.has(key))).sort(([a],[b])=>attributes[b]-attributes[a]);
  const strengths=depth?ranked.slice(0,depth>=2?3:2).map(([,label])=>label):[];
  const concerns=depth>=2&&ranked.length&&attributes[ranked[0][0]]-attributes[ranked[ranked.length-1][0]]>=8?ranked.slice(-2).reverse().map(([,label])=>`${label} is a relative development area.`):[];
  if(depth>=2&&traits.tiltTendency>=70)concerns.push('Can become frustrated when a game turns against them.');
  if(depth>=2&&traits.pressureResistance<=35)concerns.push('May need support in high-pressure matches.');
  const stats=db.prepare(`SELECT COUNT(*) games,COALESCE(SUM(s.goals),0) goals,COALESCE(SUM(s.assists),0) assists,COALESCE(SUM(s.saves),0) saves,COALESCE(SUM(s.shots),0) shots,COALESCE(SUM(s.demos),0) demos
    FROM game_player_stats s JOIN game_results g ON g.id=s.gameResultId JOIN fixtures f ON f.id=g.fixtureId
    JOIN career_competitions cc ON cc.competitionId=f.competitionId WHERE cc.careerId=? AND s.playerId=? AND f.status='completed' AND f.scheduledDate<=?`).get(c.id,p.id,c.currentDate);
  const contract=depth>=2?db.prepare('SELECT salary,endDate,buyout FROM contracts WHERE playerId=? AND isActive=1 ORDER BY startDate DESC LIMIT 1').get(p.id):null;
  return {player:{id:p.id,gamertag:p.gamertag,realName:p.realName,age:p.age,nationality:p.nationality,teamId:p.teamId,teamName:p.teamName,region:p.region},
    depth,knowledge:depth?view.scoutKnowledge:'Unscouted',daysObserved:Math.round(days),lastObserved:observation?.observedDate||null,
    overall:depth?view.estimatedOverall:'Unknown',potential:depth?view.estimatedPotential:'Unknown',role:depth?observation?.tendency:'Not assessed',
    form:depth>=2?(observation.form>=70?'Strong':observation.form>=45?'Steady':'Struggling'):'Not assessed',
    confidence:depth>=3?'Detailed observation':depth===2?'Good understanding; estimates remain':depth===1?'Early impressions; broad estimates':'No completed observation',
    sections,personality,strengths,concerns,stats,contract,assignments,
    assessment:depth>=3?'The scout has a detailed picture of this player’s skill profile and temperament. Use the relative strengths, development areas and role fit together; a rating alone does not guarantee success.':depth===2?'Follow-up observation has narrowed the skill estimates and revealed form and personality tendencies. Another observation can establish the detailed profile.':depth===1?'An initial look identifies broad ability, likely role and standout skills. Passing, mechanics and decision-making need sustained observation before making a confident recruitment decision.':'Dispatch a scout or discover this player through a regional assignment to build a report.',
    freshness:observation&&depth<observation.depth?'This report is over 120 days old. Its certainty has been reduced; scout again to refresh it.':'Details describe the player when observed. Training, form and transfers can change afterward.'};
}
