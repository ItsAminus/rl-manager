import type {AppDatabase} from './database';

export const IDENTITY_FIELDS = ['realName','age','nationality'] as const;
type Field = typeof IDENTITY_FIELDS[number];
export type IdentityChange = {id:string;gamertag:string;before:Record<Field,any>;after:Record<Field,any>;fields:Field[]};
export type IdentityPreview = {changes:IdentityChange[];unchanged:number;skipped:string[]};

function value(field:Field,input:unknown):string|number|null {
  if(input===null||input==='')return null;
  if(field==='age'){
    if(typeof input!=='number'||!Number.isInteger(input)||input<1||input>120)throw Error('Age must be a whole number from 1 to 120, or blank for unknown.');
    return input;
  }
  if(typeof input!=='string')throw Error(`${field} must be text or null.`);
  const text=input.trim();if(!text)return null;
  if(field==='nationality'){
    const code=text.toUpperCase();
    if(!/^[A-Z]{2}$/.test(code))throw Error('Nationality must use a two-letter country code, such as FR, GB or US.');
    const name=new Intl.DisplayNames(['en'],{type:'region'}).of(code);
    if(!name||name===code||code==='ZZ')throw Error(`Unknown country code: ${code}.`);
    return code;
  }
  if(text.length>120||/[\x00-\x1f\x7f]/.test(text))throw Error('Real name must be at most 120 characters with no control characters.');
  return text;
}

export class PlayerIdentity {
  constructor(private db:AppDatabase,private backup:()=>void=()=>{}){}
  get(id:string){
    const row=this.db.prepare('SELECT id,gamertag,realName,age,nationality FROM players WHERE id=?').get(id);
    if(!row)throw Error('Player not found in this career.');return row;
  }
  preview(input:unknown):IdentityPreview {
    const records=Array.isArray(input)?input:input&&typeof input==='object'&&Array.isArray((input as any).players)?(input as any).players:[input];
    if(!records.length||records.length>20000)throw Error('Import between 1 and 20,000 player records.');
    const players=this.db.prepare('SELECT id,gamertag,realName,age,nationality FROM players').all();
    const ids=new Map(players.map(p=>[p.id,p])),tags=new Map<string,any[]>();
    for(const p of players){const key=p.gamertag.toLowerCase();tags.set(key,[...(tags.get(key)||[]),p]);}
    const result:IdentityPreview={changes:[],unchanged:0,skipped:[]},seen=new Set<string>();
    for(const [index,record] of records.entries()){
      if(!record||typeof record!=='object'||Array.isArray(record))throw Error(`Record ${index+1} must be a player object.`);
      const suppliedId=record.id??record.playerId;
      const candidates=typeof suppliedId==='string'?[ids.get(suppliedId)].filter(Boolean):typeof record.gamertag==='string'?tags.get(record.gamertag.toLowerCase().trim())||[]:[];
      if(candidates.length!==1){result.skipped.push(`Record ${index+1}: ${String(suppliedId||record.gamertag||'no identity').slice(0,120)} (${candidates.length?'ambiguous gamertag':'not found'})`);continue;}
      const p=candidates[0];if(seen.has(p.id))throw Error(`Duplicate record for ${p.gamertag}. Each player can appear only once.`);seen.add(p.id);
      const before={realName:p.realName,age:p.age,nationality:p.nationality},after={...before};
      try{for(const field of IDENTITY_FIELDS)if(Object.prototype.hasOwnProperty.call(record,field))after[field]=value(field,record[field]);}
      catch(error){throw Error(`${p.gamertag}: ${(error as Error).message}`);}
      const fields=IDENTITY_FIELDS.filter(f=>before[f]!==after[f]);
      if(fields.length)result.changes.push({id:p.id,gamertag:p.gamertag,before,after,fields});else result.unchanged++;
    }
    return result;
  }
  apply(preview:IdentityPreview){
    // Preview objects are retained in the main process, never accepted from IPC.
    for(const change of preview.changes){const current=this.get(change.id);
      if(change.fields.some(f=>current[f]!==change.before[f]))throw Error('Player details changed since preview. Review the import again.');}
    if(!preview.changes.length)return 0;
    this.backup();
    this.db.transaction(()=>{for(const change of preview.changes){
      // Only identity columns can be changed, even when importing players.json.
      const fields=change.fields;
      this.db.prepare(`UPDATE players SET ${fields.map(f=>f+'=?').join(',')} WHERE id=?`).run(...fields.map(f=>change.after[f]),change.id);
    }})();
    return preview.changes.length;
  }
}
