import config from '../../data/local-skill-progression.json';
import {botDifficulty} from './bot-difficulty';
export const CORE_SKILLS=config.skills;
export function coreSkills(attributes:any={},overall=50):Record<string,number>{
  return Object.fromEntries(CORE_SKILLS.map(s=>[s.id,s.attributes.reduce((n,key)=>{
    const value=attributes?.[key];return n+(value!=null&&Number.isFinite(Number(value))?Math.max(0,Math.min(100,Number(value))):overall);
  },0)/s.attributes.length]));
}
export function skillCost(value:number){return value>=90?3:value>=80?2:1;}
export function localSkillTier(difficulty:unknown,overall:number,skills:Record<string,number>){
  const mode=difficulty==='Path To Glory'?'Path To Glory':botDifficulty(difficulty);if(mode==='Hard')return null;
  const tiers=config.difficulties[mode],minimum=Math.min(...CORE_SKILLS.map(s=>skills[s.id]??overall));
  const tier=tiers.find(t=>overall>=t.cutoff&&minimum>=t.minimumSkill)!;
  const next=tiers.filter(t=>t.level!==tier.level&&t.cutoff>tier.cutoff).at(-1)||null;
  return {...tier,ceiling:tiers[0].level,next:next?{...next,missing:CORE_SKILLS.filter(s=>(skills[s.id]??overall)<next.minimumSkill).map(s=>s.label)}:null};
}
// Existing ratings are the anchor. Five net core-skill improvements earn one
// OVR; specialising in one skill cannot add more than that same average.
export function developedOverall(baseOverall:number,base:Record<string,number>,skills:Record<string,number>,potential:number){
  const gain=CORE_SKILLS.reduce((n,s)=>n+Math.max(0,(skills[s.id]??base[s.id])-base[s.id]),0);
  return Math.min(potential,baseOverall+Math.floor((gain+1e-8)/CORE_SKILLS.length));
}
