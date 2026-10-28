import {beforeAll,beforeEach,expect,it,vi,afterEach} from 'vitest';
import initSqlJs from 'sql.js';
import {sqlAdapter} from './sql-fixture';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {ensureTalentPool,knownProspect,potentialAssessment,scoutBrief} from '../src/main/talent-pool';
import {RecruitmentNetwork} from '../src/main/recruitment-network';
import {hireDepartment,staffDepartment,clubStructure} from '../src/main/club-structure';
import {negotiateTerms,negotiationState,playerRepresentative,changeAgencyTrust} from '../src/main/contract-negotiations';
import {ClubEconomy} from '../src/main/club-economy';
import {CareerManagement} from '../src/main/career-management';
import {squadDynamics} from '../src/main/squad-dynamics';
let SQL:any,db:any;
const c={id:'save',teamId:'own',currentDate:'2026-01-01',mode:'Manager Career'};
beforeAll(async()=>{SQL=await initSqlJs();});
beforeEach(()=>{db=sqlAdapter(new SQL.Database());runMigration(db);db.exec(`INSERT INTO teams(id,name,region,cashBalance,reputation,teamChemistry,coachRating) VALUES('own','Own','Europe',200000,80,50,60),('other','Other','Europe',200000,70,50,60);
 INSERT INTO careers(id,managerName,teamId,currentDate) VALUES('save','Manager','own','2026-01-01');
 INSERT INTO players(id,gamertag,teamId,age,region,overall,potential,chemistry,fatigue) VALUES('p','First','own',20,'Europe',70,90,50,0),('q','Second','other',16,'Europe',60,95,50,0);`);});
afterEach(()=>vi.restoreAllMocks());
it('saves a fictional intake once and hides it until a completed discovery',()=>{
 vi.spyOn(Math,'random').mockReturnValue(.01);ensureTalentPool(db,c);
 const first=db.prepare('SELECT * FROM hidden_prospects').all();expect(first).toHaveLength(5);
 const prospect=db.prepare('SELECT * FROM players WHERE id=?').get(first[0].playerId);
 expect(prospect).toMatchObject({age:15,teamId:null});expect(knownProspect(db,c,prospect.id)).toBe(false);
 expect(new RecruitmentNetwork(db).visible(c,prospect)).toBeNull();
 ensureTalentPool(db,c);expect(db.prepare('SELECT COUNT(*) n FROM hidden_prospects').get().n).toBe(5);
 db.prepare("INSERT INTO scout_assignments VALUES('found','save',?,'2026-01-01','2026-01-31',1,'completed')").run(prospect.id);
 new RecruitmentNetwork(db).observe(c,prospect.id,1);
 expect(knownProspect(db,c,prospect.id)).toBe(true);expect(knownProspect(db,{...c,id:'foreign'},prospect.id)).toBe(false);
 expect(new RecruitmentNetwork(db).visible(c,prospect).overall).toBeNull();
 const restored=sqlAdapter(new SQL.Database(db.exportBinary()));ensureTalentPool(restored,c);expect(restored.prepare('SELECT potential FROM players WHERE id=?').get(prospect.id).potential).toBe(prospect.potential);
});
it('does not promise an elite intake and keeps youth potential uncertain after deep scouting',()=>{
 vi.spyOn(Math,'random').mockReturnValue(.5);ensureTalentPool(db,c);
 expect(db.prepare('SELECT MAX(p.potential) n FROM players p JOIN hidden_prospects h ON h.playerId=p.id').get().n).toBeLessThan(90);
 const estimated=potentialAssessment('save',{id:'q',age:16,overall:60,potential:95},3);const [low,high]=estimated.split('–').map(Number);
 expect(high-low).toBeGreaterThan(5);expect(estimated).toBe(potentialAssessment('save',{id:'q',age:16,overall:60,potential:95},3));
});
it('validates briefs and only returns matching ages and skills',()=>{
 expect(()=>scoutBrief({minAge:10})).toThrow();expect(()=>scoutBrief({skills:{potential:99}})).toThrow();
 db.exec("INSERT INTO player_attributes(playerId,shooting) VALUES('q',80);INSERT INTO players(id,gamertag,teamId,region,age,overall,potential) VALUES('old','Older','other','Europe',30,80,90)");
 const n=new RecruitmentNetwork(db);n.dispatchRegion(c,'Europe',1,{minAge:15,maxAge:17,skills:{shooting:75}});n.tick({...c,currentDate:'2026-01-31'});
 expect(n.depth(c.id,'q')).toBe(1);expect(n.depth(c.id,'old')).toBe(0);
});
it('charges a staff search once, delays benefits, preserves cash projections and salary costs',()=>{
 hireDepartment(db,c,'Recruitment');expect(db.prepare("SELECT cashBalance FROM teams WHERE id='own'").get().cashBalance).toBe(194000);
 expect(staffDepartment(db,c,'Recruitment')).toMatchObject({level:0,pending:true,monthly:0});expect(()=>hireDepartment(db,c,'Recruitment')).toThrow(/progress/);
 const ready={...c,currentDate:'2026-01-08'};expect(staffDepartment(db,ready,'Recruitment')).toMatchObject({level:1,pending:false,monthly:750});
 const view=clubStructure(db,ready,100000,-1000,5000);expect(view.netAfterStaff).toBe(-1750);expect(view.projections.find(x=>x.months===12)?.cash).toBe(79000);
 expect(staffDepartment(db,{...ready,id:'another'},'Recruitment').level).toBe(0);
});
it('persists negotiation exhaustion across reloads and refuses offers until a cooldown expires',()=>{
 const quote={demands:{salary:10000,bonus:25000}};
 for(let i=0;i<3&&negotiationState(db,c,'q').patience>0;i++)negotiateTerms(db,c,'q',{salary:100,bonus:0},quote);
 expect(negotiationState(db,c,'q')).toMatchObject({patience:0,blockedUntil:'2026-01-15'});
 const restored=sqlAdapter(new SQL.Database(db.exportBinary()));expect(()=>negotiateTerms(restored,c,'q',{salary:10000,bonus:25000},quote)).toThrow(/reopen/);
 expect(negotiateTerms(restored,{...c,currentDate:'2026-01-15'},'q',{salary:10000,bonus:25000},quote)).toMatchObject({accepted:true,patience:100});
});
it('team play raises actual club chemistry even when a player has reached potential',()=>{
 db.exec("UPDATE players SET potential=overall WHERE id='p';INSERT INTO player_traits(playerId) VALUES('p')");
 const m=new CareerManagement(db);const schedule=Array.from({length:7},(_,day)=>({day,category:'Team Play',intensity:'Normal'}));
 m.saveTraining(c.id,schedule);(m as any).trainDay(c,c.currentDate);
 expect(db.prepare("SELECT teamChemistry FROM teams WHERE id='own'").get().teamChemistry).toBeGreaterThan(50);
 expect(db.prepare("SELECT chemistry FROM players WHERE id='p'").get().chemistry).toBeGreaterThan(50);
 expect(squadDynamics(db,c).cohesion).toBe(50); // UI rounds gradual gains, not instant +1s.
});
it('agency relationships carry between clients in one save but not across saves',()=>{
 const first=playerRepresentative(db,c,'q');
 const another=Array.from({length:100},(_,i)=>'client'+i).find(id=>playerRepresentative(db,c,id).agencyId===first.agencyId)!;
 changeAgencyTrust(db,c,'q',-8);
 expect(playerRepresentative(db,c,another).trust).toBe(42);
 expect(playerRepresentative(db,{...c,id:'other'},another).trust).toBe(50);
});
it('staff wages settle once per month and never disappear from the cash ledger',()=>{
 const economy=new ClubEconomy(db);economy.overview(c);hireDepartment(db,c,'Recruitment');
 economy.tick({...c,currentDate:'2026-02-01'});economy.tick({...c,currentDate:'2026-02-01'});
 const rows=db.prepare("SELECT amount FROM club_ledger WHERE careerId='save' AND category='Backroom staff wages'").all();
 expect(rows).toEqual([{amount:-750}]);
});
