export function clauseTerms(offer:any,sellerId:string|null,baseFee:number){
  const number=(key:string,max:number)=>{const n=offer[key]??0;if(!Number.isSafeInteger(n)||n<0||n>max)throw Error(`Invalid ${key} clause.`);return n;};
  const profitPercent=number('profitPercent',50),contributionPercent=number('contributionPercent',50),contributionMonths=number('contributionMonths',12),buybackFee=number('buybackFee',100000000),playingTime=number('playingTime',100);
  if((profitPercent||contributionPercent||buybackFee)&&!sellerId)throw Error('Selling-club clauses require a transfer from a club.');
  if(contributionPercent&&!contributionMonths)throw Error('Choose how long the selling club contributes to wages.');
  if(buybackFee&&buybackFee<baseFee)throw Error('A buy-back option must at least match the transfer fee.');
  const contribution=Math.round(offer.salary*contributionPercent/100);
  // A seller funds its wage contribution up front partly through a higher agreed fee;
  // sell-on and buy-back concessions reduce the present fee, never affordability checks.
  const fee=Math.max(0,Math.round(baseFee*(1-profitPercent*.004-(buybackFee ? .05 : 0)))+Math.round(contribution*contributionMonths*.65));
  return {profitPercent,contributionPercent,contributionMonths,contribution,buybackFee,playingTime,fee};
}
