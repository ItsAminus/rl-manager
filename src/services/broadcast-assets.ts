import registry from '../../data/broadcast-profiles.json';
import {playerPortrait} from './player-portrait';
import {broadcastColor} from './broadcast-colors';
import {scoreboardPortrait} from './scoreboard-portrait';
import {playerTitle} from './player-title';
import teamLogos from '../../data/team-broadcast-logos.json';
const assets=registry as Record<string,Record<string,any>>;
const timerLogos=teamLogos as Record<string,{logo:string;kind:string;source:string|null}>;
export function broadcastShortName(team:{shortName?:string;name?:string}):string{
  const name=team.shortName?.trim()||team.name?.trim()||'?';
  if(Array.from(name).length<=6)return name;
  const words=name.match(/[\p{L}\p{N}]+/gu)||[];
  return (words.length>1?words.slice(0,4).map(word=>Array.from(word)[0]).join(''):Array.from(name).slice(0,6).join('')).toUpperCase();
}
export function officialProfile(account:any): {profileUrl?:string;avatarUrl?:string;avatarSource?:string;officialHandle?:string;handle?:string} {
  const p=account.playerId?assets.players[account.playerId]:account.teamId&&account.kind==='Club'?assets.teams[account.teamId]:assets.community[account.id];
  const portrait=account.playerId?playerPortrait(account.gamertag||account.displayName||account.name||p?.name,account.playerId):null;
  return p||portrait?{profileUrl:p?.profileUrl||portrait?.source,avatarUrl:portrait?.url||p?.avatarUrl,avatarSource:portrait?.source||p?.avatarSource,officialHandle:p?.handle, ...(p?.handle?{handle:p.handle}:{})}:{};
}
export function broadcastTeam(team:any,players:any[]) {
  const logo=assets.teams[team.id];
  const timerLogo=timerLogos[team.id];
  return {id:team.id,name:team.name,shortName:broadcastShortName(team),logo:team.branding?.logo||timerLogo?.logo||logo?.broadcastLogoUrl||logo?.avatarUrl||null,
    logoSource:team.branding?.logo?'Career club design':timerLogo?timerLogo.source:logo?.broadcastLogoSource||logo?.avatarSource||null,
    logoKind:team.branding?.logo?'custom':timerLogo?.kind||'unavailable',brandColor:team.branding?.primary||broadcastColor(team),
    customBranding:!!team.branding,brandSecondary:team.branding?.secondary||'#030507',
    players:players.map(p=>{
      const title=playerTitle(p.playerId);
      const portrait=scoreboardPortrait(p.gamertag,p.playerId);
      return {playerId:p.playerId,gamertag:p.gamertag,isHuman:!!p.isHuman,photo:portrait?.url||null,
        photoSource:portrait?.source||null,photoKind:portrait?.kind||null,
        title:p.careerTitle?.title||title?.title||null,titleSource:p.careerTitle?`Career award · ${p.careerTitle.earnedDate}`:title?.source||null, rating:p.rating};
    })};
}

// Rebuild for each launched fixture. Neither a previous match nor the UI's
// submitted config can substitute another club's crest or competition label.
export function broadcastMatch(input:{blueTeam:any;orangeTeam:any;bluePlayers:any[];orangePlayers:any[];
  competition?:{id?:string;name?:string}|null;series:any;round:any;arena:string}){
  return {blue:broadcastTeam(input.blueTeam,input.bluePlayers),orange:broadcastTeam(input.orangeTeam,input.orangePlayers),
    competitionId:input.competition?.id||null,event:input.competition?.name?.trim()||'Career series',
    round:input.round,series:input.series,arena:input.arena};
}
