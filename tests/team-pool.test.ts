import {beforeAll,beforeEach,it,expect} from 'vitest';
import initSqlJs from 'sql.js';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {sqlAdapter} from './sql-fixture';
import {applyTeamStatusAudit,selectableTeams} from '../src/main/team-pool';
import {selectTeams} from '../src/game/team-selection';
import type {Team} from '../src/types';
import snapshot from '../data/real-rosters.json';
import audit from '../data/team-status-audit.json';
let SQL:any,db:any;
beforeAll(async()=>{SQL=await initSqlJs();});
const dead='sg_team_3129938',historical='real_team_84933f16-bc7c-4890-bb89-f40e05be939b';
beforeEach(()=>{
  db=sqlAdapter(new SQL.Database());runMigration(db);
  for(const [id,name,status] of [[dead,'No Balls Just Chase','active'],[historical,'Manchester City','active'],['team_1','Team Vitality','active'],['incomplete','Missing starter','incomplete']]){
    db.prepare("INSERT INTO teams(id,name,shortName,region,budget,cashBalance) VALUES(?,?,?,'Europe',100000,200000)").run(id,name,name);
    db.prepare("INSERT INTO team_roster_sources(teamId,status,verifiedAt,source,note,starterIds) VALUES(?,?,'2026-07-03','https://www.start.gg/','Original lineup','[]')").run(id,status);
    for(let i=0;i<3;i++)db.prepare('INSERT INTO players(id,gamertag,teamId,overall) VALUES(?,?,?,80)').run(id+i,name+i,id);
  }
});
it('removes known disbanded and incomplete teams from the selectable pool while retaining labelled unverified clubs',()=>{
  const teams=selectableTeams(db),ids=teams.map(t=>t.id);
  expect(ids).not.toContain(dead);expect(ids).not.toContain('incomplete');expect(ids).toContain('team_1');expect(ids).toContain(historical);
  expect(teams.find(t=>t.id===historical).rosterStatus).toBe('historical');expect(teams.find(t=>t.id==='team_1').rosterStatus).toBe('active');
  expect(db.prepare('SELECT status,note FROM team_roster_sources WHERE teamId=?').get(dead)).toMatchObject({status:'inactive',note:expect.stringContaining('disbanded')});
});
it('changes status only and preserves existing careers, cash, contracts, player ownership and historical results',()=>{
  db.exec("INSERT INTO careers(id,managerName,teamId,currentDate) VALUES('c','Manager','team_1','2026-10-23');INSERT INTO competitions(id,name) VALUES('event','Past event');INSERT INTO fixtures(id,competitionId,homeTeamId,awayTeamId,status,homeScore,awayScore) VALUES('past','event','team_1','sg_team_3129938','completed',3,0);INSERT INTO contracts(id,playerId,teamId,salary,isActive) VALUES('co','sg_team_31299380','sg_team_3129938',3000,1)");
  expect(applyTeamStatusAudit(db)).toBe(true);expect(applyTeamStatusAudit(db)).toBe(false);
  expect(db.prepare('SELECT teamId FROM players WHERE id=?').get(dead+'0').teamId).toBe(dead);
  expect(db.prepare("SELECT cashBalance FROM teams WHERE id='team_1'").get().cashBalance).toBe(200000);
  expect(db.prepare("SELECT isActive FROM contracts WHERE id='co'").get().isActive).toBe(1);expect(db.prepare("SELECT awayTeamId,homeScore FROM fixtures WHERE id='past'").get()).toEqual({awayTeamId:dead,homeScore:3});
  expect(db.prepare("SELECT managerName FROM careers WHERE id='c'").get().managerName).toBe('Manager');
});
it('keeps source evidence for every audit decision and does not blanket-retire revived names or active teams',()=>{
  const ids=new Set(snapshot.teams.map(t=>t.id));
  for(const t of audit.teams){expect(ids.has(t.id)).toBe(true);expect(t.source).toMatch(/^https:\/\/liquipedia.net\/rocketleague\//);expect(t.note.length).toBeGreaterThan(20);}
  expect(audit.teams.find(t=>t.name==='Triple pop')?.status).toBe('active');expect(audit.teams.find(t=>t.name==='Team BSK')?.status).toBe('incomplete');
  for(const name of ['Kaydop Corp','Magnolia','VOLARE','No Balls Just Chase'])expect(audit.teams.find(t=>t.name===name)?.status).toBe('inactive');
  expect(audit.teams.some(t=>t.name==='Capybara Inc')).toBe(false); // old disband date predates the newer registered squad
});
const team=(id:string,name:string,values:any={})=>({id,name,shortName:id,region:'Europe',roster:['a','b','c'],rosterStatus:'active',reputation:50,fanbase:100,budget:1000,facilityLevel:1,...values} as Team);
it('searches names and abbreviations within the selected region, including accents and whitespace',()=>{
  const teams=[team('VIT','Team Vitality'),team('M8','Gentle Mates'),team('NRG','NRG',{region:'North America'}),team('TEST','Café Club')];
  expect(selectTeams(teams,'Europe',' vit ').map(t=>t.id)).toEqual(['VIT']);expect(selectTeams(teams,'Europe','cafe club').map(t=>t.id)).toEqual(['TEST']);
  expect(selectTeams(teams,'Europe','NRG')).toHaveLength(0);expect(selectTeams(teams,'Europe','missing')).toHaveLength(0);
});
it('sorts by fanbase, budget, reputation, facilities and name in both directions without mutating the input',()=>{
  const teams=[team('a','Zulu',{reputation:80,fanbase:10,budget:0,facilityLevel:2}),team('b','Alpha',{reputation:50,fanbase:500,budget:2000,facilityLevel:1})];
  expect(selectTeams(teams,'Europe','','popularity')[0].id).toBe('b');expect(selectTeams(teams,'Europe','','budget')[0].id).toBe('b');expect(selectTeams(teams,'Europe','','budget',true)[0].id).toBe('a');
  expect(selectTeams(teams,'Europe','','reputation')[0].id).toBe('a');expect(selectTeams(teams,'Europe','','facilities')[0].id).toBe('a');expect(selectTeams(teams,'Europe','','name',true)[0].name).toBe('Alpha');expect(selectTeams(teams,'Europe','','name',false)[0].name).toBe('Zulu');expect(teams[0].name).toBe('Zulu');
});
it('does not allow a search or sort to reveal an ineligible team and preserves stable ties',()=>{
  const teams=[team('dead','Dead',{rosterStatus:'inactive'}),team('short','Short',{roster:['a','b']}),team('b','Bravo'),team('a','Alpha'),team('archive','Archived',{rosterStatus:'historical'})];
  expect(selectTeams(teams,'Europe','','budget').map(t=>t.id)).toEqual(['a','archive','b']);expect(selectTeams(teams,'Europe','Dead')).toHaveLength(0);
});
