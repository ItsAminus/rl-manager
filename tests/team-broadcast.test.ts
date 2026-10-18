import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import teams from '../data/teams.json';
import logos from '../data/team-broadcast-logos.json';
import {broadcastMatch,broadcastTeam,officialProfile} from '../src/services/broadcast-assets';
import {teamCrest} from '../src/services/team-crest';

describe('Fixture-specific timer branding',()=>{
  it('covers every database team with a usable local PNG and honest source classification',()=>{
    expect(Object.keys(logos).sort()).toEqual(teams.map(team=>team.id).sort());
    for(const team of teams){
      const record=(logos as Record<string,any>)[team.id];
      const shown=broadcastTeam(team,[]);
      expect(shown.id).toBe(team.id);
      expect(Array.from(shown.shortName).length).toBeLessThanOrEqual(6);
      expect(shown.logo).toBe(record.logo);
      expect(teamCrest(team.id)).toBe(shown.logo);
      expect(record.name).toBe(team.name);
      const image=fs.readFileSync(path.join(process.cwd(),'public',record.logo.slice(1)));
      expect(image.subarray(0,8).toString('hex'),team.name).toBe('89504e470d0a1a0a');
      if(record.kind==='published_logo')expect(record.source,team.name).toMatch(/^https?:\/\//);
      else {expect(record.kind).toBe('initials_fallback');expect(record.source).toBeNull();}
    }
  });
  it('refreshes both club identities and the actual competition on consecutive fixtures',()=>{
    const first=teams.find(team=>team.id==='team_1')!;
    const second=teams.find(team=>team.id==='team_16')!;
    const series={bestOf:5,gameNumber:2,blueWins:1,orangeWins:0,history:[{gameNumber:1,winner:0}]};
    const input={blueTeam:first,orangeTeam:second,bluePlayers:[],orangePlayers:[],series,round:3,arena:'Forbidden Temple'};
    const regional=broadcastMatch({...input,competition:{id:'regional',name:'EU Regional Open 3'}});
    const major=broadcastMatch({...input,blueTeam:second,orangeTeam:first,competition:{id:'major',name:'RLCS Major 2'}});
    expect(regional.event).toBe('EU Regional Open 3');expect(regional.competitionId).toBe('regional');
    expect(major.event).toBe('RLCS Major 2');expect(major.competitionId).toBe('major');
    expect(major.blue.logo).toBe(regional.orange.logo);
    expect(major.orange.logo).toBe(regional.blue.logo);
    expect(major.blue.logo).not.toBe(major.orange.logo);
    expect(major.series).toEqual(series);
    expect(regional.blue.id).toBe(first.id); // Previous contexts stay independent.
  });
  it('keeps qualifier identities distinct and leaves profile avatars untouched',()=>{
    const qualifier=teams.find(team=>(logos as Record<string,any>)[team.id].kind==='initials_fallback')!;
    const shown=broadcastTeam(qualifier,[]);
    expect(shown.logoKind).toBe('initials_fallback');expect(shown.logoSource).toBeNull();
    expect(broadcastTeam({id:'unverified',name:'Team Vitality'},[]).logo).toBeNull();
    expect(teamCrest('unverified')).toBeNull();
    expect(officialProfile({teamId:'team_9',kind:'Club'}).avatarUrl).toBe('/profile-thumbnails/teams-team_9.webp');
  });
});
