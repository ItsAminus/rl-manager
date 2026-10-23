import type {AppDatabase} from './database';
import {v4 as uuid} from 'uuid';
import {addDays} from '../game/career-rules';
import {CLUB_RULEBOOK,CLUB_RULES_VERSION,CLUB_REGIONS,CLUB_CAPACITY,CLUB_FINALE_SLOTS,CLUB_KICKOFF_REGIONS,clubOpenSchedule,clubProfile,clubPoints,clubPlayerPrize,clubOwnerPrize} from '../game/club-championship-rules';
import {Tournament} from './tournament';
import {CareerHonours} from './career-honours';
import {TrophyCeremonies} from './trophy-ceremonies';
import {careerMode,isPath} from '../game/career-mode';
const parse=(s:string)=>JSON.parse(s||'{}');
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const maxDate=(...dates:string[])=>dates.sort().pop()!;
export type ClubSetup={invitedTeamIds:string[];kickoffStart:string;leagueOpenStart:string;leagueStart:string;finaleStart:string;kickoffLaterFormat:'BO5'|'BO7';acceptCareerAdministration:boolean};

/** Official competition mechanics, with unannounced organiser inputs kept explicit. */
export class ClubChampionship {
  private candidateCache:any[]|null=null;
  constructor(private db:AppDatabase){}
  ensure(career:any){
    if(this.db.prepare("SELECT c.id FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.careerId=? AND c.type='CLUB_CHAMPIONSHIP'").get(career.id))return;
    const id=uuid(),season=this.db.prepare('SELECT id FROM seasons WHERE careerId=? AND isActive=1').get(career.id);
    const config={clubRules:true,edition:2027,source:CLUB_RULEBOOK,sourceVersion:'Club Championship · '+CLUB_RULES_VERSION,phase:'setup',totalAnnouncedPrizePool:2500000,
      qualificationRule:'Four regional Kick-Off Opens → 24-team double-elimination Kick-Off → seven Club Leagues with 64 teams → 16-team Swiss and hybrid Club Finale. Invited clubs also contest a separate Club Points leaderboard.',
      pendingOfficialDetails:'The 16 October rulebook leaves the final invited-team list, regional slot order, League Open dates, League dates, Finale dates and transfer window dates unconfirmed. It specifies BO5 for Kick-Off upper rounds 1–2 but does not specify every later match length. These are not fabricated as official facts.',
      seedingNote:'Published seeding uses RLCS 2026 starter points, placements, region-slot history and ranked 3v3 MMR. Complete verified inputs are unavailable in this database. Career setup uses explicitly accepted organiser seeds; reputation is only a suggested career order, not official seeding.'};
    this.db.prepare("INSERT INTO competitions(id,name,region,type,format,prizePool,seasonId,status,config) VALUES (?,?,?,?,?,?,?,?,?)").run(id,'RLCS 2027 Club Championship','GLOBAL','CLUB_CHAMPIONSHIP','five_stage_circuit',2500000,season?.id||null,'awaiting_details',JSON.stringify(config));
    this.db.prepare('INSERT INTO career_competitions VALUES (?,?,?,?,?,?)').run(id,career.id,'CLUB_CHAMPIONSHIP',10,'2026-11-05','[]');
  }
  private candidates(){return this.candidateCache||(this.candidateCache=this.db.prepare(`SELECT t.id,t.name,t.region,t.reputation FROM teams t LEFT JOIN team_roster_sources rs ON rs.teamId=t.id
    WHERE t.region IN (${CLUB_REGIONS.map(()=>'?').join(',')}) AND COALESCE(rs.status,'') NOT IN ('inactive','incomplete','disbanded')
    AND NOT EXISTS(SELECT 1 FROM generated_entities g WHERE g.id=t.id)
    AND (SELECT COUNT(*) FROM players p WHERE p.teamId=t.id)>=3 ORDER BY t.reputation DESC,t.name,t.id`).all(...CLUB_REGIONS));}
  previewInvitations(){const counts:Record<string,number>={},ids:string[]=[];for(const t of this.candidates()){
    const limit=CLUB_CAPACITY[t.region]-(CLUB_KICKOFF_REGIONS.includes(t.region)?1:0);
    if((counts[t.region]||0)<limit&&ids.length<20){ids.push(t.id);counts[t.region]=(counts[t.region]||0)+1;}
  }return ids;}
  private root(careerId:string,id:string){const root=this.db.prepare("SELECT c.*,cc.startDate FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.careerId=? AND c.id=? AND c.type='CLUB_CHAMPIONSHIP'").get(careerId,id);if(!root)throw Error('Club Championship not found in this save.');return root;}
  configure(career:any,id:string,input:ClubSetup){
    const root=this.root(career.id,id),config=parse(root.config);
    if(config.phase!=='setup')throw Error('This Club Championship is already configured. Played or registered events cannot be rebuilt.');
    if(!input.acceptCareerAdministration)throw Error('Review and accept the explicitly labelled career dates, invitation list and organiser seeding before creating fixtures.');
    const candidates=this.candidates(),eligible=new Set(candidates.map(t=>t.id)),invited=input.invitedTeamIds;
    if(!Array.isArray(invited)||invited.length!==20||new Set(invited).size!==20||invited.some(id=>!eligible.has(id)))throw Error('Choose exactly twenty different eligible real clubs.');
    for(const region of CLUB_REGIONS)if(invited.filter(id=>candidates.find(t=>t.id===id)?.region===region).length>CLUB_CAPACITY[region]-(CLUB_KICKOFF_REGIONS.includes(region)?1:0))throw Error(region+' must retain room for its Open winner.');
    if(![input.kickoffStart,input.leagueOpenStart,input.leagueStart,input.finaleStart].every(validDate))throw Error('Choose valid career dates.');
    const offset=Math.round((Date.parse(input.kickoffStart)-Date.parse('2026-12-09'))/86400000);
    const firstOpen=addDays('2026-11-05',offset);
    if(firstOpen<career.currentDate)throw Error('The first Open cannot precede the save date. Move the career Kick-Off date forward; its Opens move by the same amount.');
    if(input.leagueOpenStart<=addDays(input.kickoffStart,4)||input.leagueStart<=addDays(input.leagueOpenStart,10)||input.finaleStart<=addDays(input.leagueStart,70))throw Error('Leave time for the Kick-Off, ten-day League Opens, eleven weekly league rounds and the six-day Finale.');
    if(!['BO5','BO7'].includes(input.kickoffLaterFormat))throw Error('Choose BO5 or BO7 for the Kick-Off rounds whose length is not published.');
    return this.db.transaction(()=>{
      Object.assign(config,{phase:'running',administration:{...input,seedPolicy:'Career invitation order, then regional reputation order; not an official seed list.',ownerTiePolicy:'Initial career invitation order resolves equal Club Points; organiser choice, not a published points tiebreaker.'},invitedTeamIds:[...invited],settled:[],points:{},playerPrizes:[],ownerPayouts:[]});
      const create=(name:string,type:string,region:string,start:string,sources:string[],extra:any={})=>{
        const eid=uuid(),kind=['CLUB_KICKOFF_OPEN','CLUB_LEAGUE_OPEN'].includes(type)?'CLUB_OPEN':type;
        const profile={...clubProfile(kind),clubParentId:id,careerAdministration:true,seasonYear:2027,...extra};
        const count=type==='CLUB_KICKOFF'?24:type==='CLUB_FINALE'?16:type==='CLUB_LEAGUE'?CLUB_CAPACITY[region]:0;
        const pool=Array.from({length:count},(_,i)=>clubPlayerPrize(type,region,i+1)).reduce((a,b)=>a+b,0);
        this.db.prepare('INSERT INTO competitions(id,name,region,type,format,prizePool,seasonId,status,config) VALUES (?,?,?,?,?,?,?,?,?)').run(eid,name,region,type,type==='CLUB_LEAGUE'?'single_round_robin':kind==='CLUB_OPEN'?'double_elimination_swiss_gsl_hybrid':type==='CLUB_KICKOFF'?'double_elimination_24':'swiss_hybrid',pool,root.seasonId,'awaiting_qualification',JSON.stringify(profile));
        this.db.prepare('INSERT INTO career_competitions VALUES (?,?,?,?,?,?)').run(eid,career.id,type,11,start,JSON.stringify(sources));
        this.db.prepare('INSERT INTO calendar_events(id,careerId,date,type,title,description,relatedId) VALUES (?,?,?,?,?,?,?)').run(uuid(),career.id,start,'tournament_start',name,profile.qualificationRule+' Career organiser dates apply where official dates are pending.',eid);
        return eid;
      };
      const opens=CLUB_KICKOFF_REGIONS.map(region=>{const original=clubOpenSchedule(region),schedule=Object.fromEntries(Object.entries(original).map(([key,date])=>[key,addDays(date,offset)]));return create('RLCS 2027 Club Kick-Off Open — '+region,'CLUB_KICKOFF_OPEN',region,schedule.double_elimination,[],{schedule,clubAdvanceSpots:1,officialDates:original,dateAdjustmentDays:offset});});
      const kickoff=create('RLCS 2027 Club Kick-Off','CLUB_KICKOFF','GLOBAL',input.kickoffStart,opens,{kickoffLaterFormat:input.kickoffLaterFormat,formatNote:'Upper rounds 1–2 are official BO5. Other round lengths are the saved career organiser choice because this rulebook does not specify them.'});
      const leagues=CLUB_REGIONS.map(region=>{
        const schedule={double_elimination:input.leagueOpenStart,swiss:addDays(input.leagueOpenStart,2),gsl:addDays(input.leagueOpenStart,7),playoffs:addDays(input.leagueOpenStart,8),finals:addDays(input.leagueOpenStart,9)};
        const open=create('RLCS 2027 Club League Open — '+region,'CLUB_LEAGUE_OPEN',region,input.leagueOpenStart,[kickoff],{schedule});
        return create('RLCS 2027 Club League — '+region,'CLUB_LEAGUE',region,input.leagueStart,[kickoff,open],{finalePlaces:CLUB_FINALE_SLOTS[region]});
      });
      create('RLCS 2027 Club Finale','CLUB_FINALE','GLOBAL',input.finaleStart,leagues);
      this.save(id,config);this.db.prepare("UPDATE competitions SET status='scheduled' WHERE id=?").run(id);this.db.prepare('UPDATE career_competitions SET startDate=? WHERE competitionId=?').run(firstOpen,id);
      this.progress(career.id,career.currentDate);return {success:true};
    })();
  }
  private save(id:string,config:any){this.db.prepare('UPDATE competitions SET config=? WHERE id=?').run(JSON.stringify(config),id);}
  private children(careerId:string,parent:string){return this.db.prepare(`SELECT c.*,cc.startDate,cc.sources FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.careerId=? AND cc.stage<>'ARCHIVED' ORDER BY cc.startDate,c.id`).all(careerId).filter(c=>parse(c.config).clubParentId===parent);}
  private entrants(id:string){return this.db.prepare('SELECT ce.*,t.name AS teamName,t.region FROM competition_entries ce JOIN teams t ON t.id=ce.teamId WHERE competitionId=? ORDER BY ce.seed').all(id);}
  private players(teamId:string,careerId:string){
    const rows=this.db.prepare('SELECT * FROM players WHERE teamId=? ORDER BY overall DESC,id').all(teamId),career=this.db.prepare('SELECT teamId FROM careers WHERE id=?').get(careerId);
    const ids:string[]=career?.teamId===teamId?parse(this.db.prepare('SELECT players FROM career_lineup WHERE careerId=?').get(careerId)?.players||'[]'):parse(this.db.prepare('SELECT starterIds FROM team_roster_sources WHERE teamId=?').get(teamId)?.starterIds||'[]');
    return rows.sort((a,b)=>(ids.includes(a.id)?ids.indexOf(a.id):4)-(ids.includes(b.id)?ids.indexOf(b.id):4)||b.overall-a.overall).slice(0,4);
  }
  private register(careerId:string,c:any,date:string){
    const config=parse(this.db.prepare('SELECT config FROM competitions WHERE id=?').get(c.id)?.config);if(config.rosterLocked)return;
    for(const t of this.entrants(c.id))new CareerHonours(this.db).register(careerId,c.id,t.teamId,this.players(t.teamId,careerId),date);
    this.save(c.id,{...config,rosterLocked:true});
  }
  registeredPlayers(competitionId:string,teamId:string){return this.db.prepare('SELECT p.* FROM competition_rosters r JOIN players p ON p.id=r.playerId WHERE r.competitionId=? AND r.teamId=? AND p.teamId=? ORDER BY r.starter DESC,p.overall DESC,p.id').all(competitionId,teamId,teamId);}
  private withdrawals(career:any,c:any,date:string){
    const config=parse(this.db.prepare('SELECT config FROM competitions WHERE id=?').get(c.id)?.config);
    let changed=false;
    for(const f of this.db.prepare("SELECT * FROM fixtures WHERE competitionId=? AND status='scheduled' AND scheduledDate<=?").all(c.id,date)){
      const home=this.registeredPlayers(c.id,f.homeTeamId).length>=3,away=this.registeredPlayers(c.id,f.awayTeamId).length>=3;
      if(home&&away)continue;
      if(!home&&!away){const reason='Both clubs in a pending series lack three registered players. The organiser must resolve these withdrawals; no eligible winner is invented.';if(config.fieldPendingReason!==reason){config.fieldPendingReason=reason;changed=true;}continue;}
      const wins=f.seriesFormat==='BO7'?4:f.seriesFormat==='BO5'?3:2;
      this.db.prepare("UPDATE fixtures SET status='completed',homeScore=?,awayScore=? WHERE id=?").run(home?wins:0,away?wins:0,f.id);
      config.careerForfeits=[...(config.careerForfeits||[]),{fixtureId:f.id,teamId:home?f.awayTeamId:f.homeTeamId,date,reason:'Fewer than three registered players remain at the club.'}];
      changed=true;
      if([f.homeTeamId,f.awayTeamId].includes(career.teamId))this.db.prepare('INSERT INTO inbox_items(id,careerId,date,type,title,body,isRead) VALUES (?,?,?,?,?,?,0)').run(uuid(),career.id,date,'general','Club Championship — roster forfeit',c.name+': a scheduled series was awarded because one club could no longer field three registered players. Unregistered signings cannot replace a locked stage roster. No played-game statistics or XP were invented.');
    }
    if(changed)this.save(c.id,config);
  }
  private pending(c:any,reason:string){const config=parse(c.config);if(config.fieldPendingReason!==reason)this.save(c.id,{...config,fieldPendingReason:reason});}
  private enter(careerId:string,c:any,ids:string[],date:string,extra:any={}){
    if(new Set(ids).size!==ids.length)throw Error('A club cannot enter the same event twice.');
    const config={...parse(c.config),...extra};delete config.fieldPendingReason;
    ids.forEach((t,i)=>this.db.prepare('INSERT OR IGNORE INTO competition_entries(competitionId,teamId,seed) VALUES (?,?,?)').run(c.id,t,i+1));
    const start=maxDate(c.startDate,date);if(start!==c.startDate){config.careerRescheduledFrom=c.startDate;this.db.prepare('UPDATE career_competitions SET startDate=? WHERE competitionId=?').run(start,c.id);}
    if(c.type==='CLUB_LEAGUE'){
      let teams=[...ids];for(let round=0;round<ids.length-1;round++){
        for(let i=0;i<ids.length/2;i++)new Tournament(this.db).fixture(c.id,teams[i],teams[teams.length-1-i],addDays(start,round*7),round+1,'BO5','league');
        teams=[teams[0],teams[teams.length-1],...teams.slice(1,-1)];
      }
    }else new Tournament(this.db).prepare(c.id,ids,start,config);
    this.save(c.id,config);this.db.prepare("UPDATE competitions SET status='scheduled' WHERE id=?").run(c.id);
    if(start<=date)this.register(careerId,c,date);
  }
  leagueStandings(id:string){
    const rows=this.entrants(id).map(t=>({...t,played:0,wins:0,losses:0,gamesWon:0,gamesLost:0,gameDiff:0,goalDiff:0,points:0}));
    for(const f of this.db.prepare("SELECT * FROM fixtures WHERE competitionId=? AND status='completed'").all(id))for(const home of [true,false]){
      const r=rows.find(r=>r.teamId===(home?f.homeTeamId:f.awayTeamId));if(!r)continue;
      const a=home?f.homeScore:f.awayScore,b=home?f.awayScore:f.homeScore;r.played++;r.wins+=Number(a>b);r.losses+=Number(a<b);r.gamesWon+=a;r.gamesLost+=b;r.gameDiff=r.gamesWon-r.gamesLost;r.points=r.wins;
      for(const g of this.db.prepare('SELECT * FROM game_results WHERE fixtureId=?').all(f.id))r.goalDiff+=g.blueTeamId===r.teamId?g.blueScore-g.orangeScore:g.orangeScore-g.blueScore;
    }
    return rows.sort((a,b)=>b.wins-a.wins||b.gameDiff-a.gameDiff||b.goalDiff-a.goalDiff||a.seed-b.seed).map((r,i)=>({...r,placement:i+1}));
  }
  private ranks(c:any){
    if(c.type==='CLUB_LEAGUE')return this.leagueStandings(c.id);
    const placements=new Tournament(this.db).placements(c.id)||new Map<string,number>(),qualified:string[]=parse(this.db.prepare('SELECT teams FROM qualification_results WHERE competitionId=?').get(c.id)?.teams||'[]');
    return this.entrants(c.id).map(t=>({...t,placement:placements.get(t.teamId)||(qualified.includes(t.teamId)?1:999)})).sort((a,b)=>a.placement-b.placement||a.seed-b.seed);
  }
  private complete(career:any,c:any,root:any,config:any,date:string){
    if(config.settled.includes(c.id))return;
    const ranks=this.ranks(c);if(!ranks.length)return;
    const winner=new Tournament(this.db).details(c.id)?.championId||(c.type==='CLUB_LEAGUE'?ranks[0]?.teamId:null);
    const current=this.db.prepare('SELECT * FROM competitions WHERE id=?').get(c.id);
    if(winner){new CareerHonours(this.db).award(career.id,current,winner,date);new TrophyCeremonies(this.db).record(career.id,current,winner,date);}
    for(const row of ranks){
      if(config.invitedTeamIds.includes(row.teamId))config.points[row.teamId]=(config.points[row.teamId]||0)+clubPoints(c.type,c.region,row.placement);
      const prize=clubPlayerPrize(c.type,c.region,row.placement);
      if(prize){const starters=this.db.prepare('SELECT playerId FROM competition_rosters WHERE competitionId=? AND teamId=? AND starter=1 ORDER BY rowid LIMIT 3').all(c.id,row.teamId);
        starters.forEach((p,i)=>config.playerPrizes.push({competitionId:c.id,playerId:p.playerId,teamId:row.teamId,amount:(Math.floor(prize*100/3)+Number(i<prize*100%3))/100,date}));}
    }
    config.settled.push(c.id);
    if(c.type==='CLUB_KICKOFF')config.bonusRegion=this.db.prepare('SELECT region FROM teams WHERE id=?').get(winner)?.region;
    if(c.type==='CLUB_FINALE'){
      const board=this.leaderboard(config);config.ownerPayouts=board.map((r:any,i:number)=>({teamId:r.teamId,placement:i+1,amount:clubOwnerPrize(i+1)}));
      for(const p of config.ownerPayouts)if(!isPath(career)){
        this.db.prepare('UPDATE teams SET cashBalance=COALESCE(cashBalance,0)+? WHERE id=?').run(p.amount,p.teamId);
        this.db.prepare('INSERT INTO club_ledger VALUES (?,?,?,?,?,?,?)').run(uuid(),career.id,p.teamId,date,'club_points',p.amount,'RLCS 2027 Club Championship — owner Club Points payout');
      }
      config.phase='completed';this.db.prepare("UPDATE competitions SET status='completed' WHERE id=?").run(root.id);
    }
    this.save(root.id,config);
  }
  private leaderboard(config:any){return (config.invitedTeamIds||[]).map((id:string,i:number)=>({teamId:id,teamName:this.db.prepare('SELECT name FROM teams WHERE id=?').get(id)?.name||id,points:config.points?.[id]||0,initialSeed:i+1})).sort((a:any,b:any)=>b.points-a.points||a.initialSeed-b.initialSeed);}
  progress(careerId:string,date:string){
    this.candidateCache=null;
    const career=this.db.prepare('SELECT * FROM careers WHERE id=?').get(careerId);if(!career)return;
    career.mode=careerMode(this.db,careerId);
    for(const root of this.db.prepare("SELECT c.* FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.careerId=? AND c.type='CLUB_CHAMPIONSHIP' AND c.status NOT IN ('completed','cancelled')").all(careerId)){
      const config=parse(root.config);if(config.phase!=='running')continue;
      const children=this.children(careerId,root.id),kickoff=children.find(c=>c.type==='CLUB_KICKOFF');
      for(const c of children){
        if(c.status==='completed'){this.complete(career,c,root,config,date);continue;}
        const profile=parse(c.config),sources:string[]=parse(c.sources),sourceEvents=sources.map(id=>children.find(c=>c.id===id));
        if(c.status==='awaiting_qualification'){
          if(sourceEvents.some(s=>!s||s.status!=='completed'))continue;
          if(c.type==='CLUB_KICKOFF_OPEN'||c.type==='CLUB_LEAGUE_OPEN'){
            const direct=c.type==='CLUB_LEAGUE_OPEN'?this.entrants(kickoff.id).map(t=>t.teamId):config.invitedTeamIds;
            const spots=c.type==='CLUB_LEAGUE_OPEN'?CLUB_CAPACITY[c.region]-this.entrants(kickoff.id).filter(t=>t.region===c.region).length:1;
            if(spots===0){this.db.prepare("UPDATE competitions SET status='completed' WHERE id=?").run(c.id);this.db.prepare('INSERT OR REPLACE INTO qualification_results VALUES (?,?)').run(c.id,'[]');continue;}
            const ids=this.candidates().filter(t=>t.region===c.region&&!direct.includes(t.id)).map(t=>t.id);
            if(ids.length<32){this.pending(c,`${ids.length} eligible real clubs are available. The official 32-team Swiss field cannot be produced; no reduced knockout or fictional clubs will be substituted.`);continue;}
            this.enter(careerId,c,ids,date,{clubAdvanceSpots:spots});
          }else if(c.type==='CLUB_KICKOFF'){
            const qualifiers=sourceEvents.flatMap(s=>parse(this.db.prepare('SELECT teams FROM qualification_results WHERE competitionId=?').get(s.id)?.teams||'[]'));
            const ids=[...config.invitedTeamIds,...qualifiers];if(ids.length!==24||new Set(ids).size!==24){this.pending(c,'Twenty invitations and four distinct regional Open winners are required.');continue;}
            this.enter(careerId,c,ids,date);
          }else if(c.type==='CLUB_LEAGUE'){
            const direct=this.ranks(kickoff).filter(t=>t.region===c.region).map(t=>t.teamId),open=sourceEvents.find(s=>s.type==='CLUB_LEAGUE_OPEN');
            const qualifiers:string[]=parse(this.db.prepare('SELECT teams FROM qualification_results WHERE competitionId=?').get(open.id)?.teams||'[]');
            const order=this.ranks(open).filter(t=>qualifiers.includes(t.teamId)).map(t=>t.teamId),ids=[...direct,...order];
            if(ids.length!==CLUB_CAPACITY[c.region]){this.pending(c,'All regional League places must be earned before fixtures are generated.');continue;}
            this.enter(careerId,c,ids,date,{finalePlaces:CLUB_FINALE_SLOTS[c.region]+Number(config.bonusRegion===c.region)});
          }else if(c.type==='CLUB_FINALE'){
            const ids=CLUB_REGIONS.flatMap(region=>this.leagueStandings(sourceEvents.find(s=>s.region===region).id).slice(0,CLUB_FINALE_SLOTS[region]+Number(config.bonusRegion===region)).map(r=>r.teamId));
            if(ids.length!==16){this.pending(c,'Sixteen earned regional places are required.');continue;}
            this.enter(careerId,c,ids,date);
          }
        }
        const fresh=this.db.prepare('SELECT * FROM competitions WHERE id=?').get(c.id);if(fresh.status!=='scheduled')continue;
        if(date>=c.startDate)this.register(careerId,c,date);
        if(date>=c.startDate)this.withdrawals(career,c,date);
        if(c.type==='CLUB_LEAGUE'){
          if(!this.db.prepare("SELECT id FROM fixtures WHERE competitionId=? AND status<>'completed' LIMIT 1").get(c.id)&&this.entrants(c.id).length===CLUB_CAPACITY[c.region])this.db.prepare("UPDATE competitions SET status='completed' WHERE id=?").run(c.id);
        }else{new Tournament(this.db).progress(c.id,date);if(new Tournament(this.db).details(c.id)?.phase==='completed')this.db.prepare("UPDATE competitions SET status='completed' WHERE id=?").run(c.id);}
        if(this.db.prepare('SELECT status FROM competitions WHERE id=?').get(c.id)?.status==='completed')this.complete(career,c,root,config,date);
      }
    }
  }
  details(careerId:string,id:string){
    const root=this.root(careerId,id),config=parse(root.config);
    return {...root,config,entries:[],fixtures:[],clubChampionship:{events:this.children(careerId,id).map(c=>({...c,config:parse(c.config)})),candidates:config.phase==='setup'?this.candidates():[],suggestedInvitations:config.phase==='setup'?this.previewInvitations():[],leaderboard:this.leaderboard(config),playerPrizes:config.playerPrizes||[],ownerPayouts:config.ownerPayouts||[],bonusRegion:config.bonusRegion||null}};
  }
}
