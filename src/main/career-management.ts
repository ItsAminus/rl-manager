import {ClubEconomy,clauseTerms,settleSellOn,payClubPrize} from './club-economy';
import {RecruitmentNetwork} from './recruitment-network';
import type { AppDatabase } from './database';
import { v4 as uuid } from 'uuid';
import { addDays, canControlFixture, contractOfferScore, DEFAULT_TRAINING, socialImpact, TRAINING_ATTRIBUTES, TRAINING_CATEGORIES } from '../game/career-rules';
import { simulateSeries,simulateGame } from '../game/match-simulation';
import { ensurePlayableRoster } from './amateur-pool';
import { DEFAULT_TACTICS, MATCH_ROLES, TACTIC_CHOICES,bindTactics } from '../game/tactics';
import { repairFutureRosterEntries } from './roster-sync';
import { PlayerInteractions } from './player-interactions';
import { OutgoingTransfers } from './outgoing-transfers';
import {ensureTalentPool,knownProspect} from './talent-pool';
import {staffDepartment} from './club-structure';
import {clubFeeQuote,agreedTransfer,paymentPlan,calendarMonth} from './transfer-agreements';
import {negotiationState,playerRepresentative,changeAgencyTrust} from './contract-negotiations';
import { Chirp } from './chirp';
import {Tournament} from './tournament';
import {TransferMarket} from './transfer-market';
import {EarnedDevelopment} from './earned-development';
import {careerWindow} from './transfer-calendar';
import {recruitmentInterest} from './recruitment-interest';
import {officialRules,openSchedule,seasonDate,circuitPoints,placementPrize,eventPrizePool,lcqSchedule,EWC_QUOTAS} from '../game/official-competition-rules';
import {CircuitQualification} from './circuit-qualification';
import {CareerHonours} from './career-honours';
import {careerMode,isPath} from '../game/career-mode';
import {PathToGlory} from './path-to-glory';
import {SeriesTimeouts} from './series-timeouts';
import {FlagshipFormatRepair} from './flagship-format-repair';
import {FifaWorldCup} from './fifae-world-cup';
import {TrophyCeremonies} from './trophy-ceremonies';
import {ClubChampionship} from './club-championship';

const parse = (value: string | null, fallback: any = {}) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
export class CareerManagement {
  constructor(private db: AppDatabase) {}
  career(id: string) {
    const career = this.db.prepare('SELECT * FROM careers WHERE id = ?').get(id);
    if (!career) throw new Error('Career not found');
    new ClubEconomy(this.db).assertEmployed(id);
    return {...career,mode:careerMode(this.db,id)};
  }
  orderRoster(careerId: string, teamId: string, rows: any[]) {
    const career = this.career(careerId);
    const saved: string[] = career.teamId === teamId ? parse(this.db.prepare('SELECT players FROM career_lineup WHERE careerId = ?').get(careerId)?.players, []) : parse(this.db.prepare('SELECT players FROM career_ai_lineups WHERE careerId=? AND teamId=?').get(careerId,teamId)?.players,[]);
    const confirmed: string[] = parse(this.db.prepare('SELECT starterIds FROM team_roster_sources WHERE teamId = ?').get(teamId)?.starterIds, []);
    const ids = saved.length ? saved : confirmed;
    return [...rows].sort((a, b) => {
      const index = (id: string) => ids.includes(id) ? ids.indexOf(id) : 3;
      return index(a.id) - index(b.id) || b.overall - a.overall || a.id.localeCompare(b.id);
    });
  }
  roster(careerId: string, teamId: string) {
    return this.orderRoster(careerId, teamId, this.db.prepare('SELECT * FROM players WHERE teamId = ?').all(teamId));
  }
  setLineup(careerId: string, ids: string[]) {
    const career = this.career(careerId);
    if (this.db.prepare("SELECT id FROM fixtures WHERE status='in_progress' AND (homeTeamId=? OR awayTeamId=?) LIMIT 1").get(career.teamId,career.teamId)) throw new Error('Finish the current series before changing your starting lineup.');
    if (!Array.isArray(ids) || ids.length !== 3 || new Set(ids).size !== 3 || ids.some(id => !this.db.prepare('SELECT id FROM players WHERE id = ? AND teamId = ?').get(id, career.teamId))) throw new Error('Choose three different players from your own squad.');
    this.db.prepare('INSERT OR REPLACE INTO career_lineup (careerId, players) VALUES (?, ?)').run(careerId, JSON.stringify(ids));
    return { success: true };
  }
  tactics(careerId: string) {
    const career=this.career(careerId);
    const previous=parse(this.db.prepare('SELECT plan FROM career_tactics WHERE careerId = ?').get(careerId)?.plan, DEFAULT_TACTICS);
    const bound=bindTactics({...DEFAULT_TACTICS,...previous},this.roster(careerId,career.teamId).slice(0,3));
    if(!previous.rolesByPlayer)this.db.prepare('INSERT OR REPLACE INTO career_tactics(careerId,plan) VALUES (?,?)').run(careerId,JSON.stringify(bound));
    return bound;
  }
  saveTactics(careerId: string, plan: any) {
    plan={...DEFAULT_TACTICS,...plan};
    const career=this.career(careerId);
    new SeriesTimeouts(this.db).assertCanEdit(careerId);
    if (!plan || Object.entries(TACTIC_CHOICES).some(([key, choices]) => !choices.includes(plan[key])) || [0, 1, 2].some(i => !MATCH_ROLES.includes(plan.roles?.[i]))) throw new Error('Choose valid tactics and a role for each starter.');
    const players=this.roster(careerId,career.teamId).slice(0,3);
    if(plan.rolesByPlayer&&players.some(p=>!MATCH_ROLES.includes(plan.rolesByPlayer[p.id])))throw new Error('Assign a valid role to each starting player.');
    this.db.prepare('INSERT OR REPLACE INTO career_tactics (careerId, plan) VALUES (?, ?)').run(careerId, JSON.stringify(bindTactics({...plan,ordersByPlayer:this.tactics(careerId).ordersByPlayer||{}},players)));
    return { success: true };
  }
  timeout(careerId:string,fixtureId:string,orders:Record<string,string>,tone:string){
    return this.db.transaction(()=>{
      new SeriesTimeouts(this.db).assertManagerActive(careerId,fixtureId);
      const c=this.career(careerId),f=this.assertFixture(careerId,fixtureId);
      if(!f||f.status==='completed')throw Error('Timeouts are available between games of an unfinished series.');
      const games=this.db.prepare('SELECT gameNumber FROM game_results WHERE fixtureId=? ORDER BY gameNumber').all(fixtureId);
      if(!games.length)throw Error('Play the first game before calling a timeout.');
      const players=this.roster(careerId,c.teamId).slice(0,3),allowed=['balanced','press','defend','infield','demo'];
      if(!orders||players.some(p=>!allowed.includes(orders[p.id]))||Object.keys(orders).some(pid=>!players.some(p=>p.id===pid)))throw Error('Choose a valid order for every starter.');
      if(!['encourage','focus','relax'].includes(tone))throw Error('Choose a timeout message.');
      const plan=this.tactics(careerId);plan.ordersByPlayer=orders;
      this.db.prepare('INSERT OR REPLACE INTO career_tactics(careerId,plan) VALUES (?,?)').run(careerId,JSON.stringify(plan));
      const previous=this.db.prepare('SELECT tone FROM series_timeouts WHERE careerId=? AND fixtureId=? AND afterGame=?').get(careerId,fixtureId,games.length);
      if(!previous){
        for(const p of players){
          this.db.prepare('UPDATE players SET morale=MIN(100,morale+?),fatigue=MAX(0,fatigue-2) WHERE id=?').run(tone==='encourage'?2:1,p.id);
          this.db.prepare('UPDATE player_traits SET confidence=MIN(100,confidence+?) WHERE playerId=?').run(tone==='relax'?2:1,p.id);
        }
        this.db.prepare('INSERT INTO series_timeouts VALUES (?,?,?,?,?)').run(careerId,fixtureId,games.length,tone,JSON.stringify(orders));
      }
      return {success:true,alreadyTalked:!!previous,orders};
    })();
  }
  timeoutState(careerId:string,fixtureId:string){
    this.assertFixture(careerId,fixtureId);
    return new SeriesTimeouts(this.db).state(careerId,fixtureId);
  }
  startTimeout(careerId:string,fixtureId:string){this.assertFixture(careerId,fixtureId);return new SeriesTimeouts(this.db).start(careerId,fixtureId);}
  message(careerId: string, date: string, type: string, title: string, body: string, href?: string) {
    this.db.prepare('INSERT INTO inbox_items (id, careerId, date, type, title, body, isRead, actions) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
      .run(uuid(), careerId, date, type, title, body, href ? JSON.stringify([{ label: 'Open', action: 'navigate', data: { href } }]) : null);
  }
  ensureCircuit(careerId: string) {
    const career = this.career(careerId);
    if(isPath(career)){
      new PathToGlory(this.db).initialise(careerId);
      const season=this.db.prepare('SELECT * FROM seasons WHERE careerId=? AND isActive=1').get(careerId);
      if(season&&career.currentDate>season.endDate){
        this.db.prepare("UPDATE competitions SET status='cancelled' WHERE id IN (SELECT competitionId FROM career_competitions WHERE careerId=? AND stage NOT IN ('PATH','ARCHIVED')) AND status<>'completed'").run(careerId);
        this.db.prepare("UPDATE career_competitions SET stage='ARCHIVED' WHERE careerId=? AND stage<>'PATH'").run(careerId);
        this.db.prepare('UPDATE seasons SET isActive=0 WHERE id=?').run(season.id);
        this.db.prepare('INSERT INTO seasons(id,careerId,number,startDate,endDate,isActive) VALUES (?,?,?,?,?,1)').run(uuid(),careerId,season.number+1,career.currentDate,addDays(career.currentDate,365));
        this.db.prepare("DELETE FROM settings WHERE key IN ('circuit_v2','official_circuit_rules_v3')").run();
      }
    }
    if (this.db.prepare("SELECT competitionId FROM career_competitions WHERE careerId = ? AND stage NOT IN ('PATH','ARCHIVED') LIMIT 1").get(careerId)) { this.upgradeCircuit(career);this.upgradeOfficialCircuit(career);repairFutureRosterEntries(this.db, careerId);this.repairUnstartedFlagships(careerId);new FifaWorldCup(this.db).ensure(career);new ClubChampionship(this.db).ensure(career); return; }
    this.db.transaction(() => {
      const teams = this.db.prepare(`SELECT t.* FROM teams t LEFT JOIN team_roster_sources rs ON rs.teamId = t.id WHERE COALESCE(rs.status,'') NOT IN ('inactive','incomplete','disbanded') AND NOT EXISTS (SELECT 1 FROM generated_entities g WHERE g.id = t.id) AND (SELECT COUNT(*) FROM players p WHERE p.teamId = t.id) >= 3 ORDER BY reputation DESC, t.id`).all();
      const regions = [...new Set(teams.map(t => t.region))];
      if(!isPath(career)){
      const practiceId = this.createCompetition(career, 'Club practice series', this.db.prepare('SELECT region FROM teams WHERE id = ?').get(career.teamId)?.region, 'SCRIM', addDays(career.currentDate, 2), 0,
        'Non-qualifying practice series. Results do not award circuit qualification.', []);
      this.db.prepare("UPDATE competitions SET status = 'scheduled', prizePool = 0 WHERE id = ?").run(practiceId);
      this.db.prepare('INSERT INTO competition_entries (competitionId, teamId, seed) VALUES (?, ?, 1)').run(practiceId, career.teamId);
      const opponents = teams.filter(t => t.id !== career.teamId && t.region === this.db.prepare('SELECT region FROM teams WHERE id = ?').get(career.teamId)?.region).slice(0, 8);
      for (let i = 0; i < 10 && opponents.length; i++) {
        const opponent = opponents[i % opponents.length];
        this.db.prepare('INSERT OR IGNORE INTO competition_entries (competitionId, teamId, seed) VALUES (?, ?, ?)').run(practiceId, opponent.id, i + 2);
        this.db.prepare('INSERT INTO fixtures (id, competitionId, round, homeTeamId, awayTeamId, scheduledDate, status, seriesFormat) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(uuid(), practiceId, i + 1, i % 2 ? opponent.id : career.teamId, i % 2 ? career.teamId : opponent.id, addDays(career.currentDate, 2 + i * 14), 'scheduled', 'BO3');
      }
      }
      for (let cycle = 1; cycle <= 6; cycle++) {
        const start = addDays(career.currentDate, 8 + (cycle - 1) * 20 + (cycle>3?38:0));
        for (const region of regions) {
          const entrants = teams.filter(t => t.region === region).map(t => t.id);
          const q = this.createCompetition(career, `RLCS ${region} Open ${cycle} — Qualifier`, region, 'QUALIFIER', start, cycle,
            'Open registration. Sixteen teams advance to the main event.', entrants);
          this.createCompetition(career, `RLCS ${region} Open ${cycle}`, region, 'REGIONAL', addDays(start, 10), cycle,
            'Qualify through this Open’s qualifier. Career main-event format: four groups, then an eight-team hybrid playoff.', [], [q]);
        }
      }
      this.addFlagships(career,career.currentDate);
      this.db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES ('circuit_v2',?)").run(careerId);
      this.message(careerId, career.currentDate, 'general', 'Your route to Worlds',
        'Six RLCS Opens across two splits lead to two Majors. Season points and regional LCQs decide Worlds qualification. Majors and Worlds have four-team groups and hybrid playoffs. Event dates follow this career season; qualifiers and Open main events use a streamlined career format.', '/competitions');
    })();
    this.upgradeOfficialCircuit(career);
    new FifaWorldCup(this.db).ensure(career);
    new ClubChampionship(this.db).ensure(career);
  }
  private upgradeOfficialCircuit(career:any){
    const key='official_circuit_rules_v3';if(this.db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value===career.id)return;
    this.db.transaction(()=>{
      const season=this.db.prepare('SELECT * FROM seasons WHERE careerId=? AND isActive=1').get(career.id);
      const base=season?.startDate||career.currentDate,year=Number(base.slice(0,4))+(Number(base.slice(5,7))>=9?1:0);
      const comps=this.db.prepare("SELECT c.*,cc.stage,cc.cycle,cc.startDate,cc.sources FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.careerId=? AND cc.stage<>'ARCHIVED'").all(career.id);
      const globals:Record<string,string>={KICKOFF:seasonDate('2025-12-05',year),WORLDS:seasonDate('2026-09-15',year),INVITATIONAL:seasonDate('2026-08-12',year)};
      for(const c of comps){
        if(c.stage==='SCRIM'||c.stage==='PATH'||c.stage==='FIFAE'||c.stage.startsWith('CLUB_'))continue;
        const played=this.db.prepare("SELECT id FROM fixtures WHERE competitionId=? AND (status IN ('completed','in_progress') OR scheduledDate<=?) LIMIT 1").get(c.id,career.currentDate);
        if(played||c.status==='completed'){
          if(c.status!=='completed')for(const entry of this.db.prepare('SELECT teamId FROM competition_entries WHERE competitionId=?').all(c.id))
            new CareerHonours(this.db).register(career.id,c.id,entry.teamId,this.roster(career.id,entry.teamId),career.currentDate);
          this.db.prepare('UPDATE competitions SET config=? WHERE id=?').run(JSON.stringify({...parse(c.config),legacyRules:true,qualificationRule:parse(c.config).qualificationRule+' Existing results retain their original career format.'}),c.id);continue;
        }
        const rules=officialRules(c.stage,c.cycle);let start=c.startDate,schedule:any;
        if(['QUALIFIER','REGIONAL'].includes(c.stage)){schedule=openSchedule(c.region,c.cycle,year);start=c.stage==='QUALIFIER'?schedule.double_elimination:schedule.swiss;}
        else if(c.stage==='MAJOR')start=seasonDate(c.cycle===1?'2026-02-19':'2026-05-20',year);
        else if(c.stage==='LCQ')start=seasonDate(c.region==='MENA'?'2026-07-02':'2026-07-03',year);
        else start=globals[c.stage]||start;
        if(start<career.currentDate){start=addDays(career.currentDate,3);schedule=undefined;}
        // Only unplayed future stages are rebuilt. Played scores and saves are
        // never converted into results for a different tournament format.
        for(const table of ['fixture_stages','tournament_nodes','tournament_groups','tournament_stage_teams','tournament_state','competition_byes','qualification_results'])this.db.prepare(`DELETE FROM ${table} WHERE competitionId=?`).run(c.id);
        this.db.prepare('DELETE FROM fixtures WHERE competitionId=?').run(c.id);
        const config={...rules,schedule,seasonYear:year};
        const name=c.stage==='MAJOR'?`RLCS ${year} ${c.cycle===1?'Boston':'Paris'} Major`:c.stage==='WORLDS'?`RLCS ${year} World Championship`:
          ['REGIONAL','QUALIFIER'].includes(c.stage)?`RLCS ${year} ${c.region} Open ${c.cycle}${c.stage==='QUALIFIER'?' — Qualifier':''}`:
          c.stage==='INVITATIONAL'?`Esports World Cup ${year}`:c.stage==='KICKOFF'?`RLCS ${year} Kick-Off Tournament`:`RLCS ${year} ${c.region} Last Chance Qualifier`;
        this.db.prepare('UPDATE competitions SET name=?,config=?,format=?,prizePool=? WHERE id=?').run(name,JSON.stringify(config),rules.format,eventPrizePool(c.stage,c.region,c.cycle),c.id);
        this.db.prepare('UPDATE career_competitions SET startDate=? WHERE competitionId=?').run(start,c.id);
        this.db.prepare("UPDATE calendar_events SET date=?,title=?,description=? WHERE relatedId=? AND type='tournament_start'").run(start,name,rules.qualificationRule,c.id);
        this.db.prepare("DELETE FROM calendar_events WHERE relatedId=? AND type='group_draw'").run(c.id);
        const entrants=this.db.prepare('SELECT teamId FROM competition_entries WHERE competitionId=? ORDER BY seed').all(c.id).map(e=>e.teamId);
        if(entrants.length)this.enterTeams(c.id,entrants,start);
      }
      const sources=comps.filter(c=>['REGIONAL','MAJOR'].includes(c.stage)).map(c=>c.id),kickoff=comps.find(c=>c.stage==='KICKOFF');
      const ewc=comps.find(c=>c.stage==='INVITATIONAL');
      if(ewc&&!comps.some(c=>c.stage==='EWC_LCQ')){
        const id=this.createCompetition(career,'Esports World Cup Last Chance Qualifier','GLOBAL','EWC_LCQ',seasonDate('2026-08-08',year),7,officialRules('EWC_LCQ').qualificationRule,[],sources);
        const rules={...officialRules('EWC_LCQ'),seasonYear:year};this.db.prepare('UPDATE competitions SET config=?,format=?,prizePool=? WHERE id=?').run(JSON.stringify(rules),'double_elimination',100000,id);
        this.db.prepare('UPDATE career_competitions SET sources=? WHERE competitionId=?').run(JSON.stringify([...sources,id]),ewc.id);
      }
      if(kickoff)for(const major of comps.filter(c=>c.stage==='MAJOR'&&c.cycle===1))this.db.prepare('UPDATE career_competitions SET sources=? WHERE competitionId=?').run(JSON.stringify([...parse(major.sources,[]),kickoff.id]),major.id);
      for(const region of ['Europe','North America','MENA','South America','Oceania','Asia-Pacific','Sub-Saharan Africa'])if(!comps.some(c=>c.stage==='LCQ'&&c.region===region)){
        const id=this.createCompetition(career,`RLCS ${year} ${region} Last Chance Qualifier`,region,'LCQ',seasonDate('2026-07-03',year),7,officialRules('LCQ').qualificationRule,[],sources);
        const rules={...officialRules('LCQ'),seasonYear:year};this.db.prepare('UPDATE competitions SET config=?,format=?,prizePool=0 WHERE id=?').run(JSON.stringify(rules),rules.format,id);
        const world=comps.find(c=>c.stage==='WORLDS');if(world)this.db.prepare('UPDATE career_competitions SET sources=? WHERE competitionId=?').run(JSON.stringify([...parse(this.db.prepare('SELECT sources FROM career_competitions WHERE competitionId=?').get(world.id).sources,[]),id]),world.id);
      }
      if(season&&season.endDate<seasonDate('2026-09-20',year))this.db.prepare('UPDATE seasons SET endDate=? WHERE id=?').run(seasonDate('2026-09-20',year),season.id);
      this.db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES (?,?)').run(key,career.id);
      this.message(career.id,career.currentDate,'general','Official competition formats updated','Unplayed events now use the 2026 organiser rules: double elimination, Swiss and GSL Opens, separate Major formats, Worlds play-ins, official points and played qualification tiebreakers. Previously played events retain their results.','/competitions');
    })();
  }
  private repairUnstartedFlagships(careerId:string){
    const repair=new FlagshipFormatRepair(this.db,id=>this.ranking(id));
    for(const row of this.db.prepare("SELECT c.id FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.careerId=? AND cc.stage IN ('MAJOR','WORLDS') AND c.status NOT IN ('completed','cancelled') AND NOT EXISTS(SELECT 1 FROM tournament_state ts WHERE ts.competitionId=c.id)").all(careerId)){
      const plan=repair.preview(careerId,row.id);
      if(plan.required&&plan.canRepair&&!plan.completedSeries)repair.apply(careerId,row.id);
    }
  }
  private addFlagships(career:any,origin:string){
    const opens=this.db.prepare("SELECT competitionId,cycle FROM career_competitions WHERE careerId=? AND stage='REGIONAL'").all(career.id);
    for(const split of [1,2])this.createCompetition(career,`RLCS Major ${split}`,'GLOBAL','MAJOR',addDays(origin,split===1?74:174),split,
      `Regional slots are awarded by points across Opens ${split===1?'1–3':'4–6'}. Four groups of four; top ${split===1?'two':'three'} advance to hybrid playoffs.`,[],opens.filter(o=>split===1?o.cycle<=3:o.cycle>=4).map(o=>o.competitionId));
    const sources=this.db.prepare("SELECT competitionId FROM career_competitions WHERE careerId=? AND stage IN ('REGIONAL','MAJOR')").all(career.id).map(o=>o.competitionId);
    for(const region of ['Europe','North America','MENA','South America'])this.createCompetition(career,`RLCS ${region} Last Chance Qualifier`,region,'LCQ',addDays(origin,192),7,
      'Teams outside the sixteen direct Worlds places compete for one regional Worlds berth. Career elimination qualifier.',[],sources);
    const lcqs=this.db.prepare("SELECT competitionId FROM career_competitions WHERE careerId=? AND stage='LCQ'").all(career.id).map(o=>o.competitionId);
    this.createCompetition(career,'RLCS World Championship','GLOBAL','WORLDS',addDays(origin,211),8,
      'Sixteen direct point qualifiers plus four LCQ winners. Eight-team play-ins reduce the field to sixteen; four groups, top three advance to hybrid playoffs.',[],[...sources,...lcqs]);
    this.createCompetition(career,'Esports World Cup','GLOBAL','INVITATIONAL',addDays(origin,186),7,
      'Invitation based on completed career circuit points. Sixteen teams; career group and hybrid playoff format.',[],sources);
    const kickoff=opens.filter(o=>o.cycle===1&&['Europe','North America'].includes(this.db.prepare('SELECT region FROM competitions WHERE id=?').get(o.competitionId).region)).map(o=>o.competitionId);
    this.createCompetition(career,'RLCS Kick-Off Tournament','GLOBAL','KICKOFF',addDays(origin,31),1,'Top four from Europe and North America Open 1. Seeded single-elimination ladder.',[],kickoff);
  }
  private upgradeCircuit(career:any){
    if(this.db.prepare("SELECT value FROM settings WHERE key='circuit_v2'").get()?.value===career.id)return;
    this.db.transaction(()=>{
      const comps=this.db.prepare('SELECT c.*,cc.stage,cc.cycle,cc.startDate FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.careerId=?').all(career.id);
      const first=comps.find(c=>c.stage==='QUALIFIER'&&c.cycle===1),origin=first?addDays(first.startDate,-7):career.currentDate;
      for(const c of comps){
        const played=this.db.prepare("SELECT id FROM fixtures WHERE competitionId=? AND (status IN ('completed','in_progress') OR scheduledDate<=?) LIMIT 1").get(c.id,career.currentDate);
        if(['MAJOR','WORLDS'].includes(c.stage)&&!played){
          this.db.prepare("UPDATE career_competitions SET stage='ARCHIVED' WHERE competitionId=?").run(c.id);
          this.db.prepare("UPDATE competitions SET status='cancelled' WHERE id=?").run(c.id);
          this.db.prepare('DELETE FROM calendar_events WHERE relatedId=?').run(c.id);continue;
        }
        if(c.stage==='QUALIFIER'||c.stage==='REGIONAL'){
          const name=`RLCS ${c.region} Open ${c.cycle}${c.stage==='QUALIFIER'?' — Qualifier':''}`;
          this.db.prepare('UPDATE competitions SET name=? WHERE id=?').run(name,c.id);
          this.db.prepare("UPDATE calendar_events SET title=? WHERE relatedId=? AND type='tournament_start'").run(name,c.id);
          if(c.stage==='REGIONAL'){
            const config={...parse(c.config),tournamentVersion:1,advance:2,kind:'REGIONAL',seriesFormat:'BO5',legacyLeague:!!played};
            if(!played){
              this.db.prepare('DELETE FROM fixtures WHERE competitionId=?').run(c.id);
              this.db.prepare("UPDATE competitions SET config=?,format='groups_hybrid' WHERE id=?").run(JSON.stringify(config),c.id);
              const entrants=this.db.prepare('SELECT teamId FROM competition_entries WHERE competitionId=? ORDER BY seed').all(c.id).map(e=>e.teamId);
              if(entrants.length)this.enterTeams(c.id,entrants,c.startDate>career.currentDate?c.startDate:addDays(career.currentDate,3));
            }else this.db.prepare('UPDATE competitions SET config=? WHERE id=?').run(JSON.stringify(config),c.id);
          }
        }
      }
      const teams=this.db.prepare("SELECT t.* FROM teams t WHERE (SELECT COUNT(*) FROM players p WHERE p.teamId=t.id)>=3 AND NOT EXISTS(SELECT 1 FROM generated_entities g WHERE g.id=t.id) ORDER BY reputation DESC,t.id").all();
      for(let cycle=4;cycle<=6;cycle++)for(const region of [...new Set(teams.map(t=>t.region))]){
        const start=addDays(origin,8+(cycle-1)*20+38);
        const q=this.createCompetition(career,`RLCS ${region} Open ${cycle} — Qualifier`,region,'QUALIFIER',start,cycle,'Open registration. Sixteen teams advance to the main event.',teams.filter(t=>t.region===region).map(t=>t.id));
        this.createCompetition(career,`RLCS ${region} Open ${cycle}`,region,'REGIONAL',addDays(start,10),cycle,'Four groups, then an eight-team hybrid career playoff.',[],[q]);
      }
      this.addFlagships(career,origin);
      this.db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES ('circuit_v2',?)").run(career.id);
      this.message(career.id,career.currentDate,'general','RLCS circuit updated','Majors, Worlds, LCQs and invitationals are now on the season calendar. Completed games are retained; an Open already underway keeps its existing league schedule, while unstarted events use the new draw and playoff stages.','/competitions');
    })();
  }
  private createCompetition(career: any, name: string, region: string, stage: string, start: string, cycle: number, rule: string, entrants: string[], sources: string[] = []) {
    const id = uuid();
    const season = this.db.prepare('SELECT id FROM seasons WHERE careerId = ? AND isActive = 1').get(career.id);
    this.db.prepare('INSERT INTO competitions (id, name, region, type, format, prizePool, seasonId, status, config) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, name, region, stage, ['QUALIFIER','LCQ'].includes(stage) ? 'single_elimination' : stage === 'SCRIM' ? 'friendlies' : 'groups_hybrid', stage === 'QUALIFIER' ? 0 : stage === 'REGIONAL' ? 50000 : 250000, season?.id || null,
        entrants.length ? 'scheduled' : 'awaiting_qualification', JSON.stringify({ seriesFormat: ['QUALIFIER', 'SCRIM'].includes(stage) ? 'BO3' : 'BO5', qualificationRule: rule,tournamentVersion:1,kind:stage,advance:stage==='WORLDS'||stage==='MAJOR'&&cycle===2?3:2 }));
    this.db.prepare('INSERT INTO career_competitions (competitionId, careerId, stage, cycle, startDate, sources) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, career.id, stage, cycle, start, JSON.stringify(sources));
    if (entrants.length) this.enterTeams(id, entrants, start);
    this.db.prepare('INSERT INTO calendar_events (id, careerId, date, type, title, description, relatedId) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(uuid(), career.id, start, 'tournament_start', name, rule, id);
    return id;
  }
  private enterTeams(id: string, teams: string[], start: string) {
    teams.forEach((t, i) => this.db.prepare('INSERT OR IGNORE INTO competition_entries (competitionId, teamId, seed) VALUES (?, ?, ?)').run(id, t, i + 1));
    const competition = this.db.prepare('SELECT * FROM competitions WHERE id = ?').get(id);
    const official=parse(competition.config);
    const validFlagshipField=competition.type==='MAJOR'?teams.length===16:competition.type==='WORLDS'&&(teams.length===20||teams.length===16&&(!official.rulesVersion||official.formatRepairVersion));
    if(['MAJOR','WORLDS'].includes(competition.type)&&!validFlagshipField){
      const required=competition.type==='WORLDS'&&official.rulesVersion?20:16;
      this.db.prepare("UPDATE competitions SET status='awaiting_qualification',config=? WHERE id=?").run(JSON.stringify({...official,fieldPendingReason:`${teams.length} places confirmed. This event needs ${required} qualified teams before its draw; an all-team league will not be generated.`}),id);
      return false;
    }
    if(official.rulesVersion){
      if(!['QUALIFIER','LCQ','EWC_LCQ'].includes(competition.type)){
        const owner=this.db.prepare('SELECT careerId FROM career_competitions WHERE competitionId=?').get(id)?.careerId;
        if(owner)for(const teamId of teams)new CareerHonours(this.db).register(owner,id,teamId,this.roster(owner,teamId),start);
      }
      new Tournament(this.db).prepare(id,teams,start,official);
      this.db.prepare("UPDATE competitions SET status='scheduled' WHERE id=?").run(id);return;
    }
    if (['QUALIFIER','LCQ'].includes(competition.type)) {
      this.db.prepare("UPDATE competitions SET status = 'scheduled' WHERE id = ?").run(id);
      this.knockoutRound(id, teams, start, 1);
      return;
    }
    const stagedConfig=parse(competition.config);
    if((stagedConfig.tournamentVersion&&!stagedConfig.legacyLeague||['MAJOR','WORLDS'].includes(competition.type))&&
       (teams.length===16||competition.type==='WORLDS'&&teams.length===20||competition.type==='KICKOFF'&&teams.length===8)){
      new Tournament(this.db).prepare(id,teams,start,stagedConfig);
      this.db.prepare("UPDATE competitions SET status='scheduled' WHERE id=?").run(id);
      const owner=this.db.prepare('SELECT careerId FROM career_competitions WHERE competitionId=?').get(id);
      this.db.prepare("INSERT INTO calendar_events(id,careerId,date,type,title,description,relatedId) VALUES (?,?,?,?,?,?,?)").run(uuid(),owner.careerId,addDays(start,-2),'group_draw',competition.name+' — Draw','The seeded groups will be revealed on this date.',id);
      return;
    }
    // Small development datasets / preserved legacy leagues keep a valid schedule.
    const wheel: (string | null)[] = [...teams];
    if (wheel.length % 2) wheel.push(null);
    const config = parse(this.db.prepare('SELECT config FROM competitions WHERE id = ?').get(id)?.config);
    for (let round = 1; round < wheel.length; round++) {
      for (let i = 0; i < wheel.length / 2; i++) {
        const a = wheel[i], b = wheel[wheel.length - 1 - i];
        if (a && b) this.db.prepare('INSERT INTO fixtures (id, competitionId, round, homeTeamId, awayTeamId, scheduledDate, status, seriesFormat) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(uuid(), id, round, round % 2 ? a : b, round % 2 ? b : a, addDays(start, round - 1), 'scheduled', config.seriesFormat);
      }
      wheel.splice(1, 0, wheel.pop()!);
    }
    this.db.prepare("UPDATE competitions SET status = 'scheduled' WHERE id = ?").run(id);
  }
  private knockoutRound(id: string, teams: string[], start: string, round: number) {
    const target=this.db.prepare('SELECT type FROM competitions WHERE id=?').get(id)?.type==='LCQ'?1:16;
    if (teams.length <= target) {
      this.db.prepare('INSERT OR REPLACE INTO qualification_results (competitionId, teams) VALUES (?, ?)').run(id, JSON.stringify(teams));
      this.db.prepare("UPDATE competitions SET status = 'completed' WHERE id = ?").run(id);
      return;
    }
    const bracket = 2 ** Math.ceil(Math.log2(teams.length));
    const byes = round === 1 ? bracket - teams.length : teams.length % 2;
    teams.slice(0, byes).forEach(team => this.db.prepare('INSERT INTO competition_byes (competitionId, round, teamId) VALUES (?, ?, ?)').run(id, round, team));
    const playing = teams.slice(byes);
    for (let i = 0; i < playing.length / 2; i++) this.db.prepare('INSERT INTO fixtures (id, competitionId, round, homeTeamId, awayTeamId, scheduledDate, status, seriesFormat) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(uuid(), id, round, playing[i], playing[playing.length - 1 - i], start, 'scheduled', 'BO3');
  }
  private progressQualifier(c: any, date: string) {
    const round = this.db.prepare('SELECT MAX(round) AS round FROM fixtures WHERE competitionId = ?').get(c.id)?.round;
    if (!round) return;
    const fixtures = this.db.prepare('SELECT * FROM fixtures WHERE competitionId = ? AND round = ?').all(c.id, round);
    if (!fixtures.length || fixtures.some(f => f.status !== 'completed')) return;
    const survivors = this.db.prepare('SELECT teamId FROM competition_byes WHERE competitionId = ? AND round = ?').all(c.id, round).map(t => t.teamId)
      .concat(fixtures.filter(f => f.homeScore !== f.awayScore).map(f => f.homeScore > f.awayScore ? f.homeTeamId : f.awayTeamId))
      .filter(id => !this.db.prepare('SELECT id FROM generated_entities WHERE id = ?').get(id));
    const seeds = this.db.prepare('SELECT teamId, seed FROM competition_entries WHERE competitionId = ?').all(c.id);
    survivors.sort((a, b) => seeds.find(s => s.teamId === a).seed - seeds.find(s => s.teamId === b).seed);
    this.knockoutRound(c.id, survivors, addDays(date, 1), round + 1);
  }
  ranking(id: string) {
    if(this.db.prepare('SELECT type FROM competitions WHERE id=?').get(id)?.type==='CLUB_LEAGUE')return new ClubChampionship(this.db).leagueStandings(id);
    const details=new Tournament(this.db).details(id);
    if(details){
      const entries=this.db.prepare('SELECT ce.teamId,t.name AS teamName FROM competition_entries ce JOIN teams t ON t.id=ce.teamId WHERE competitionId=? ORDER BY seed').all(id);
      const positions=new Tournament(this.db).placements(id)||new Map<string,number>(),final=details.nodes.find((n:any)=>n.id===id+':RESET')||details.nodes.find((n:any)=>n.id===id+':F');
      if(final?.status==='completed'){positions.set(final.homeScore>final.awayScore?final.homeTeamId:final.awayTeamId,1);positions.set(final.homeScore>final.awayScore?final.awayTeamId:final.homeTeamId,2);}
      for(const node of [...details.nodes].reverse())if(!details.config.rulesVersion&&node.status==='completed'){
        const loser=node.homeScore>node.awayScore?node.awayTeamId:node.homeTeamId;
        if(!positions.has(loser))positions.set(loser,node.lane==='Final Four'?3:node.label.toLowerCase().includes('quarterfinal')?5:node.label.toLowerCase().includes('round 2')?7:9);
      }
      const groups=details.groups.flatMap((g:any)=>g.standings);
      const qualified=parse(this.db.prepare('SELECT teams FROM qualification_results WHERE competitionId=?').get(id)?.teams,[]);
      const cc=this.db.prepare('SELECT c.type,c.region,cc.cycle FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE c.id=?').get(id);
      return entries.map(e=>{const placement=positions.get(e.teamId)??(qualified.includes(e.teamId)?1:(groups.find((g:any)=>g.teamId===e.teamId)?.position===4?13:9));return {...e,...groups.find((g:any)=>g.teamId===e.teamId),placement,points:cc?circuitPoints(cc.type,cc.cycle,placement):0};})
        .sort((a,b)=>a.placement-b.placement||(b.wins||0)-(a.wins||0)||(b.gameDiff||0)-(a.gameDiff||0)||a.teamId.localeCompare(b.teamId));
    }
    const rows = this.db.prepare('SELECT ce.teamId, t.name AS teamName FROM competition_entries ce JOIN teams t ON t.id = ce.teamId WHERE competitionId = ? ORDER BY ce.seed').all(id);
    const standings = rows.map(r => ({ ...r, played: 0, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, gameDiff: 0, points: 0 }));
    for (const f of this.db.prepare("SELECT * FROM fixtures WHERE competitionId = ? AND status = 'completed'").all(id)) {
      for (const home of [true, false]) {
        const s = standings.find(s => s.teamId === (home ? f.homeTeamId : f.awayTeamId));
        if (!s) continue;
        const ours = home ? f.homeScore : f.awayScore, theirs = home ? f.awayScore : f.homeScore;
        s.played++; s.gamesWon += ours; s.gamesLost += theirs;
        if (ours > theirs) { s.wins++; s.points += 3; } else s.losses++;
        s.gameDiff = s.gamesWon - s.gamesLost;
      }
    }
    const qualified: string[] = parse(this.db.prepare('SELECT teams FROM qualification_results WHERE competitionId = ?').get(id)?.teams, []);
    return standings.sort((a, b) => Number(qualified.includes(b.teamId)) - Number(qualified.includes(a.teamId)) || b.points - a.points || b.gameDiff - a.gameDiff || b.gamesWon - a.gamesWon || a.teamId.localeCompare(b.teamId));
  }
  progressCircuit(careerId: string, date: string) {
    const career = this.career(careerId);
    new FifaWorldCup(this.db).progress(careerId,date);
    new ClubChampionship(this.db).progress(careerId,date);
    const clubRegion = this.db.prepare('SELECT region FROM teams WHERE id = ?').get(career.teamId)?.region;
    const comps = this.db.prepare('SELECT c.*, cc.stage, cc.cycle, cc.startDate, cc.sources FROM competitions c JOIN career_competitions cc ON c.id = cc.competitionId WHERE cc.careerId = ? AND cc.stage NOT IN (\'ARCHIVED\',\'PATH\') ORDER BY cc.cycle, CASE cc.stage WHEN \'QUALIFIER\' THEN 0 WHEN \'REGIONAL\' THEN 1 ELSE 2 END').all(careerId);
    for (const c of comps) {
      if(c.stage==='FIFAE'||c.stage.startsWith('CLUB_'))continue;
      const current = this.db.prepare('SELECT status FROM competitions WHERE id = ?').get(c.id).status;
      const profile=parse(c.config),tournament=new Tournament(this.db);
      if(['MAJOR','WORLDS'].includes(c.stage)&&!tournament.has(c.id)&&(!profile.rulesVersion||profile.legacyRules||profile.legacyLeague)&&new FlagshipFormatRepair(this.db,id=>this.ranking(id)).preview(careerId,c.id).required)continue;
      if(profile.rulesVersion&&tournament.has(c.id)&&current!=='completed'&&current!=='cancelled'){
        const state=this.db.prepare('SELECT * FROM tournament_state WHERE competitionId=?').get(c.id);
        if(state.phase==='registration'&&date>=state.startDate)this.seedOfficialOpen(career,c,profile);
        tournament.progress(c.id,date);
        if(tournament.details(c.id)?.phase==='completed'){
          this.db.transaction(()=>{this.db.prepare("UPDATE competitions SET status='completed' WHERE id=?").run(c.id);this.awardOfficialPrizes(career,c,date);})();
        }
        continue;
      }
      if (!profile.rulesVersion&&['QUALIFIER','LCQ'].includes(c.stage) && current !== 'completed'&&current!=='awaiting_qualification') {
        this.progressQualifier(c, date);
        continue;
      }
      if (current === 'awaiting_qualification') {
        const sources: string[] = parse(c.sources, []);
        if (!sources.length || !sources.every(id => ['completed','cancelled'].includes(this.db.prepare('SELECT status FROM competitions WHERE id = ?').get(id)?.status))) continue;
        let entrants: string[];
        if(profile.rulesVersion&&['INVITATIONAL','EWC_LCQ'].includes(c.stage)){
          const scores=new CircuitQualification(this.db,id=>this.ranking(id)).scores(careerId,sources),own=(region:string)=>scores.filter(s=>s.region===region).map(s=>s.teamId);
          const direct=Object.entries(EWC_QUOTAS).flatMap(([region,n])=>own(region).slice(0,n));
          const defender=this.db.prepare("SELECT id FROM teams WHERE LOWER(name)='karmine corp' ORDER BY reputation DESC LIMIT 1").get()?.id;
          if(defender){if(direct.includes(defender)){const next=own('Europe').find(id=>!direct.includes(id));if(next)direct.push(next);}else direct.push(defender);}
          if(c.stage==='EWC_LCQ')entrants=this.db.prepare('SELECT id FROM teams WHERE (SELECT COUNT(*) FROM players p WHERE p.teamId=teams.id)>=3 ORDER BY reputation DESC,id').all().map(t=>t.id).filter(id=>!direct.includes(id)).slice(0,32);
          else{
            const lcq=sources.find(id=>this.db.prepare('SELECT type FROM competitions WHERE id=?').get(id)?.type==='EWC_LCQ'),winner=lcq&&parse(this.db.prepare('SELECT teams FROM qualification_results WHERE competitionId=?').get(lcq)?.teams,[])[0];
            if(!winner)continue;entrants=[...direct,winner];
            const pool1=[own('Europe')[0],own('MENA')[0]],pool2=[own('Europe')[1],own('North America')[0]];
            const pool4=[own('Asia-Pacific')[0],own('Oceania')[0],own('Sub-Saharan Africa')[0],winner];
            const pool3=entrants.filter(t=>![...pool1,...pool2,...pool4].includes(t));
            this.db.prepare('UPDATE competitions SET config=? WHERE id=?').run(JSON.stringify({...profile,drawPools:[pool1,pool2,pool3,pool4]}),c.id);
          }
        }else if(profile.rulesVersion&&['MAJOR','WORLDS','LCQ'].includes(c.stage)){
          const qualification=new CircuitQualification(this.db,id=>this.ranking(id));
          if(c.stage==='LCQ'&&!qualification.lcqRegions(careerId).includes(c.region)){
            this.db.prepare("UPDATE competitions SET status='cancelled' WHERE id=?").run(c.id);this.db.prepare('DELETE FROM calendar_events WHERE relatedId=?').run(c.id);continue;
          }
          const pointSources=sources.filter(id=>['REGIONAL','MAJOR'].includes(this.db.prepare('SELECT type FROM competitions WHERE id=?').get(id)?.type));
          const world=this.db.prepare("SELECT c.*,cc.stage,cc.cycle FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.careerId=? AND cc.stage='WORLDS' LIMIT 1").get(careerId);
          const direct=qualification.international(career,c.stage==='LCQ'?world:c,pointSources,date);if(!direct)continue;
          if(c.stage==='WORLDS')entrants=[...direct,...qualification.lcqRegions(careerId).flatMap(region=>sources.filter(id=>{const source=this.db.prepare('SELECT region,type FROM competitions WHERE id=?').get(id);return source?.type==='LCQ'&&source.region===region;}).flatMap(id=>parse(this.db.prepare('SELECT teams FROM qualification_results WHERE competitionId=?').get(id)?.teams,[])))];
          else if(c.stage==='LCQ')entrants=this.db.prepare('SELECT id FROM teams WHERE region=? AND (SELECT COUNT(*) FROM players p WHERE p.teamId=teams.id)>=3 ORDER BY reputation DESC,id').all(c.region).map(t=>t.id).filter(id=>!direct.includes(id));
          else entrants=direct;
          if(c.stage==='LCQ'){
            const schedule=lcqSchedule(qualification.lcqRegions(careerId).indexOf(c.region),profile.seasonYear||Number(c.startDate.slice(0,4)));
            c.startDate=schedule.double_elimination;this.db.prepare('UPDATE competitions SET config=? WHERE id=?').run(JSON.stringify({...profile,schedule}),c.id);
          }
        }else if(['MAJOR','WORLDS','LCQ','INVITATIONAL','KICKOFF'].includes(c.stage)&&parse(c.config).tournamentVersion){
          const direct=this.pointQualifiers(sources.filter(id=>this.db.prepare('SELECT type FROM competitions WHERE id=?').get(id)?.type!=='LCQ'),c.stage==='MAJOR');
          if(c.stage==='WORLDS')entrants=[...direct,...sources.filter(id=>this.db.prepare('SELECT type FROM competitions WHERE id=?').get(id)?.type==='LCQ').flatMap(id=>parse(this.db.prepare('SELECT teams FROM qualification_results WHERE competitionId=?').get(id)?.teams,[]))];
          else if(c.stage==='LCQ')entrants=this.db.prepare('SELECT id FROM teams WHERE region=? AND (SELECT COUNT(*) FROM players p WHERE p.teamId=teams.id)>=3 ORDER BY reputation DESC,id').all(c.region).map(t=>t.id).filter(id=>!direct.includes(id));
          else if(c.stage==='KICKOFF'){
            const eu=sources.find(id=>this.db.prepare('SELECT region FROM competitions WHERE id=?').get(id)?.region==='Europe'),na=sources.find(id=>this.db.prepare('SELECT region FROM competitions WHERE id=?').get(id)?.region==='North America');
            const a=eu?this.ranking(eu).slice(0,4).map(t=>t.teamId):[],b=na?this.ranking(na).slice(0,4).map(t=>t.teamId):[];
            entrants=[a[0],b[0],a[1],b[1],a[2],b[2],a[3],b[3]].filter(Boolean);
          }else entrants=direct;
        }else if (c.stage === 'WORLDS') {
          const combined = new Map<string, { wins: number; diff: number }>();
          for (const id of sources) for (const s of this.ranking(id)) {
            const old = combined.get(s.teamId) || { wins: 0, diff: 0 };
            combined.set(s.teamId, { wins: old.wins + s.wins, diff: old.diff + s.gameDiff });
          }
          entrants = [...combined].sort((a, b) => b[1].wins - a[1].wins || b[1].diff - a[1].diff || a[0].localeCompare(b[0])).slice(0, 8).map(e => e[0]);
        } else entrants = sources.flatMap(id => c.stage === 'REGIONAL'
          ? parse(this.db.prepare('SELECT teams FROM qualification_results WHERE competitionId = ?').get(id)?.teams, [])
          : this.ranking(id).slice(0, 2).map(s => s.teamId));
        entrants = entrants.filter(id => !this.db.prepare('SELECT id FROM generated_entities WHERE id = ?').get(id) && !this.db.prepare("SELECT teamId FROM team_roster_sources WHERE teamId = ? AND status IN ('inactive','incomplete','disbanded')").get(id) && this.db.prepare('SELECT COUNT(*) AS count FROM players WHERE teamId = ?').get(id).count >= 3);
        entrants=[...new Set(entrants)];
        const start = profile.rulesVersion?(c.startDate>=date?c.startDate:c.stage==='KICKOFF'?addDays(date,1):date):(c.startDate > addDays(date,2) ? c.startDate : addDays(date,3));
        if(this.enterTeams(c.id, entrants, start)===false)continue;
        this.db.prepare('UPDATE career_competitions SET startDate = ? WHERE competitionId = ?').run(start, c.id);
        this.db.prepare('UPDATE calendar_events SET date = ? WHERE careerId = ? AND relatedId = ?').run(start, careerId, c.id);
        if (c.region === clubRegion || c.region === 'GLOBAL') this.message(careerId, date, 'tournament_invitation', entrants.includes(career.teamId) ? `Qualified: ${c.name}` : `${c.name}: qualification missed`,
          entrants.includes(career.teamId) ? `Your results earned a place. Your first series is scheduled from ${start}.` : `Your team did not earn a place. Keep developing the squad for the next qualifier.`, `/competition/${c.id}`);
        if(isPath(career)&&entrants.includes(career.teamId))new PathToGlory(this.db).qualified(careerId,c);
      }
      if(tournament.has(c.id))tournament.progress(c.id,date);
      const pending = this.db.prepare("SELECT id FROM fixtures WHERE competitionId = ? AND status != 'completed' LIMIT 1").get(c.id);
      const state=tournament.details(c.id);
      if ((!state||state.phase==='completed')&&!pending && date >= c.startDate && this.db.prepare('SELECT status FROM competitions WHERE id = ?').get(c.id).status === 'scheduled') {
        this.db.prepare("UPDATE competitions SET status = 'completed' WHERE id = ?").run(c.id);
        const winner = this.ranking(c.id)[0];
        if(winner?.teamId)new TrophyCeremonies(this.db).record(careerId,c,winner.teamId,date);
        if(winner?.teamId)new CareerHonours(this.db).award(careerId,c,winner.teamId,date);
        if(isPath(career))new PathToGlory(this.db).competitionWon(careerId,c,winner?.teamId,date);
        if (!isPath(career)&&winner?.teamId === career.teamId && c.prizePool > 0) {
          payClubPrize(this.db,careerId,career.teamId,c.id,date,c.prizePool,c.name);
          this.message(careerId, date, 'general', `${c.name} champions`, `Your squad finished first and earned $${c.prizePool.toLocaleString()} in prize money.`, '/finances');
        }
      }
    }
  }
  private seedOfficialOpen(career:any,c:any,config:any){
    const sources=this.db.prepare("SELECT c.id FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.careerId=? AND cc.stage IN ('REGIONAL','MAJOR') AND c.status='completed'").all(career.id).map(r=>r.id);
    const ranks=new CircuitQualification(this.db,id=>this.ranking(id)).scores(career.id,sources,c.cycle<=3?1:2);
    const teams=this.db.prepare('SELECT ce.teamId,AVG(p.overall) AS strength FROM competition_entries ce LEFT JOIN players p ON p.teamId=ce.teamId WHERE ce.competitionId=? GROUP BY ce.teamId').all(c.id);
    teams.sort((a,b)=>{
      const x=ranks.find(r=>r.teamId===a.teamId),y=ranks.find(r=>r.teamId===b.teamId);
      return (c.cycle===1?0:c.cycle===4?(y?.seasonPoints||0)-(x?.seasonPoints||0):(y?.points||0)-(x?.points||0))||
        (y?.seasonPoints||0)-(x?.seasonPoints||0)||(y?.awards.slice().sort((a,b)=>b-a)[0]||0)-(x?.awards.slice().sort((a,b)=>b-a)[0]||0)||b.strength-a.strength||a.teamId.localeCompare(b.teamId);
    });
    teams.forEach((t,i)=>this.db.prepare('UPDATE competition_entries SET seed=? WHERE competitionId=? AND teamId=?').run(i+1,c.id,t.teamId));
    for(const t of teams)new CareerHonours(this.db).register(career.id,c.id,t.teamId,this.roster(career.id,t.teamId),career.currentDate);
    const state=this.db.prepare('SELECT config FROM tournament_state WHERE competitionId=?').get(c.id),saved=parse(state.config);
    this.db.prepare('UPDATE tournament_state SET config=? WHERE competitionId=?').run(JSON.stringify({...saved,entrants:teams.map(t=>t.teamId),seedingDataNote:'Career points seed later Opens. Historical starter placements and ranked MMR are not complete for every player; squad OVR breaks remaining initial-seed ties.'}),c.id);
  }
  private awardOfficialPrizes(career:any,c:any,date:string){
    const state=this.db.prepare('SELECT championId FROM tournament_state WHERE competitionId=?').get(c.id),honours=new CareerHonours(this.db);
    const awarded=honours.award(career.id,c,state?.championId,date);
    new TrophyCeremonies(this.db).record(career.id,c,state?.championId,date);
    if(state?.championId===career.teamId&&awarded.length){const title=honours.list(career.id,awarded[0]).find(a=>a.competitionId===c.id);this.message(career.id,date,'general','Championship honours earned',title?.title?`Your registered players earned ${title.title}. This career title is now equipped for their next match.`:'The championship has been added to your registered players’ career honours. This event has no official in-game champion title.','/team');}
    if(isPath(career)){new PathToGlory(this.db).competitionWon(career.id,c,state?.championId,date);return;}
    const key='prizes_paid:'+c.id;if(this.db.prepare('SELECT value FROM settings WHERE key=?').get(key))return;
    const rows=this.ranking(c.id);
    if(c.stage==='REGIONAL')for(const id of parse(this.db.prepare('SELECT sources FROM career_competitions WHERE competitionId=?').get(c.id)?.sources,[])){
      for(const r of this.ranking(id))if(!rows.some(s=>s.teamId===r.teamId)&&r.placement>=33)rows.push(r);
    }
    for(const r of rows){
      const prize=placementPrize(c.stage,c.region,c.cycle,r.placement);
      if(prize){payClubPrize(this.db,career.id,r.teamId,c.id,date,prize,c.name);
        if(r.teamId===career.teamId)this.message(career.id,date,'general',`${c.name}: prize money`,`Your finish (${r.placement}${r.placement===1?'st':r.placement===2?'nd':r.placement===3?'rd':'th'}) earned $${prize.toLocaleString()} under this event's prize table.`,'/finances');}
    }this.db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(key,'1');
  }
  private pointQualifiers(sources:string[],major=false){
    const totals=new Map<string,{points:number,last:number}>();
    for(const [index,id] of sources.entries())for(const [position,s] of this.ranking(id).entries()){
      const p=s.placement||position+1,points=p===1?15:p===2?10:p<=4?7:p<=6?5:p<=8?3:p<=12?2:1;
      const previous=totals.get(s.teamId)||{points:0,last:0};totals.set(s.teamId,{points:previous.points+points,last:index*100+(100-p)});
    }
    const quotas:Record<string,number>={'Europe':major?5:4,'North America':4,'South America':2,'MENA':2,'Oceania':major?1:2,'Asia-Pacific':1,'Sub-Saharan Africa':1};
    const ranked=[...totals].sort((a,b)=>b[1].points-a[1].points||b[1].last-a[1].last||a[0].localeCompare(b[0])).map(([id])=>id),selected:string[]=[];
    for(const [region,count] of Object.entries(quotas))selected.push(...ranked.filter(id=>this.db.prepare('SELECT region FROM teams WHERE id=?').get(id)?.region===region).slice(0,count));
    // Small databases can lack an entire region; use actual circuit entrants,
    // never invent a team or auto-qualify the manager's club.
    for(const id of ranked)if(selected.length<16&&!selected.includes(id))selected.push(id);
    return selected.slice(0,16).sort((a,b)=>ranked.indexOf(a)-ranked.indexOf(b));
  }
  assertFixture(careerId: string, fixtureId: string) {
    const career = this.career(careerId);
    const f = this.db.prepare('SELECT * FROM fixtures WHERE id = ?').get(fixtureId);
    const entry = f && this.db.prepare("SELECT ce.teamId FROM competition_entries ce JOIN career_competitions cc ON cc.competitionId = ce.competitionId WHERE ce.competitionId = ? AND ce.teamId = ? AND cc.careerId = ? AND COALESCE(cc.stage,'') <> 'ARCHIVED'").get(f.competitionId, career.teamId, careerId);
    canControlFixture(career, f, !!entry);
    const clubEvent=this.db.prepare('SELECT type FROM competitions WHERE id=?').get(f.competitionId)?.type?.startsWith('CLUB_');
    if(clubEvent){
      const registered=new ClubChampionship(this.db).registeredPlayers(f.competitionId,career.teamId).map(p=>p.id);
      if(this.roster(careerId,career.teamId).slice(0,3).some(p=>!registered.includes(p.id)))throw Error('This Club Championship stage has a locked roster. Select three of its registered players before launching.');
    }
    if(f.status!=='in_progress'&&!this.db.prepare('SELECT id FROM game_results WHERE fixtureId=? LIMIT 1').get(fixtureId)&&new FlagshipFormatRepair(this.db,id=>this.ranking(id)).preview(careerId,f.competitionId).required)throw Error('Open this competition and repair its group draw before starting another series on the old league schedule.');
    if (this.db.prepare('SELECT COUNT(*) AS count FROM players WHERE teamId = ?').get(career.teamId).count < 3) throw new Error('Your club needs three real players before a series can start. Complete your roster during a transfer window.');
    const ready = this.db.transaction(() => ensurePlayableRoster(this.db, f.homeTeamId === career.teamId ? f.awayTeamId : f.homeTeamId, career.currentDate))();
    if (!ready) throw new Error('The opponent has no complete real roster. Reload the career to update withdrawn entries before playing.');
    return f;
  }
  simulation(careerId:string,fixtureId:string){
    const c=this.career(careerId),f=this.assertFixture(careerId,fixtureId);
    if(isPath(c))throw Error('Path To Glory requires played games.');
    new SeriesTimeouts(this.db).assertCanLaunch(careerId,fixtureId);
    const opponent=f.homeTeamId===c.teamId?f.awayTeamId:f.homeTeamId;
    const clubEvent=this.db.prepare('SELECT type FROM competitions WHERE id=?').get(f.competitionId)?.type?.startsWith('CLUB_');
    const side=(id:string)=>({...this.db.prepare('SELECT * FROM teams WHERE id=?').get(id),players:(clubEvent?this.orderRoster(careerId,id,new ClubChampionship(this.db).registeredPlayers(f.competitionId,id)):this.roster(careerId,id)).slice(0,3).map(p=>({...p,traits:this.db.prepare('SELECT * FROM player_traits WHERE playerId=?').get(p.id)||{}}))});
    return {success:true,...simulateGame(side(c.teamId),side(opponent),this.tactics(careerId),new SeriesTimeouts(this.db).opponentPlan(careerId,fixtureId))};
  }
  recordGame(careerId: string, result: any) {
    return this.db.transaction(() => {
      new SeriesTimeouts(this.db).assertCanLaunch(careerId,result.fixtureId);
      const career = this.career(careerId), fixture = this.assertFixture(careerId, result.fixtureId);
      if(isPath(career)&&!result.wasPlayed)throw Error('Path To Glory progression requires played games. Simulation is unavailable.');
      const opponent = fixture.homeTeamId === career.teamId ? fixture.awayTeamId : fixture.homeTeamId;
      if (result.blueTeamId !== career.teamId || result.orangeTeamId !== opponent) throw new Error('The game roster does not match your team and opponent.');
      if (![result.blueScore, result.orangeScore].every(n => Number.isInteger(n) && n >= 0) || result.blueScore === result.orangeScore) throw new Error('Enter a valid completed Rocket League game score.');
      const games = this.db.prepare('SELECT * FROM game_results WHERE fixtureId = ? ORDER BY gameNumber').all(fixture.id);
      const required = Math.floor(Number(String(fixture.seriesFormat).match(/\d+/)?.[0] || 5) / 2) + 1;
      if (games.filter(g => g.blueScore > g.orangeScore).length >= required || games.filter(g => g.orangeScore > g.blueScore).length >= required) throw new Error('This series already has a winner.');
      if (result.gameNumber !== games.length + 1) throw new Error('Games must be recorded in order; this game may already be saved.');
      const stats = result.playerStats ?? [];
      for(const teamId of [fixture.homeTeamId,fixture.awayTeamId])new CareerHonours(this.db).register(careerId,fixture.competitionId,teamId,this.roster(careerId,teamId),career.currentDate);
      if (result.gameNumber === 1) new PlayerInteractions(this.db).captureStarters(careerId, fixture.id);
      const clubEvent=this.db.prepare('SELECT type FROM competitions WHERE id=?').get(fixture.competitionId)?.type?.startsWith('CLUB_');
      const allowed = clubEvent?[career.teamId,opponent].flatMap(team=>new ClubChampionship(this.db).registeredPlayers(fixture.competitionId,team).map(p=>p.id)):this.db.prepare('SELECT id FROM players WHERE teamId IN (?, ?)').all(career.teamId, opponent).map(p => p.id);
      if (!Array.isArray(stats) || new Set(stats.map(s => s.playerId)).size !== stats.length || stats.some(s => !allowed.includes(s.playerId) || ['goals', 'assists', 'saves', 'shots', 'demos', 'score'].some(k => !Number.isInteger(s[k]) || s[k] < 0))) throw new Error('Player statistics must contain valid, unique members of the two match rosters.');
      const id = uuid();
      this.db.prepare('INSERT INTO game_results (id, fixtureId, gameNumber, blueTeamId, orangeTeamId, blueScore, orangeScore, wasPlayed, playedByHuman) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, fixture.id, result.gameNumber, career.teamId, opponent, result.blueScore, result.orangeScore, result.wasPlayed ? 1 : 0, result.playedByHuman ? 1 : 0);
      for (const s of stats) this.db.prepare('INSERT INTO game_player_stats (id, gameResultId, playerId, goals, assists, saves, shots, demos, score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(uuid(), id, s.playerId, s.goals, s.assists, s.saves, s.shots, s.demos, s.score);
      if(result.wasPlayed && Array.isArray(result.incidents))result.incidents.slice(0,256).forEach((e:any,i:number)=>{
        if(!allowed.includes(e.playerId)||![career.teamId,opponent].includes(e.teamId)||!['goal','save','critical_demo','open_net_miss'].includes(e.type))return;
        this.db.prepare('INSERT INTO game_incidents VALUES (?,?,?,?,?,?,?,?,?)').run(id,i,e.playerId,e.teamId,e.type,e.remaining,e.overtime?1:0,e.critical?1:0,JSON.stringify(e.evidence||{}));
      });
      new EarnedDevelopment(this.db).recordGame(career,result,id,this.tactics(careerId));
      if(isPath(career))new PathToGlory(this.db).recordGame(careerId,result,id);
      return { success: true, id };
    })();
  }
  recordPlayedGame(careerId: string, result: any) {
    return this.db.transaction(() => {
      const career = this.career(careerId);
      const fixture = this.db.prepare('SELECT * FROM fixtures WHERE id=?').get(result.fixtureId);
      const belongs = fixture && this.db.prepare('SELECT competitionId FROM career_competitions WHERE competitionId=? AND careerId=?').get(fixture.competitionId, careerId);
      if (!belongs || ![fixture.homeTeamId, fixture.awayTeamId].includes(career.teamId)) throw new Error('This played game does not belong to your career.');
      const existing = this.db.prepare('SELECT * FROM game_results WHERE fixtureId=? AND gameNumber=?').get(result.fixtureId, result.gameNumber);
      if (existing && (!existing.wasPlayed || existing.blueTeamId !== result.blueTeamId || existing.orangeTeamId !== result.orangeTeamId || existing.blueScore !== result.blueScore || existing.orangeScore !== result.orangeScore))
        throw new Error('A different result is already saved for this game. The played score has been kept for recovery.');
      const saved = existing ? { success: true, id: existing.id } : this.recordGame(careerId, { ...result, wasPlayed: true, playedByHuman: true });
      const games = this.db.prepare('SELECT blueScore,orangeScore FROM game_results WHERE fixtureId=?').all(fixture.id);
      const blue = games.filter(g => g.blueScore > g.orangeScore).length;
      const orange = games.length - blue;
      const required = Math.floor(Number(String(fixture.seriesFormat).match(/\d+/)?.[0] || 5) / 2) + 1;
      const complete = Math.max(blue, orange) >= required;
      const swap = fixture.awayTeamId === career.teamId;
      const wasComplete = fixture.status === 'completed';
      this.db.prepare('UPDATE fixtures SET homeScore=?,awayScore=?,status=? WHERE id=?')
        .run(swap ? orange : blue, swap ? blue : orange, complete ? 'completed' : 'in_progress', fixture.id);
      if (complete && !wasComplete) {
        this.resultStory(careerId, this.db.prepare('SELECT * FROM fixtures WHERE id=?').get(fixture.id));
        this.progressCircuit(careerId, career.currentDate);
      }
      return { ...saved, seriesComplete: complete };
    })();
  }
  dueFixture(careerId: string, date: string) {
    const career = this.career(careerId);
    const club=this.db.prepare("SELECT f.* FROM fixtures f JOIN career_competitions cc ON cc.competitionId = f.competitionId WHERE cc.careerId = ? AND cc.stage<>'ARCHIVED' AND (f.homeTeamId = ? OR f.awayTeamId = ?) AND f.scheduledDate <= ? AND f.status IN ('scheduled', 'in_progress') ORDER BY f.scheduledDate LIMIT 1").get(careerId, career.teamId, career.teamId, date);
    const national=new FifaWorldCup(this.db).due(careerId,date);
    return !club?national:!national?club:club.scheduledDate<=national.scheduledDate?club:national;
  }
  advance(careerId: string, target: string) {
    return this.db.transaction(() => {
      this.ensureCircuit(careerId);
      const career = this.career(careerId), oldDate = career.currentDate;
      let date = oldDate;
      new ClubChampionship(this.db).progress(careerId,date);
      new FifaWorldCup(this.db).progress(careerId,date);
      const alreadyDue = this.dueFixture(careerId, date);
      if (alreadyDue) return { success: true, newDate: date, blockedFixtureId: alreadyDue.id };
      this.resolveDueMatches(careerId,date);
      const pairing=this.dueFixture(careerId,date);if(pairing)return {success:true,newDate:date,blockedFixtureId:pairing.id};
      for (let i = 0; date < target && i < 366; i++) {
        date = addDays(date, 1);
        this.db.prepare('UPDATE careers SET currentDate = ?, updatedAt = ? WHERE id = ?').run(date, new Date().toISOString(), careerId);
        this.processDay(careerId, date);
        if(this.db.prepare('SELECT status FROM manager_employment WHERE careerId=?').get(careerId)?.status==='dismissed')return {success:true,newDate:date,careerEnded:true,reason:this.db.prepare('SELECT reason FROM manager_employment WHERE careerId=?').get(careerId).reason};
        if (this.dueFixture(careerId, date)) break;
      }
      return { success: true, newDate: date, blockedFixtureId: this.dueFixture(careerId, date)?.id,
        events: this.db.prepare('SELECT * FROM calendar_events WHERE careerId = ? AND date = ?').all(careerId, date) };
    })();
  }
  private resolveDueMatches(careerId:string,date:string){
    const career=this.career(careerId);
    // Multiple bracket rounds share an official event day. Resolve NPC waves
    // until the manager's next pairing is known, without advancing the date or
    // touching a scheduled/in-progress match involving the manager's team.
    for(let wave=0;wave<40;wave++){
      this.progressCircuit(careerId,date);
      const fixtures=this.db.prepare("SELECT f.* FROM fixtures f JOIN career_competitions cc ON cc.competitionId=f.competitionId WHERE cc.careerId=? AND cc.stage<>'ARCHIVED' AND f.scheduledDate<=? AND f.status='scheduled' AND f.homeTeamId<>? AND f.awayTeamId<>?").all(careerId,date,career.teamId,career.teamId);
      if(!fixtures.length)break;
      for(const f of fixtures){
        const side=(id:string)=>{ensurePlayableRoster(this.db,id,date);return {...this.db.prepare('SELECT * FROM teams WHERE id=?').get(id),players:this.db.prepare('SELECT p.*,pt.confidence FROM players p LEFT JOIN player_traits pt ON pt.playerId=p.id WHERE p.teamId=? ORDER BY p.overall DESC LIMIT 3').all(id)};};
        const a=side(f.homeTeamId),b=side(f.awayTeamId);
        if(f.competitionId&&this.db.prepare('SELECT type FROM competitions WHERE id=?').get(f.competitionId)?.type?.startsWith('CLUB_'))for(const team of [a,b])team.players=new ClubChampionship(this.db).registeredPlayers(f.competitionId,team.id).slice(0,3);
        for(const side of [a,b])new CareerHonours(this.db).register(careerId,f.competitionId,side.id,side.players,date);
        if(a.players.length<3||b.players.length<3){const required=Math.floor(Number(f.seriesFormat.slice(2))/2)+1;this.db.prepare("UPDATE fixtures SET status='completed',homeScore=?,awayScore=? WHERE id=?").run(a.players.length>=3?required:0,b.players.length>=3?required:0,f.id);continue;}
        const result=simulateSeries(a,b,f.seriesFormat,{home:{},away:{}});
        result.games.forEach((g,index)=>{
          const gameId=uuid();this.db.prepare('INSERT INTO game_results(id,fixtureId,gameNumber,blueTeamId,orangeTeamId,blueScore,orangeScore,wasPlayed,playedByHuman) VALUES (?,?,?,?,?,?,?,0,0)').run(gameId,f.id,index+1,g.blueTeamId,g.orangeTeamId,g.blueScore,g.orangeScore);
          for(const [playerId,s] of Object.entries(g.stats))this.db.prepare('INSERT INTO game_player_stats(id,gameResultId,playerId,goals,assists,saves,shots,demos,score) VALUES (?,?,?,?,?,?,?,?,?)').run(uuid(),gameId,playerId,s.goals,s.assists,s.saves,s.shots,s.demos,s.score);
        });
        this.db.prepare("UPDATE fixtures SET status='completed',homeScore=?,awayScore=? WHERE id=?").run(result.homeWins,result.awayWins,f.id);
      }
    }
    this.progressCircuit(careerId,date);
  }
  private processDay(careerId: string, date: string) {
    const career = {...this.career(careerId),currentDate:date};
    this.trainDay(career, date);
    if(isPath(career)){this.db.prepare('UPDATE players SET fatigue=MAX(0,fatigue-8) WHERE teamId=?').run(career.teamId);this.resolveDueMatches(careerId,date);new PathToGlory(this.db).ensureFixture(careerId);return;}
    new PlayerInteractions(this.db).tick(careerId);
    this.db.prepare('UPDATE players SET fatigue = MAX(0, fatigue - 5) WHERE teamId != ?').run(career.teamId);
    const before = careerWindow(this.db,careerId,addDays(date, -1)), now = careerWindow(this.db,careerId,date);
    if (before.open !== now.open) this.message(careerId, date, 'general', now.open ? 'Transfer window open' : 'Transfer window closed', now.label, '/transfers');
    for (const task of this.db.prepare("SELECT * FROM scout_assignments WHERE careerId = ? AND status = 'pending' AND dueDate <= ?").all(careerId, date)) {
      this.db.prepare("UPDATE scout_assignments SET status = 'completed' WHERE id = ?").run(task.id);
      new RecruitmentNetwork(this.db).observe(career,task.playerId,task.depth,date);
      const p = this.db.prepare('SELECT gamertag FROM players WHERE id = ?').get(task.playerId);
      this.message(careerId, date, 'scout_report', `Scout report: ${p.gamertag}`, 'Your report is ready. Return for a deeper assignment to narrow the estimated rating and potential.', '/scouting');
    }
    for (const contract of this.db.prepare('SELECT c.*, p.gamertag FROM contracts c JOIN players p ON p.id = c.playerId WHERE c.isActive = 1 AND c.endDate <= ?').all(date)) {
      this.db.prepare('UPDATE contracts SET isActive = 0 WHERE id = ?').run(contract.id);
      this.db.prepare('UPDATE players SET teamId = NULL WHERE id = ? AND teamId = ?').run(contract.playerId, contract.teamId);
      this.db.prepare("UPDATE player_affiliations SET status = 'career', note = 'Contract expired in this simulated career.' WHERE playerId = ?").run(contract.playerId);
      if (contract.teamId === career.teamId) this.message(careerId, date, 'general', `${contract.gamertag}: contract expired`, 'The player is now a free agent. Signings and renewals are available during transfer windows.', '/transfers');
    }
    new OutgoingTransfers(this.db).tick(careerId);
    new TransferMarket(this.db).tick(careerId);
    this.resolveDueMatches(careerId,date);
    new Chirp(this.db).tick(careerId);
    ensureTalentPool(this.db,career);
    new RecruitmentNetwork(this.db).tick(career);
    new ClubEconomy(this.db).tick(career);
  }

  training(careerId: string) {
    const career = this.career(careerId);
    return { schedule: parse(this.db.prepare('SELECT schedule FROM career_training WHERE careerId = ?').get(careerId)?.schedule, DEFAULT_TRAINING),
      logs: this.db.prepare('SELECT * FROM development_logs WHERE careerId = ? ORDER BY date DESC, rowid DESC LIMIT 15').all(careerId), teamId: career.teamId,
      earned: new EarnedDevelopment(this.db).enabled(career)?new EarnedDevelopment(this.db).overview(career):null };
  }
  saveTraining(careerId: string, schedule: any[]) {
    this.career(careerId);
    if (!Array.isArray(schedule) || schedule.length !== 7 || schedule.some((s, i) => s.day !== i || !TRAINING_CATEGORIES.includes(s.category) || !['Low', 'Normal', 'High'].includes(s.intensity))) throw new Error('Choose a valid focus and intensity for all seven days.');
    this.db.prepare('INSERT OR REPLACE INTO career_training (careerId, schedule) VALUES (?, ?)').run(careerId, JSON.stringify(schedule));
    return { success: true };
  }
  allocateSkill(careerId:string,playerId:string,skill:string){
    const c=this.career(careerId),result=new EarnedDevelopment(this.db).allocate(c,playerId,skill);if(isPath(c))new PathToGlory(this.db).review(careerId);return result;
  }
  private trainDay(career: any, date: string) {
    const schedule = this.training(career.id).schedule;
    const day = (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7, session = schedule[day];
    const team = this.db.prepare('SELECT * FROM teams WHERE id = ?').get(career.teamId);
    team.coachRating=Math.min(100,(team.coachRating||50)+staffDepartment(this.db,career,'Coaching').level*4);
    for (const p of this.db.prepare('SELECT p.*, pt.developmentRate, pt.professionalism FROM players p LEFT JOIN player_traits pt ON p.id = pt.playerId WHERE p.teamId = ?').all(career.teamId)) {
      const rest = session.category === 'Rest';
      const intensity = session.intensity === 'High' ? 1.5 : session.intensity === 'Low' ? .5 : 1;
      const fatigue = Math.max(0, Math.min(100, p.fatigue + (rest ? -20-staffDepartment(this.db,career,'Player care').level*1.5 : intensity === 1.5 ? 10 : intensity === .5 ? -2 : 3)));
      this.db.prepare('UPDATE players SET fatigue = ?, morale = MIN(100, morale + ?) WHERE id = ?').run(fatigue, rest ? 1 : 0, p.id);
      if(session.category==='Team Play'&&fatigue<=70)this.db.prepare('UPDATE players SET chemistry=MIN(100,COALESCE(chemistry,50)+?) WHERE id=?').run(.3*intensity,p.id);
      const earned=new EarnedDevelopment(this.db);
      if(earned.enabled(career)){
        if(!rest){
          const growth=earned.train(career,{...p,fatigue},date,intensity,team);
          if(!isPath(career))for(const attribute of TRAINING_ATTRIBUTES[session.category])this.db.prepare(`UPDATE player_attributes SET ${attribute}=MAX(${attribute},MIN(?,${attribute}+?)) WHERE playerId=?`).run(Math.min(100,p.potential+3),growth,p.id);
          if(session.category==='Mental / Pressure'&&fatigue<=70)this.db.prepare('UPDATE player_traits SET confidence=MIN(75,COALESCE(confidence,50)+1) WHERE playerId=? AND confidence<75').run(p.id);
        }
        continue;
      }
      if (rest || p.overall >= p.potential || p.fatigue > 70) continue;
      const growth = .045 * intensity * (p.age == null ? 1 : p.age <= 21 ? 1.3 : .8) * (.5 + (p.developmentRate || 50) / 100)
        * (.8+(p.professionalism??50)/250) * (.7 + (team.coachRating || 50) / 200) * (1 + (team.facilityLevel || 1) * .05);
      const progress = this.db.prepare('SELECT progress FROM player_development WHERE careerId = ? AND playerId = ?').get(career.id, p.id)?.progress || 0;
      const total = progress + growth;
      const gain = Math.min(Math.floor(total), p.potential - p.overall);
      this.db.prepare('INSERT OR REPLACE INTO player_development (careerId, playerId, progress) VALUES (?, ?, ?)').run(career.id, p.id, total - gain);
      for (const attribute of TRAINING_ATTRIBUTES[session.category]) this.db.prepare(`UPDATE player_attributes SET ${attribute} = MIN(100, ${attribute} + ?) WHERE playerId = ?`).run(growth, p.id);
      if (gain) {
        this.db.prepare('UPDATE players SET overall = overall + ? WHERE id = ?').run(gain, p.id);
        const body = `${p.gamertag} gained ${gain} overall through ${session.category.toLowerCase()} training. New rating: ${p.overall + gain}.`;
        this.db.prepare('INSERT INTO development_logs (id, careerId, playerId, date, body) VALUES (?, ?, ?, ?, ?)').run(uuid(), career.id, p.id, date, body);
        this.message(career.id, date, 'general', `${p.gamertag}: development update`, body, '/training');
      }
    }
    if(session.category==='Team Play'){
      const squad=this.db.prepare('SELECT AVG(chemistry) chemistry,AVG(fatigue) fatigue FROM players WHERE teamId=?').get(career.teamId);
      if(squad.chemistry!=null&&squad.fatigue<=70)this.db.prepare('UPDATE teams SET teamChemistry=MIN(100,COALESCE(teamChemistry,50)+?) WHERE id=?').run(.4*(session.intensity==='High'?1.5:session.intensity==='Low'?.5:1),career.teamId);
    }
    this.db.prepare('UPDATE player_traits SET confidence = MIN(100, confidence + 1) WHERE playerId IN (SELECT id FROM players WHERE teamId = ?) AND confidence < 50').run(career.teamId);
  }
  scouting(careerId: string) {
    if(isPath(this.career(careerId)))throw Error('Scouting is unavailable in Path To Glory.');
    this.career(careerId);
    return this.db.prepare('SELECT s.*, p.gamertag, p.region, p.preferredTendency, p.overall, p.potential FROM scout_assignments s JOIN players p ON p.id = s.playerId WHERE s.careerId = ? ORDER BY s.dueDate DESC, s.rowid DESC').all(careerId).map(s => {
      const p=this.db.prepare('SELECT * FROM players WHERE id=?').get(s.playerId);
      const view=new RecruitmentNetwork(this.db).visible(this.career(careerId),p);
      return {...s,overall:undefined,potential:undefined,preferredTendency:view.preferredTendency,knowledge:view.scoutKnowledge,attributes:view.attributes,form:view.form,observedDate:view.lastScouted,
        estOvr:s.status==='pending'?'—':view.estimatedOverall,estPot:s.status==='pending'?'—':view.estimatedPotential,
        note:s.status==='pending'?`Scouting in progress. Report due ${s.dueDate}.`:'Reports narrow estimates through sustained observation. Potential remains an assessment, not a guaranteed ceiling.'};
    });
  }
  dispatchScout(careerId: string, target: string) {
    if(isPath(this.career(careerId)))throw Error('Scouting is unavailable in Path To Glory.');
    return this.db.transaction(() => {
      const career = this.career(careerId);
      const player = this.db.prepare('SELECT * FROM players WHERE id = ? OR LOWER(gamertag) = LOWER(?)').get(target, target.trim());
      if (!player||!knownProspect(this.db,career,player.id)) throw new Error('Player not found. Discover unsigned prospects through regional scouting first.');
      if (player.teamId === career.teamId) throw new Error('Your own squad is already fully known.');
      if (this.db.prepare("SELECT id FROM scout_assignments WHERE careerId = ? AND playerId = ? AND status = 'pending'").get(careerId, player.id)) throw new Error('A scout is already observing this player.');
      const occupied=new RecruitmentNetwork(this.db).occupied(careerId);
      if(occupied>=3)throw Error('All three scout slots are occupied.');
      const depth = new RecruitmentNetwork(this.db).depth(careerId,player.id);
      if (depth >= 3) throw new Error('This player is already fully scouted.');
      const team = this.db.prepare('SELECT cashBalance FROM teams WHERE id = ?').get(career.teamId);
      if (team.cashBalance < 5000) throw new Error('Scouting requires $5,000 of club funds.');
      this.db.prepare('UPDATE teams SET cashBalance = cashBalance - 5000 WHERE id = ?').run(career.teamId);
      this.db.prepare('INSERT INTO scout_assignments (id, careerId, playerId, startedDate, dueDate, depth, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(uuid(), careerId, player.id, career.currentDate, addDays(career.currentDate, 28 + depth * 14), depth + 1, 'pending');
      return { success: true, dueDate: addDays(career.currentDate, 28 + depth * 14) };
    })();
  }
  signingQuote(careerId: string, playerId: string) {
    if(isPath(this.career(careerId)))throw Error('Transfers are unavailable in Path To Glory.');
    const career = this.career(careerId);
    if(!knownProspect(this.db,career,playerId))throw Error('Your scouts have not discovered this player.');
    const p = this.db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
    if (!p) throw new Error('Player not found.');
    const affiliation = this.db.prepare('SELECT status FROM player_affiliations WHERE playerId = ?').get(playerId)?.status;
    const active = this.db.prepare('SELECT * FROM contracts WHERE playerId = ? AND isActive = 1').get(playerId);
    const renewal = p.teamId === career.teamId;
    let fee = !renewal && p.teamId ? Math.max(active?.buyout || 0,p.marketValue || 0) : 0;
    const option=this.db.prepare('SELECT buybackFee FROM deal_clauses WHERE careerId=? AND playerId=? AND sellerId=? AND buyerId=? AND settled=0 AND buybackFee>0 AND buybackUntil>=? ORDER BY rowid DESC LIMIT 1').get(careerId,playerId,career.teamId,p.teamId,career.currentDate);
    if(option&&!renewal)fee=Math.min(fee,option.buybackFee);
    const club=clubFeeQuote(this.db,career,playerId),agreement=club?.talk?.status==='agreed'?club.talk:null;
    if(agreement)fee=agreement.terms.fee;
    const transferUpfront=agreement?paymentPlan(fee,agreement.terms.upfrontPercent,agreement.terms.months,career.currentDate).upfront:fee;
    const clubFunds = this.db.prepare('SELECT cashBalance FROM teams WHERE id = ?').get(career.teamId).cashBalance;
    const window = careerWindow(this.db,careerId,career.currentDate);
    const approach=this.db.prepare('SELECT * FROM agent_approaches WHERE careerId=? AND playerId=?').get(careerId,playerId);
    const needsApproach=!renewal&&(!approach||approach.expiresDate<career.currentDate);
    const interest=recruitmentInterest(this.db,careerId,career.teamId,p,career.currentDate,approach?.role||'Core Starter');
    const negotiation=negotiationState(this.db,career,playerId);
    const agent=playerRepresentative(this.db,career,playerId);
    const unavailableReason = !window.open ? window.label : !p.teamId && ['unverified', 'inactive'].includes(affiliation)
      ? 'This player is not a confirmed available free agent.' : clubFunds<transferUpfront?`Insufficient transfer funds. You need $${transferUpfront.toLocaleString()} for the club payment before approaching this player (short by $${(transferUpfront-clubFunds).toLocaleString()}).`:needsApproach?'Speak to the agent about the sporting project before negotiating.':!renewal&&!approach?.willing?JSON.parse(approach.reasons)[0]:interest.reasons[0]||'';
    const publicClub:any=club?Object.fromEntries(Object.entries(club).filter(([key])=>key!=='floor')):null;
    return { success: true, fee, transferUpfront,club:club?publicClub:null,clubFunds, renewal, demands:interest.demands,interest,agent,negotiation,unavailableReason:negotiation.blockedUntil?`Talks cannot reopen before ${negotiation.blockedUntil}.`:unavailableReason,needsApproach,approach:approach?{...approach,willing:!!approach.willing,reasons:JSON.parse(approach.reasons)}:null };
  }
  sign(careerId: string, playerId: string, offer: any) {
    return this.db.transaction(() => {
      const career = this.career(careerId);
      const quote = this.signingQuote(careerId, playerId);
      if (quote.unavailableReason) throw new Error(quote.unavailableReason);
      const p = this.db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
      if (!p) throw new Error('Player not found.');
      if (!offer || ![12, 24, 36, 48, 60].includes(offer.duration) || ['salary', 'bonus', 'buyout'].some(k => !Number.isSafeInteger(offer[k]) || offer[k] < 0 || offer[k] > 100000000) || offer.salary <= 0) throw new Error('Enter valid contract terms.');
      const role=offer.role||'Core Starter';
      if(!['Star Carry','Core Starter','Substitute'].includes(role))throw new Error('Choose a valid squad role.');
      const interest=recruitmentInterest(this.db,careerId,career.teamId,p,career.currentDate,role);
      if(!interest.willing)throw new Error(interest.reasons[0]);
      const agreed=this.db.prepare('SELECT role FROM agent_approaches WHERE careerId=? AND playerId=?').get(careerId,playerId);
      if(!quote.renewal&&agreed?.role!==role)throw Error('Speak to the agent again about this different playing role.');
      if(offer.duration<interest.minimumDuration)throw new Error(`The player requires at least ${interest.minimumDuration} months of contract security.`);
      if (contractOfferScore(offer, quote.demands) < .95) throw new Error('The agent has not accepted these terms.');
      const {renewal}=quote;
      let baseFee=quote.fee;
      const option=this.db.prepare('SELECT buybackFee FROM deal_clauses WHERE careerId=? AND playerId=? AND sellerId=? AND buyerId=? AND settled=0 AND buybackFee>0 AND buybackUntil>=? ORDER BY rowid DESC LIMIT 1').get(careerId,playerId,career.teamId,p.teamId,career.currentDate);
      if(option&&!renewal)baseFee=Math.min(baseFee,option.buybackFee);
      const agreement=agreedTransfer(this.db,career,playerId);
      if(offer.clubAgreement&&!agreement)throw Error('The club agreement has expired or the player changed clubs. Reopen club talks.');
      if(quote.club?.talk&&quote.club.talk.status!=='agreed')throw Error('Reach agreement with the selling club before signing.');
      const clauses=clauseTerms(offer,renewal?null:p.teamId,baseFee),fee=agreement?agreement.terms.fee:clauses.fee;
      if(agreement&&(clauses.profitPercent||clauses.buybackFee||clauses.contributionPercent))throw Error('This negotiated fee is fixed without selling-club clauses. Do not add new club terms during personal negotiations.');
      const plan=agreement?paymentPlan(fee,agreement.terms.upfrontPercent,agreement.terms.months,career.currentDate):paymentPlan(fee);
      if(plan.deferred&&p.teamId){
        const resale=this.db.prepare('SELECT * FROM deal_clauses WHERE careerId=? AND playerId=? AND buyerId=? AND settled=0').all(careerId,p.id,p.teamId).filter(d=>d.sellerId&&d.sellerId!==p.teamId).reduce((n,d)=>n+Math.round(Math.max(0,fee-d.baseFee)*d.profitPercent/100),0);
        const sellerCash=this.db.prepare('SELECT cashBalance FROM teams WHERE id=?').get(p.teamId)?.cashBalance||0;
        if(sellerCash+plan.upfront<resale)throw Error('The selling club needs more upfront cash to settle its existing sell-on obligations.');
      }
      if(clauses.contribution&&p.teamId){const seller=this.db.prepare('SELECT cashBalance FROM teams WHERE id=?').get(p.teamId);if((seller?.cashBalance||0)+plan.upfront<clauses.contribution*clauses.contributionMonths)throw Error('The selling club cannot fund the requested wage contribution.');}
      const accounts=new ClubEconomy(this.db).overview(career);
      const previousWage=renewal?(this.db.prepare('SELECT salary FROM contracts WHERE playerId=? AND isActive=1').get(playerId)?.salary||0):0;
      const wagePercent=accounts.vision?.status==='agreed'?accounts.vision.terms.wagePercent:125;
      if(accounts.wages-previousWage+offer.salary>accounts.wageLimit*wagePercent/100)throw Error(`The board blocks this deal: it exceeds your ${wagePercent}% wage ceiling.`);
      const team = this.db.prepare('SELECT * FROM teams WHERE id = ?').get(career.teamId);
      const cashNeeded=plan.upfront+offer.bonus+offer.salary;
      if (team.cashBalance < cashNeeded) throw new Error(`Insufficient club funds. This deal needs $${cashNeeded.toLocaleString()} upfront; your club has $${team.cashBalance.toLocaleString()} (short by $${(cashNeeded-team.cashBalance).toLocaleString()}).`);
      if(plan.deferred){
        const monthly=accounts.structure.netAfterStaff-offer.salary+previousWage;
        for(let month=1;month<=plan.months;month++){
          const due=calendarMonth(career.currentDate,month);
          const existing=accounts.obligations.rows.filter((r:any)=>!r.paidDate&&r.dueDate<=due).reduce((n:number,r:any)=>n+(r.buyerId===team.id?-r.amount:r.amount),0);
          const projected=team.cashBalance-cashNeeded+monthly*month+existing-plan.schedule.filter(r=>r.dueDate<=due).reduce((n,r)=>n+r.amount,0);
          if(projected<0)throw Error(`The board cannot fund the instalment plan: projected cash falls below zero by ${due}. Reduce the fee or wage bill.`);
        }
      }
      const end = new Date(career.currentDate + 'T12:00:00Z'); end.setUTCMonth(end.getUTCMonth() + offer.duration);
      this.db.prepare('UPDATE contracts SET isActive = 0 WHERE playerId = ?').run(playerId);
      const contractId=uuid();
      this.db.prepare('INSERT INTO contracts (id, playerId, teamId, salary, duration, startDate, endDate, signingBonus, buyout, isActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)')
        .run(contractId, playerId, team.id, offer.salary, offer.duration, career.currentDate, end.toISOString().slice(0, 10), offer.bonus, offer.buyout);
      this.db.prepare('INSERT INTO contract_payments VALUES(?,1)').run(contractId);
      this.db.prepare('UPDATE teams SET cashBalance = cashBalance - ? WHERE id = ?').run(cashNeeded, team.id);
      if (fee) this.db.prepare('UPDATE teams SET cashBalance = cashBalance + ? WHERE id = ?').run(plan.upfront, p.teamId);
      const transferId=uuid();
      for(const [i,payment] of plan.schedule.entries())this.db.prepare('INSERT INTO transfer_payments VALUES(?,?,?,?,?,?,?,?,NULL)').run(transferId+':'+i,careerId,transferId,p.id,team.id,p.teamId,payment.dueDate,payment.amount);
      if(fee)for(const [club,amount] of [[team.id,-plan.upfront],[p.teamId,plan.upfront]])this.db.prepare('INSERT INTO club_ledger VALUES(?,?,?,?,?,?,?)').run(uuid(),careerId,club,career.currentDate,'Transfer upfront',amount,`${p.gamertag}; total fee $${fee}; deferred $${plan.deferred}`);
      if(!renewal)settleSellOn(this.db,careerId,p.id,p.teamId,team.id,fee);
      const promised=offer.playingTime??(role==='Star Carry'?80:role==='Core Starter'?60:0);
      if((role==='Star Carry'&&promised<80)||(role==='Core Starter'&&promised<60))throw Error('The playing-time guarantee must support the agreed role.');
      this.db.prepare('INSERT INTO deal_clauses(contractId,careerId,playerId,buyerId,sellerId,baseFee,profitPercent,buybackFee,buybackUntil,contribution,contributionUntil,playingTime) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(contractId,careerId,p.id,team.id,renewal?null:p.teamId,fee,clauses.profitPercent,clauses.buybackFee,addDays(career.currentDate,730),clauses.contribution,addDays(career.currentDate,clauses.contributionMonths*30),promised);
      this.db.prepare('DELETE FROM agent_approaches WHERE careerId=? AND playerId=?').run(careerId,p.id);
      this.db.prepare('DELETE FROM negotiation_sessions WHERE careerId=? AND playerId=?').run(careerId,p.id);
      changeAgencyTrust(this.db,career,p.id,3);
      this.db.prepare('DELETE FROM club_fee_talks WHERE careerId=? AND playerId=?').run(careerId,p.id);
      if(!renewal){
        this.db.prepare('UPDATE teams SET teamChemistry=MAX(15,COALESCE(teamChemistry,50)-8) WHERE id=?').run(team.id);
        if(p.teamId)this.db.prepare('UPDATE teams SET teamChemistry=MAX(15,COALESCE(teamChemistry,50)-3) WHERE id=?').run(p.teamId);
        this.db.prepare('UPDATE players SET chemistry=45 WHERE id=?').run(p.id);
      }
      this.db.prepare('UPDATE players SET teamId = ?, morale = MIN(100, morale + 5) WHERE id = ?').run(team.id, p.id);
      this.db.prepare("UPDATE player_affiliations SET status = 'career', note = 'Signed in this simulated career.' WHERE playerId = ?").run(p.id);
      if (p.teamId && !renewal) ensurePlayableRoster(this.db, p.teamId, career.currentDate);
      this.db.prepare('INSERT INTO transfers (id, playerId, fromTeamId, toTeamId, fee, date, type,careerId) VALUES (?, ?, ?, ?, ?, ?, ?,?)').run(transferId, p.id, p.teamId || null, team.id, fee, career.currentDate, renewal ? 'renewal' : 'signing',careerId);
      this.message(careerId, career.currentDate, 'contract_signed', `${p.gamertag}: ${renewal ? 'contract renewed' : 'signing completed'}`, `${offer.duration}-month deal at $${offer.salary.toLocaleString()}/month. Signing bonus: $${offer.bonus.toLocaleString()}. Transfer fee: $${fee.toLocaleString()}.`, `/player/${p.id}`);
      this.post(careerId, p, 'positive', 'RosterWire', `${p.gamertag} ${renewal ? 'commits to' : 'joins'} ${team.name}. A fresh chapter for the roster.`);
      // A replacement signed on deadline day can release an already agreed sale.
      new OutgoingTransfers(this.db).tick(careerId);
      return { success: true, fee,upfront:plan.upfront,deferred:plan.deferred,schedule:plan.schedule };
    })();
  }
  post(careerId: string, p: any, sentiment: 'positive' | 'negative', author: string, body: string, fixtureId?: string) {
    const career = this.career(careerId), traits = this.db.prepare('SELECT * FROM player_traits WHERE playerId = ?').get(p.id) || {};
    const impact = socialImpact(sentiment, traits);
    this.db.prepare('INSERT INTO social_posts (id, careerId, playerId, fixtureId, date, author, body, sentiment, moraleChange, confidenceChange, responded) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)')
      .run(uuid(), careerId, p.id, fixtureId || null, career.currentDate, author, body, sentiment, impact.morale, impact.confidence);
    this.db.prepare('UPDATE players SET morale = MIN(100, MAX(0, morale + ?)) WHERE id = ?').run(impact.morale, p.id);
    this.db.prepare('UPDATE player_traits SET confidence = MIN(100, MAX(0, confidence + ?)) WHERE playerId = ?').run(impact.confidence, p.id);
  }
  resultStory(careerId: string, f: any) {
    if(isPath(this.career(careerId))){new PathToGlory(this.db).finishSeries(careerId,f);return;}
    new EarnedDevelopment(this.db).series(this.career(careerId),f,this.tactics(careerId));
    new PlayerInteractions(this.db).reviewSeries(careerId, f);
    if (this.db.prepare('SELECT id FROM social_posts WHERE careerId = ? AND fixtureId = ? LIMIT 1').get(careerId, f.id)) return;
    const career = this.career(careerId), won = (f.homeTeamId === career.teamId ? f.homeScore > f.awayScore : f.awayScore > f.homeScore);
    const opponent = this.db.prepare('SELECT name FROM teams WHERE id = ?').get(f.homeTeamId === career.teamId ? f.awayTeamId : f.homeTeamId)?.name;
    const players = this.db.prepare('SELECT p.*, COALESCE((SELECT SUM(gps.score) FROM game_player_stats gps JOIN game_results gr ON gr.id = gps.gameResultId WHERE gps.playerId = p.id AND gr.fixtureId = ?), 0) AS matchScore FROM players p WHERE p.teamId = ? ORDER BY matchScore DESC').all(f.id, career.teamId);
    const p = players[won ? 0 : players.length - 1] || this.db.prepare('SELECT * FROM players WHERE teamId = ? ORDER BY overall DESC LIMIT 1').get(career.teamId);
    if (p) this.post(careerId, p, won ? 'positive' : 'negative', won ? 'RL Highlights' : 'The Rotation', won
      ? `${p.gamertag} and the squad take the series against ${opponent}. Confidence is building ahead of the next round.`
      : `Tough series against ${opponent}. ${p.gamertag} will be feeling the pressure, but one result does not define a season.`, f.id);
    this.db.prepare('UPDATE teams SET teamForm = MIN(100, MAX(0, teamForm + ?)) WHERE id = ?').run(won ? 4 : -4, career.teamId);
    const ours = f.homeTeamId === career.teamId ? f.homeScore : f.awayScore, theirs = f.homeTeamId === career.teamId ? f.awayScore : f.homeScore;
    this.message(careerId, career.currentDate, 'general', won ? 'Series won' : 'Series review', `${ours}–${theirs} against ${opponent}. Fans and analysts are discussing the result on Chirp; check the squad’s confidence before the next series.`, '/social');
  }
  respond(careerId: string, postId: string) {
    return this.db.transaction(() => {
      const career = this.career(careerId);
      const p = this.db.prepare('SELECT sp.* FROM social_posts sp JOIN players p ON p.id = sp.playerId WHERE sp.id = ? AND sp.careerId = ? AND p.teamId = ?').get(postId, careerId, career.teamId);
      if (!p || p.responded) throw new Error('This post is unavailable or has already been addressed.');
      this.db.prepare('UPDATE social_posts SET responded = 1 WHERE id = ?').run(postId);
      this.db.prepare('UPDATE players SET morale = MIN(100, morale + 2) WHERE id = ?').run(p.playerId);
      this.db.prepare('UPDATE player_traits SET confidence = MIN(100, confidence + 2) WHERE playerId = ?').run(p.playerId);
      this.message(careerId, career.currentDate, 'general', 'Player support', 'Your private reassurance helped the player reset and focus on the next series.', `/player/${p.playerId}`);
      return { success: true };
    })();
  }
}
