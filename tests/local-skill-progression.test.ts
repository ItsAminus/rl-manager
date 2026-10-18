import {it,expect} from 'vitest';
import {coreSkills,localSkillTier,developedOverall,skillCost} from '../src/game/local-skill-progression';
it('requires every core skill and OVR for a stronger policy, respecting difficulty ceilings',()=>{
  const skills={passing:89,dribbling:95,aerial:95,shooting:99,saving:95};
  expect(localSkillTier('Medium',99,skills)?.level).toBe('Platinum');
  skills.passing=90;expect(localSkillTier('Medium',99,skills)?.level).toBe('Diamond');
  expect(localSkillTier('Medium',93,skills)?.level).toBe('Platinum');
  expect(localSkillTier('Easy',99,skills)?.level).toBe('Gold');expect(localSkillTier('Hard',99,skills)).toBeNull();
});
it('keeps one specialist statistic from overriding missing fundamentals and handles old attribute gaps honestly',()=>{
  const skills=coreSkills({passing:60,groundControl:60,aerial:60,shooting:99,shotAccuracy:99,defense:60,goalkeeping:60},99);
  expect(localSkillTier('Medium',99,skills)?.level).toBe('Silver');
  expect(coreSkills({aerial:null,passing:0},80)).toMatchObject({aerial:80,passing:0,shooting:80});
  expect(localSkillTier('Medium',99,coreSkills({},99))?.level).toBe('Diamond');
});
it('uses five core improvements per OVR, increasing upgrade costs and respecting potential',()=>{
  const base=coreSkills({},80),skills={...base,shooting:84};
  expect(developedOverall(80,base,skills,90)).toBe(80);skills.saving=81;expect(developedOverall(80,base,skills,90)).toBe(81);
  expect(developedOverall(80,base,skills,80)).toBe(80);expect([79,80,89,90,99].map(skillCost)).toEqual([1,2,2,3,3]);
});
