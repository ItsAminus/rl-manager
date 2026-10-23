import type {AppDatabase} from './database';
import snapshot from '../../data/real-rosters.json';
import audit from '../../data/team-status-audit.json';

export type TeamStatusAudit={version:string;checkedAt:string;teams:{id:string;name:string;status:string;source:string;note:string}[]};
/** Status-only migration: never resets career transfers, contracts or results. */
export function applyTeamStatusAudit(db:AppDatabase,update:TeamStatusAudit=audit){
  const key='team_status_audit',version=update.version+':'+snapshot.version;if(db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value===version)return false;
  db.transaction(()=>{
    for(const team of snapshot.teams.filter(t=>t.rosterKind==='dated_tournament'))db.prepare("UPDATE team_roster_sources SET status='historical' WHERE teamId=? AND status='active'").run(team.id);
    for(const t of update.teams){
      if(!['inactive','incomplete','active'].includes(t.status)||!/^https:\/\//.test(t.source))throw Error('Invalid team status evidence.');
      db.prepare('UPDATE team_roster_sources SET status=?,source=?,note=?,verifiedAt=CASE WHEN ?=\'active\' THEN ? ELSE verifiedAt END WHERE teamId=?').run(t.status,t.source,t.note,t.status,update.checkedAt,t.id);
    }
    db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run(key,version);
  })();return true;
}
export function selectableTeams(db:AppDatabase){
  applyTeamStatusAudit(db);
  const teams=db.prepare(`SELECT t.*,rs.status AS rosterStatus,rs.verifiedAt AS rosterVerifiedAt,rs.source AS rosterSource,rs.note AS rosterNote
    FROM teams t LEFT JOIN team_roster_sources rs ON rs.teamId=t.id
    WHERE COALESCE(rs.status,'') NOT IN ('inactive','incomplete','disbanded')
    AND NOT EXISTS(SELECT 1 FROM generated_entities g WHERE g.id=t.id)
    AND (SELECT COUNT(*) FROM players p WHERE p.teamId=t.id)>=3 ORDER BY t.reputation DESC,t.name`).all();
  const rosters=new Map<string,string[]>();for(const p of db.prepare('SELECT id,teamId FROM players ORDER BY overall DESC,id').all()){const ids=rosters.get(p.teamId)||[];ids.push(p.id);rosters.set(p.teamId,ids);}
  return teams.map(t=>({...t,roster:rosters.get(t.id)||[],starters:(rosters.get(t.id)||[]).slice(0,3),isPlayerManaged:false}));
}
