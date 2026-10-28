import type {AppDatabase} from './database';
import {REGION_CODE_MAP} from '../types';
export const REGIONAL_NEWS_SETTING='regional_news_only';
export function regionalNewsOnly(db:AppDatabase){return db.prepare('SELECT value FROM settings WHERE key=?').get(REGIONAL_NEWS_SETTING)?.value==='true';}
export function regionAliases(region:string){
  const normal=REGION_CODE_MAP[region]||region;
  return [...new Set([normal,region,...Object.entries(REGION_CODE_MAP).filter(([,v])=>v===normal).map(([k])=>k),...(normal==='MENA'?['Middle East & North Africa']:[])])];
}
export const sqlString=(value:string)=>`'${value.replace(/'/g,"''")}'`;
export const regionSql=(region:string)=>regionAliases(region).map(sqlString).join(',');
/** Match/news context takes precedence over a commentator's home region. */
export function regionalPostSql(region:string,p='p',a='a'){
  const regions=regionSql(region);
  return `(CASE WHEN ${p}.fixtureId IS NOT NULL THEN EXISTS(SELECT 1 FROM fixtures rf JOIN teams rh ON rh.id=rf.homeTeamId JOIN teams rv ON rv.id=rf.awayTeamId WHERE rf.id=${p}.fixtureId AND (rh.region IN (${regions}) OR rv.region IN (${regions})))
    WHEN ${p}.sourceKey LIKE 'market:%' THEN EXISTS(SELECT 1 FROM market_stories ms LEFT JOIN teams mt ON mt.id=ms.fromTeamId JOIN teams mb ON mb.id=ms.toTeamId WHERE ms.careerId=${p}.careerId AND ms.id=substr(${p}.sourceKey,8,instr(substr(${p}.sourceKey,8),':')-1) AND (mt.region IN (${regions}) OR mb.region IN (${regions})))
    WHEN ${p}.sourceKey LIKE 'transfer:%' THEN EXISTS(SELECT 1 FROM transfers tr LEFT JOIN teams tf ON tf.id=tr.fromTeamId JOIN teams tt ON tt.id=tr.toTeamId WHERE tr.careerId=${p}.careerId AND tr.id=substr(${p}.sourceKey,10) AND (tf.region IN (${regions}) OR tt.region IN (${regions})))
    ELSE (${a}.region IN (${regions}) OR ${p}.accountId='manager' OR ${p}.topic IN (${regions})) END)`;
}
