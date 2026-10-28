import type {AppDatabase} from './database';
import {v4 as uuid} from 'uuid';
import {addDays} from '../game/career-rules';
export const STAFF_ROLES=['Recruitment','Coaching','Player care'] as const;
export function staffDepartment(db:AppDatabase,c:any,role:string){
 const row=db.prepare('SELECT * FROM club_departments WHERE careerId=? AND role=?').get(c.id,role);
 const level=row?(row.effectiveDate<=c.currentDate?row.level:row.level-1):0;
 return {role,level,quality:Math.min(90,45+level*9),monthly:level*750,nextCost:(level+1)*6000,nextMonthly:(level+1)*750,pending:!!row&&row.effectiveDate>c.currentDate,effectiveDate:row?.effectiveDate};
}
export function clubStructure(db:AppDatabase,c:any,cash:number,net:number,expenses:number){
 const staff=STAFF_ROLES.map(role=>staffDepartment(db,c,role));
 const wages=staff.reduce((n,s)=>n+s.monthly,0);
 const committed=staff.reduce((n,s)=>n+s.monthly+(s.pending?750:0),0);
 return {staff,staffWages:wages,committedStaffWages:committed,netAfterStaff:net-wages,
   projections:[1,3,6,12].map(months=>({months,cash:Math.round(cash+(net-committed)*months)})),
   reserveTarget:Math.round((expenses+committed)*3),discretionaryCash:Math.max(0,Math.round(cash-(expenses+committed)*3)),
   policy:'Conservative forecast holds today’s recurring income and costs constant and includes approved future staff wages. Uncertain prize money, contract expiries and future transfers are excluded. Three months of operating costs is the recommended reserve.'};
}
export function hireDepartment(db:AppDatabase,c:any,role:string){
 if(!STAFF_ROLES.includes(role as any)||c.mode==='Path To Glory')throw Error('Choose a club department.');
 const staff=staffDepartment(db,c,role);
 if(staff.pending)throw Error('A recruitment search is already in progress for this department.');
 if(staff.level>=5)throw Error('The department is already at the highest available level.');
 const t=db.prepare('SELECT cashBalance,reputation FROM teams WHERE id=?').get(c.teamId);
 if(staff.level>=1+Math.floor((t.reputation||0)/25))throw Error('The board needs a stronger club reputation before approving that staffing level.');
 if(t.cashBalance<staff.nextCost)throw Error('The club cannot afford this recruitment search.');
 db.prepare('UPDATE teams SET cashBalance=cashBalance-? WHERE id=?').run(staff.nextCost,c.teamId);
 const effectiveDate=addDays(c.currentDate,7);
 db.prepare('INSERT OR REPLACE INTO club_departments VALUES(?,?,?,?)').run(c.id,role,staff.level+1,effectiveDate);
 db.prepare('INSERT INTO club_ledger VALUES(?,?,?,?,?,?,?)').run(uuid(),c.id,c.teamId,c.currentDate,'Staff recruitment',-staff.nextCost,role+' department; starts '+effectiveDate);
 return {success:true,effectiveDate};
}
