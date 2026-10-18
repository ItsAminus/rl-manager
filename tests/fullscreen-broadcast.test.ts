import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
vi.mock('electron',()=>({nativeImage:{}}));
import {fullscreenBroadcast,HUD_IMAGE_SIZES} from '../src/main/fullscreen-broadcast';
import {playerPortrait} from '../src/services/player-portrait';
import {broadcastTeam} from '../src/services/broadcast-assets';

const folders:string[]=[];
afterEach(()=>{for(const folder of folders.splice(0))fs.rmSync(folder,{recursive:true,force:true});});
describe('Fullscreen career HUD assets',()=>{
  it('prepares a saved custom crest and smooth HUD variants without touching registry assets',()=>{
    const folder=fs.mkdtempSync(path.join(os.tmpdir(),'rlm-custom-'));folders.push(folder);
    const logo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNfoAAAAASUVORK5CYII=';
    const resize=vi.fn(()=>Buffer.from('resized'));
    const context={blue:{logo,players:[]},orange:{logo:'',players:[]}};
    const out=fullscreenBroadcast(context,{folder,resize,convert:vi.fn()});
    expect(out.blue.logo).toContain('club-');expect(fs.readFileSync(out.blue.logo).subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))).toBe(true);
    expect(resize).toHaveBeenCalledTimes(HUD_IMAGE_SIZES.length);
    fullscreenBroadcast(context,{folder,resize,convert:vi.fn()});expect(resize).toHaveBeenCalledTimes(HUD_IMAGE_SIZES.length);
  });
  it('restores existing pro headshots and keeps confirmed awards away from namesakes',()=>{
    expect(playerPortrait('zen','player_1')?.url).toBe('/player-portraits/player_1.jpg');
    expect(playerPortrait('zen','sg_player_unknown')).toBeNull();
    const team=broadcastTeam({id:'test',name:'Test'},[{playerId:'player_1',gamertag:'zen',rating:99}]);
    expect(team.players[0].title).toBe('RLCS 2022-23 World Champion');
    expect(team.players[0].titleSource).toMatch(/^https:\/\/rlstats.net\/profile\/Steam\//);
  });
  it('prepares cached PNGs outside the render loop without changing source portraits',()=>{
    const folder=fs.mkdtempSync(path.join(os.tmpdir(),'rlm-hud-'));folders.push(folder);
    const assets=path.join(folder,'assets');fs.mkdirSync(assets);
    fs.writeFileSync(path.join(assets,'portrait.webp'),'source');
    const convert=vi.fn(()=>Buffer.from('png'));
    const team={name:'Test',logo:'https://example.com/logo.png',players:[{gamertag:'Pro',photo:'/portrait.webp',title:'Champion'},{gamertag:'Unknown',photo:'/../escape.png'}]};
    const context={blue:team,orange:team,series:{bestOf:5}};
    const result=fullscreenBroadcast(context,{folder:path.join(folder,'native'),assetRoots:[assets],convert});
    expect(result.nativeStatePath).toBe(path.join(folder,'native','state.json'));
    expect(result.blue.logo).toBe('');expect(result.blue.players[1].photo).toBe('');
    expect(fs.readFileSync(result.blue.players[0].photo).toString()).toBe('png');
    expect(result.blue.players[0].title).toBe('Champion');
    expect(team.players[0].photo).toBe('/portrait.webp');
    fullscreenBroadcast(context,{folder:path.join(folder,'native'),assetRoots:[assets],convert});
    expect(convert).toHaveBeenCalledOnce();
  });
  it('uses offline PNGs for WebP textures without asking the unsupported live decoder',()=>{
    const folder=fs.mkdtempSync(path.join(os.tmpdir(),'rlm-hud-'));folders.push(folder);
    const assets=path.join(folder,'assets');fs.mkdirSync(path.join(assets,'broadcast-png'),{recursive:true});
    const url='/logo.webp';
    const name=createHash('sha256').update(url).digest('hex').slice(0,12)+'-logo.webp.png';
    fs.writeFileSync(path.join(assets,'broadcast-png',name),'prepared PNG');
    const convert=vi.fn(()=>{throw new Error('WebP unsupported');});
    const team={logo:url,players:[]};
    const result=fullscreenBroadcast({blue:team,orange:team},{folder:path.join(folder,'native'),assetRoots:[assets],convert});
    expect(fs.readFileSync(result.blue.logo).toString()).toBe('prepared PNG');
    expect(convert).not.toHaveBeenCalled();
  });
  it('caches display-sized textures from the original headshot and reuses them',()=>{
    const folder=fs.mkdtempSync(path.join(os.tmpdir(),'rlm-hud-'));folders.push(folder);
    const assets=path.join(folder,'assets');fs.mkdirSync(assets);
    const source=path.join(assets,'portrait.jpg');fs.writeFileSync(source,'original headshot');
    const convert=vi.fn(()=>Buffer.from('base PNG'));
    const resize=vi.fn((_source:string,pixels:number)=>Buffer.from(`smooth ${pixels}`));
    const team={logo:'',players:[{photo:'/portrait.jpg',gamertag:'Pro'}]};
    const options={folder:path.join(folder,'native'),assetRoots:[assets],convert,resize};
    const result=fullscreenBroadcast({blue:team,orange:team},options);
    expect(resize).toHaveBeenCalledTimes(HUD_IMAGE_SIZES.length);
    expect(resize).toHaveBeenCalledWith(source,54);
    expect(fs.readFileSync(result.blue.players[0].photo+'.px-54.png').toString()).toBe('smooth 54');
    fullscreenBroadcast({blue:team,orange:team},options);
    expect(resize).toHaveBeenCalledTimes(HUD_IMAGE_SIZES.length);
    expect(fs.readFileSync(source).toString()).toBe('original headshot');
  });
  it('uses the prepared PNG for smooth variants when the original decoder fails',()=>{
    const folder=fs.mkdtempSync(path.join(os.tmpdir(),'rlm-hud-'));folders.push(folder);
    const assets=path.join(folder,'assets');fs.mkdirSync(path.join(assets,'broadcast-png'),{recursive:true});
    const url='/unsupported.webp';
    const name=createHash('sha256').update(url).digest('hex').slice(0,12)+'-unsupported.webp.png';
    fs.writeFileSync(path.join(assets,'unsupported.webp'),'unsupported original');
    const png=path.join(assets,'broadcast-png',name);fs.writeFileSync(png,'prepared');
    const resize=vi.fn((source:string,pixels:number)=>source===png?Buffer.from(`smooth ${pixels}`):Buffer.alloc(0));
    const team={logo:'',players:[{photo:url}]};
    const result=fullscreenBroadcast({blue:team,orange:team},{folder:path.join(folder,'native'),assetRoots:[assets],convert:vi.fn(),resize});
    expect(fs.readFileSync(result.blue.players[0].photo+'.px-54.png').toString()).toBe('smooth 54');
    expect(resize).toHaveBeenCalledWith(png,54);
  });
});
