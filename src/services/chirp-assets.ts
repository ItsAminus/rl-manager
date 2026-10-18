import media from '../../data/chirp-media.json';
import logos from '../../data/team-broadcast-logos.json';
import type { ChirpMatchContext } from '../main/chirp-match-context';
import { officialProfile } from './broadcast-assets';
const registry=media as {community:Record<string,{url:string;source:string}>;photos:{url:string;source:string;caption:string}[]};
const crests=logos as Record<string,{logo:string;kind:string;source:string|null}>;
const hash=(s:string)=>Array.from(s).reduce((n,c)=>Math.imul(n^c.charCodeAt(0),16777619)>>>0,2166136261);
export function chirpCover(a:any){
  const actual=registry.community[a.id];
  const crest=crests[a.currentTeamId||a.teamId];
  return {bannerUrl:actual?.url||null,bannerSource:actual?.source||null,bannerKind:actual?'official-banner':'career-cover',
    coverPortrait:a.avatarUrl||null,coverLogo:crest?.logo||null,coverSeed:hash(a.id),
    coverSource:a.avatarSource||crest?.source||null};
}
export function chirpMedia(kind:string,key:string){
  const fallback={url:'/profile-thumbnails/community-rizzo.webp',source:'https://liquipedia.net/rocketleague/Rizzo',caption:'Rizzo · career reaction card'};
  const reactions=['rizzo','sunless','johnny','gibbs'].map(id=>officialProfile({id})).filter(a=>a.avatarUrl).map(a=>({url:a.avatarUrl!,source:a.avatarSource!,caption:'Career fan reaction · creator portrait'}));
  const images=kind==='meme'?[...registry.photos,...reactions]:registry.photos;
  const image=images.length?images[hash(key)%images.length]:fallback;
  const captions=kind==='meme'?[
    ['ME BEFORE THE SERIES','WE ARE SO BACK'],['ONE MISSED TOUCH','THE TIMELINE: REBUILD THE ROSTER'],
    ['100 BOOST','ZERO IDEA WHERE MY TEAMMATE IS'],['JUST ONE MORE RANKED GAME','FAMOUS LAST WORDS'],
    ['THE TRANSFER WINDOW OPENS','EVERY FAN BECOMES A SCOUT'],['ME READING THE RIVAL FANS','BOOKMARKED.'],
  ]:null;
  const caption=captions?.[hash(key+'caption')%captions.length];
  return {...image,kind:caption?'meme':'photo',top:caption?.[0],bottom:caption?.[1]};
}
export function chirpReceiptMedia(match:ChirpMatchContext,boast:string){
  // An original card made from actual career data, not a pretend match photo.
  return {kind:'receipt',caption:'Career series receipt',quote:boast,home:match.home,away:match.away,
    score:match.seriesScore,format:match.format,competition:match.competition,
    headline:match.facts.some(f=>/reverse sweep/i.test(f))?'REVERSE SWEEP RECEIPTS':'KEEP THAT SAME ENERGY',
    games:match.games.map(g=>({game:g.game,blue:g.blue,orange:g.orange,score:g.score}))};
}
