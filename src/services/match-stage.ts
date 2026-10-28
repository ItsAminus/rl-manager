/** Use recorded stage metadata, never infer a knockout round from fixture number. */
export function matchStageLabel(stage='',group='',label='',round?:number){
  const value=(label||stage||'').replace(/_/g,' ').trim();
  if(/group/i.test(stage+' '+label)){
    const letter=group||value.match(/group\s+([A-Z0-9]{1,2})\b/i)?.[1];
    return letter?`Group stage · Group ${letter.replace(/^group\s+/i,'')}`:'Group stage · Group not recorded';
  }
  if(/(?:round\s+of\s+16|last\s+16|ro16)/i.test(value))return 'Round of 16';
  if(/quarter/i.test(value))return 'Quarterfinal';
  if(/semi/i.test(value)&&!/upper|lower/i.test(value))return 'Semifinal';
  if(/^(?:grand\s+)?finals?(?:\s|$)/i.test(value))return 'Final';
  if(value)return value.replace(/\b\w/g,c=>c.toUpperCase());
  return round?`Round ${round}`:'Stage not recorded';
}
export function isChampionshipFinal(label:string){return label==='Final';}
