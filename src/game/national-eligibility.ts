type Identity={code:string;name:string;id:string};
const associations:Record<string,[string,string]>={ENG:['ENG','England'],GBENG:['ENG','England'],SCO:['SCO','Scotland'],GBSCT:['SCO','Scotland'],WAL:['WAL','Wales'],GBWLS:['WAL','Wales'],NIR:['NIR','Northern Ireland'],GBNIR:['NIR','Northern Ireland']};
/** Eligibility uses recorded citizenship/nationality, never a club or region. */
export function nationalIdentity(nationality:unknown):Identity|null{
  if(typeof nationality!=='string')return null;
  const value=nationality.toUpperCase().trim(),association=associations[value];
  if(association)return {code:association[0],name:association[1],id:'nation:'+association[1]};
  // GB does not prove eligibility for any particular UK football association.
  if(!/^[A-Z]{2}$/.test(value)||['GB','UK','EU','UN','ZZ','XX'].includes(value))return null;
  try{const name=new Intl.DisplayNames(['en'],{type:'region'}).of(value);return name&&name!==value&&name!=='Unknown Region'?{code:value,name,id:'nation:'+name}:null;}catch{return null;}
}
export function eligibleForCountry(player:{nationality?:unknown},country:string){return nationalIdentity(player.nationality)?.code===nationalIdentity(country)?.code&&nationalIdentity(country)!==null;}
