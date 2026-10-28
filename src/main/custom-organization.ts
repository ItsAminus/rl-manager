import type {AppDatabase} from './database';
import {v4 as uuid} from 'uuid';
import {Region} from '../types';
import {validateCustomOrganization} from '../game/custom-organization';
import {validClubPng,ClubStudio} from './club-studio';
import {defaultBranding} from '../game/club-design';

export function createCustomOrganization(db:AppDatabase,careerId:string,region:string,input:any,date:string){
 const design=validateCustomOrganization(input),logo=validClubPng(design.logo);
 if(!Object.values(Region).includes(region as Region))throw Error('Choose a supported competitive region.');
 const teamId='custom_team_'+uuid();
 db.prepare(`INSERT INTO teams(id,name,shortName,region,reputation,budget,cashBalance,coachRating,facilityLevel,fanbase,sponsorIncome,teamChemistry,teamForm) VALUES(?,?,?,?,60,350000,350000,70,1,5000,20000,70,50)`).run(teamId,design.name,design.shortName,region);
 const ids:string[]=[];
 for(const [i,p] of design.players.entries()){
  const id='custom_player_'+uuid();ids.push(id);
  db.prepare(`INSERT INTO players(id,gamertag,realName,region,age,teamId,preferredTendency,overall,potential,form,morale,fatigue,consistency,chemistry,reputation,careerEarnings,marketValue,scoutKnowledge) VALUES(?,?,?, ?,?,?, ?,?,?,50,70,0,65,70,50,0,?,'FULL')`).run(id,p.gamertag,'Custom career player',region,p.age,teamId,['STRIKER','SUPPORT','DEFENSIVE_ANCHOR'][i],p.overall,Math.min(99,p.overall+7),Math.round(50000*Math.pow(p.overall/70,3)));
  const fields=['mechanical','aerial','groundControl','shooting','shotPower','shotAccuracy','passing','defense','goalkeeping','positioning','rotations','boostManagement','speed','recovery','fiftyFifty','demolitions','gameSense','consistency','clutch'];
  db.prepare(`INSERT INTO player_attributes(playerId,${fields.join(',')}) VALUES(${Array(fields.length+1).fill('?').join(',')})`).run(id,...fields.map(()=>p.overall));
  db.prepare('INSERT INTO player_traits VALUES(?,50,50,65,60,60,60,65,65,40)').run(id);
  db.prepare('INSERT INTO player_affiliations(playerId,status,verifiedAt,source,note) VALUES(?,?,?,?,?)').run(id,'career',date,'','Fictional player created by the manager for this save.');
  db.prepare(`INSERT INTO contracts(id,playerId,teamId,salary,duration,startDate,endDate,signingBonus,buyout,isActive) VALUES(?,?,?,?,24,?,?,0,?,1)`).run(uuid(),id,teamId,Math.max(500,p.overall*100),date,`${Number(date.slice(0,4))+2}${date.slice(4)}`,p.overall*2000);
 }
 db.prepare('INSERT INTO team_roster_sources(teamId,status,verifiedAt,source,note,starterIds) VALUES(?,?,?,?,?,?)').run(teamId,'career',date,'','Custom organization and fictional starting squad created for this career.',JSON.stringify(ids));
 return {teamId,design:{...defaultBranding(design),logoMode:logo?'upload':'official',logo},playerIds:ids,careerId};
}
export function saveCustomOrganizationBrand(db:AppDatabase,created:ReturnType<typeof createCustomOrganization>){
 return new ClubStudio(db).saveBranding(created.careerId,created.design as any);
}
