import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import registry from '../data/broadcast-profiles.json';
import headshots from '../data/player-headshots.json';
import {playerPortrait} from '../src/services/player-portrait';
import {scoreboardPortrait} from '../src/services/scoreboard-portrait';
import {broadcastTeam,officialProfile} from '../src/services/broadcast-assets';
import titles from '../data/player-titles.json';
import coverage from '../data/player-title-coverage.json';
import players from '../data/players.json';
describe('Official broadcast assets',()=>{
  it('uses literal earned titles for Oski and Archie by career identity',()=>{
    const roles=broadcastTeam({id:'test',name:'Test'},[
      {playerId:'player_8',gamertag:'Oski',bot:'BonkDaddy'},
      {playerId:'player_24',gamertag:'archie',bot:'BonkDaddy'},
      {playerId:'player_1',gamertag:'zen',bot:'BonkDaddy'},
    ]).players;
    expect(roles[0].title).toBe('RLCS 2026 Boston Major Champion');
    expect(roles[1].title).toBe('RLCS 2026 Boston Major Champion');
    expect(roles[2].title).toBe('RLCS 2022-23 World Champion');
    expect(roles.every(p=>p.titleSource?.startsWith('https://rlstats.net/profile/Steam/'))).toBe(true);
  });
  it('audits every database identity and displays only titles present in their verified public record',()=>{
    expect(Object.keys(coverage.players).sort()).toEqual(players.map(p=>p.id).sort());
    for(const [id,record] of Object.entries(titles)){
      expect(record.titles,id).toContain(record.title);
      expect(record.identity,id).toBeTruthy();
      expect(record.identitySource,id).toContain('liquipedia.net/rocketleague/');
    }
    expect(Object.keys(titles).length).toBeGreaterThan(100);
  });
  it('uses stable player identities and never borrows a pro photo for a namesake qualifier',()=>{
    const team={id:'test',name:'Test',shortName:'T'};
    const a=broadcastTeam(team,[{playerId:'player_1',gamertag:'zen',rating:99}]);
    expect(a.players[0].photo).toBeTruthy();
    const b=broadcastTeam(team,[{playerId:'sg_player_unverified_namesake',gamertag:'zen',rating:70}]);
    expect(b.players[0].photo).toBeNull();
    expect(b.players[0].title).toBeNull();
  });
  it('keeps the chosen human role and two Nexto-backed pro identities separate',()=>{
    const team=broadcastTeam({id:'test',name:'Test'},[
      {playerId:'player_1',gamertag:'zen',isHuman:false,bot:'Nexto'},
      {playerId:'player_12',gamertag:'nass',isHuman:false,bot:'Nexto'},
      {playerId:'player_2',gamertag:'Vatira',isHuman:true},
    ]);
    expect(team.players[0].playerId).toBe('player_1');
    expect(team.players[1].playerId).toBe('player_12');
    expect(team.players[0].photo).toBe('/scoreboard-portraits/player_1.png');
    expect(team.players[1].photo).toBe('/scoreboard-portraits/player_12.png');
    expect(team.players[0].photo).not.toBe(team.players[1].photo);
    expect(team.players[2].isHuman).toBe(true);
    expect(team.players[0].isHuman).toBe(false);
  });
  it('all local image paths exist and retain source attribution',()=>{
    for(const group of Object.values(registry))for(const record of Object.values(group) as any[]){
      if(!record.avatarUrl)continue;
      expect(record.avatarSource).toMatch(/^https?:\/\//);
      if(record.avatarUrl.startsWith('/'))expect(fs.existsSync(path.join(process.cwd(),'public',record.avatarUrl.slice(1))),record.avatarUrl).toBe(true);
      expect(record.avatarUrl).not.toContain('%3C%21--');
    }
  });
  it('covers all five real community profiles with confirmed source images',()=>{
    for(const id of ['gibbs','johnny','sunless','rizzo','esports'])expect(officialProfile({id}).avatarUrl,id).toBeTruthy();
  });
  it('uses the authentic broadcast crest and team palette without changing account avatars',()=>{
    const team=broadcastTeam({id:'team_4',name:'Gentle Mates',shortName:'M8'},[]);
    expect(team.logo).toBe('/broadcast-crests/team_4.png');
    expect(team.logoSource).toMatch(/^https:\/\/www.gentlemates.com\//);
    expect(team.brandColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(fs.existsSync(path.join(process.cwd(),'public',team.logo.slice(1)))).toBe(true);
    expect(officialProfile({teamId:'team_4',kind:'Club'}).avatarUrl).toBe('/profile-thumbnails/teams-team_4.webp');
  });
  it('prefers real faces over account icons for newly added pros across every surface',()=>{
    for(const [id,tag] of [
      ['pro_b745b0df-a964-4e56-905f-a0fc21703a8f','M7md'],
      ['real_juicy','juicy'],['real_diaz','diaz'],
      ['pro_56d7bc6f-b281-4598-84b3-53a771dd27b5','AtomiK'],
    ]){
      const portrait=playerPortrait(tag,id);
      expect(portrait?.kind,tag).toBe('headshot');
      expect(portrait?.source,tag).toContain('liquipedia.net/commons');
      expect(officialProfile({playerId:id,gamertag:tag}).avatarUrl).toBe(portrait?.url);
      const broadcast=broadcastTeam({id:'test',name:'Test'},[{playerId:id,gamertag:tag}]).players[0];
      expect(broadcast.photo).toBe(scoreboardPortrait(tag,id)?.url);
      expect(broadcast.photoSource).toBe(portrait?.source);
      expect(broadcast.photoKind).toBe('headshot');
    }
  });
  it('does not confuse same-tag qualifiers or custom players with verified pros',()=>{
    expect(playerPortrait('M7md','sg_player_5356770')?.kind).not.toBe('headshot');
    expect(playerPortrait('zen','custom_player')).toBeNull();
    const fallback=Object.entries(registry.players).find(([id,p])=>p.avatarUrl&&!(headshots as Record<string,unknown>)[id]);
    expect(fallback).toBeTruthy();
    expect(playerPortrait('Unrelated name',fallback![0])?.kind).toBe('account-avatar');
  });
  it('keeps face-photo files and attribution separate from account imports',()=>{
    for(const [id,photo] of Object.entries(headshots)){
      expect(photo.source,id).toMatch(/^https?:\/\//);
      expect(photo.identity,id).toBeTruthy();
      expect(fs.existsSync(path.join(process.cwd(),'public',photo.path.slice(1))),id).toBe(true);
      if(id.startsWith('sg_player_'))expect(photo.identity).toBe('Exact linked start.gg user');
    }
  });
});
