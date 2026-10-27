import {useState} from 'react';
import type {IdentityPreview} from '../../main/player-identity';
import './PlayerIdentityEditor.css';

type Details={realName:string;age:string;nationality:string};
const display=(value:unknown)=>value==null||value===''?'Unknown':String(value);
export function PlayerIdentityEditor({playerId,onSaved}:{playerId:string;onSaved:(message:string)=>Promise<void>}){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [details,setDetails]=useState<Details>({realName:'',age:'',nationality:''});
  const [preview,setPreview]=useState<(IdentityPreview&{token:string})|null>(null);
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setError('');try{await action();}catch(e){setError((e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /,''));}finally{setBusy(false);}};
  const edit=()=>run(async()=>{
    const p=await window.api.players.identity.get(playerId);
    setDetails({realName:p.realName||'',age:p.age==null?'':String(p.age),nationality:p.nationality||''});setOpen(true);
  });
  const save=()=>run(async()=>{
    const result=await window.api.players.identity.save(playerId,{realName:details.realName,age:details.age===''?null:Number(details.age),nationality:details.nationality});
    setOpen(false);await onSaved(result.updated?'Player information saved in this career. A backup was created.':'No changes to save.');
  });
  const importFile=(file?:File)=>{if(!file)return;setPreview(null);void run(async()=>{
    if(file.size>32*1024*1024)throw Error('Choose a JSON file smaller than 32 MB.');
    setPreview(await window.api.players.identity.preview(await file.text()));
  });};
  const apply=()=>run(async()=>{if(!preview)return;const result=await window.api.players.identity.apply(preview.token);setPreview(null);
    await onSaved(`${result.updated} player${result.updated===1?'':'s'} updated in this career. A backup was created.`);
  });
  return <section className="identity-editor card" aria-label="Player information editor">
    <div className="identity-heading"><div><h3>Player information</h3><p>Correct identity details in this save only. Ratings, contracts and transfers stay as they are.</p></div>
      <button className="btn btn-secondary" disabled={busy} onClick={()=>open?setOpen(false):void edit()}>{open?'Close editor':'Edit player information'}</button></div>
    {error&&<p role="alert" className="identity-error">{error}</p>}
    {open&&<form onSubmit={e=>{e.preventDefault();void save();}}>
      <div className="identity-fields"><label>Real name<input autoFocus maxLength={120} value={details.realName} disabled={busy} onChange={e=>setDetails({...details,realName:e.target.value})}/></label>
      <label>Age in this career<input type="number" min="1" max="120" step="1" value={details.age} disabled={busy} onChange={e=>setDetails({...details,age:e.target.value})}/></label>
      <label>Nationality code<input maxLength={2} placeholder="FR, GB, US…" value={details.nationality} disabled={busy} onChange={e=>setDetails({...details,nationality:e.target.value.toUpperCase()})}/></label></div>
      <p>Leave a field blank to mark it unknown. Use the player’s age at your current career date.</p>
      <button className="btn btn-primary" disabled={busy} type="submit">{busy?'Saving…':'Save to this career'}</button>
    </form>}
    <details className="identity-import"><summary>Import player information from JSON</summary>
      <p>Choose an edited <code>players.json</code> file or a list of corrections. Only <code>realName</code>, <code>age</code> and <code>nationality</code> are imported. Omitted fields stay unchanged; null or blank clears them. Players are matched by ID, or by a unique gamertag when no ID is supplied.</p>
      <pre>{JSON.stringify([{id:playerId,realName:'Player Name',age:20,nationality:'FR'}],null,2)}</pre>
      <label className="identity-file">Choose JSON file<input type="file" accept=".json,application/json" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';importFile(file);}}/></label>
      {busy&&<p role="status">Processing player information…</p>}
      {preview&&<div className="identity-preview" aria-label="Import preview">
        <h4>Review before applying</h4><p>{preview.changes.length} players to update · {preview.unchanged} unchanged · {preview.skipped.length} skipped. Nothing has been applied yet.</p>
        {!!preview.changes.length&&<div className="identity-table"><table><thead><tr><th>Player</th><th>Field</th><th>Current</th><th>Imported</th></tr></thead><tbody>{preview.changes.slice(0,50).flatMap(row=>row.fields.map(field=><tr key={row.id+field}><td>{row.gamertag}</td><td>{{realName:'Real name',age:'Age',nationality:'Nationality'}[field]}</td><td>{display(row.before[field])}</td><td>{display(row.after[field])}</td></tr>))}</tbody></table></div>}
        {preview.changes.length>50&&<p>Showing the first 50 players. Applying updates all {preview.changes.length} reviewed matches.</p>}
        {!!preview.skipped.length&&<details><summary>Skipped records ({preview.skipped.length})</summary><ul>{preview.skipped.slice(0,50).map((message,i)=><li key={i}>{message}</li>)}</ul>{preview.skipped.length>50&&<p>Showing the first 50 skipped records.</p>}</details>}
        <div className="identity-buttons"><button className="btn btn-primary" disabled={busy||!preview.changes.length} onClick={()=>void apply()}>Apply {preview.changes.length} player updates to this career</button><button className="btn btn-secondary" disabled={busy} onClick={()=>setPreview(null)}>Cancel import</button></div>
        <p>An automatic backup is created before applying changes. Other careers and the shared starting database are unaffected.</p>
      </div>}
    </details>
  </section>;
}
