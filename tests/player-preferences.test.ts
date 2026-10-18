import {it,expect,afterEach} from 'vitest';
import fs from 'node:fs';import path from 'node:path';
import {PlayerPreferences,TUTORIAL_VERSION} from '../src/main/player-preferences';
const folders:string[]=[];afterEach(()=>{for(const f of folders.splice(0)){if(!f.startsWith(path.resolve('scratch')+path.sep))throw Error('Unexpected test path');fs.rmSync(f,{recursive:true,force:true});}});
it('remembers a finished or skipped tour globally while keeping connection settings',()=>{
 const folder=fs.mkdtempSync(path.join(path.resolve('scratch'),'preferences-'));folders.push(folder);const prefs=new PlayerPreferences(folder);
 prefs.update({integration:{rocketLeague:'my-game.exe'}});prefs.tutorial('skipped');
 const loaded=new PlayerPreferences(folder).read();expect(loaded.tutorialVersion).toBe(TUTORIAL_VERSION);expect(loaded.tutorialOutcome).toBe('skipped');expect(loaded.integration.rocketLeague).toBe('my-game.exe');
 prefs.tutorial('completed');expect(prefs.read().tutorialOutcome).toBe('completed');
});
