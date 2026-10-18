import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import portraits from '../data/scoreboard-portraits.json';
import steam from '../data/player-steam-avatars.json';
import {scoreboardPortrait} from '../src/services/scoreboard-portrait';
import {playerPortrait} from '../src/services/player-portrait';
import {broadcastTeam} from '../src/services/broadcast-assets';

describe('Player-specific scoreboard photos',()=>{
  it('uses the three requested players’ own framed headshots and keeps profile originals',()=>{
    for(const [id,tag] of [['player_1','zen'],['player_8','Oski'],['player_24','Archie']]){
      const photo=scoreboardPortrait(tag,id);
      expect(photo?.kind,tag).toBe('headshot');
      expect(photo?.url).toBe(`/scoreboard-portraits/${id}.png`);
      expect(photo?.source).toContain('liquipedia.net/commons');
      expect(playerPortrait(tag,id)?.url).toBe(`/player-portraits/${id}.jpg`);
    }
  });
  it('uses verified Steam before generic account icons when a real face is unavailable',()=>{
    const photo=scoreboardPortrait('Mech','real_mech');
    expect(photo?.kind).toBe('steam-avatar');
    expect(photo?.source).toBe('https://steamcommunity.com/profiles/76561199038935432');
    expect(photo?.url).toBe('/scoreboard-portraits/real_mech.png');
    // A custom/namesake player cannot inherit this verified account by name.
    expect(scoreboardPortrait('Mech','custom_player')).toBeNull();
  });
  it('keeps portraits attached to player IDs when one engine plays multiple roles',()=>{
    const players=[{playerId:'player_1',gamertag:'zen',bot:'Nexto'},
      {playerId:'player_8',gamertag:'Oski',bot:'Nexto'},
      {playerId:'player_24',gamertag:'Archie',bot:'Nexto',isHuman:true}];
    const blue=broadcastTeam({id:'test',name:'Test'},players);
    expect(new Set(blue.players.map(p=>p.photo)).size).toBe(3);
    expect(broadcastTeam({id:'test',name:'Test'},players.reverse()).players[0].photo).toBe(blue.players[2].photo);
  });
  it('has local image files and source attribution for every cached portrait and Steam account',()=>{
    for(const [id,p] of Object.entries(portraits)){
      expect(p.source,id).toMatch(/^https?:\/\//);
      expect(fs.existsSync(path.join(process.cwd(),'public',p.path.slice(1))),id).toBe(true);
      expect(fs.readFileSync(path.join(process.cwd(),'public',p.path.slice(1))).subarray(0,8).toString('hex'),id).toBe('89504e470d0a1a0a');
    }
    for(const [id,p] of Object.entries(steam)){
      expect(p.identity,id).toBeTruthy();
      expect(p.identitySource,id).toContain('liquipedia.net/rocketleague/');
      expect(fs.existsSync(path.join(process.cwd(),'public',p.path.slice(1))),id).toBe(true);
    }
  });
});
