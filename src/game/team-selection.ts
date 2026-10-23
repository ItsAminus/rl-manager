import {matchesRegion,type Team} from '../types';

export const TEAM_SORTS={reputation:'Reputation',popularity:'Popularity (fanbase)',name:'Name',budget:'Budget',facilities:'Facilities'} as const;
export type TeamSort=keyof typeof TEAM_SORTS;
export function selectableTeam(team:Pick<Team,'rosterStatus'|'roster'>){return !['inactive','incomplete','disbanded'].includes(team.rosterStatus||'')&&team.roster.length>=3;}
const normalized=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim();
export function selectTeams(teams:Team[],region:string,search:string,sort:TeamSort='reputation',ascending=false){
  const terms=normalized(search).split(/\s+/).filter(Boolean);
  return teams.filter(t=>selectableTeam(t)&&matchesRegion(t.region,region)&&terms.every(term=>normalized(t.name+' '+(t.shortName||'')).includes(term))).sort((a,b)=>{
    let difference=sort==='name'?a.name.localeCompare(b.name,undefined,{sensitivity:'base',numeric:true}):Number(a[sort==='popularity'?'fanbase':sort==='facilities'?'facilityLevel':sort]??0)-Number(b[sort==='popularity'?'fanbase':sort==='facilities'?'facilityLevel':sort]??0);
    if(!ascending)difference=-difference;
    return difference||a.name.localeCompare(b.name,undefined,{sensitivity:'base',numeric:true})||a.id.localeCompare(b.id);
  });
}
