import {it,expect} from 'vitest';
import {timeoutOpportunity,timeoutRoll} from '../src/main/series-timeouts';
const game=(blueScore:number,orangeScore:number)=>({blueScore,orangeScore});
it('keeps a BO5 timeout after a close opening loss, but considers a four-goal defeat',()=>{
 expect(timeoutOpportunity([game(3,2)],1,0,5).chance).toBe(0);
 expect(timeoutOpportunity([game(6,2)],1,0,5).chance).toBeGreaterThan(0);
 expect(timeoutOpportunity([game(6,2)],1,0,5).chance).toBeLessThan(1);
 expect(timeoutOpportunity([game(10,1)],1,0,5).chance).toBe(1);
});
it('increases urgency for repeated defeats and elimination without calling while ahead or level',()=>{
 expect(timeoutOpportunity([game(3,2),game(4,2)],2,0,5).chance).toBe(1);
 expect(timeoutOpportunity([game(3,2)],1,0,3).chance).toBeGreaterThan(0);
 expect(timeoutOpportunity([game(3,2),game(1,2)],1,1,5).chance).toBe(0);
 expect(timeoutOpportunity([game(1,2),game(1,2),game(1,2)],0,3,7).chance).toBe(0);
});
it('varies moderate blowout decisions between series, with no reroll on repeated polling',()=>{
 const chance=timeoutOpportunity([game(6,2)],1,0,5).chance;
 const decisions=Array.from({length:100},(_,i)=>timeoutRoll('career:fixture-'+i+':1')<chance);
 expect(decisions.filter(Boolean).length).toBeGreaterThan(20);expect(decisions.filter(Boolean).length).toBeLessThan(80);
 expect(timeoutRoll('same:fixture:1')).toBe(timeoutRoll('same:fixture:1'));
});
