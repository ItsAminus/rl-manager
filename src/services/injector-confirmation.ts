// Each button belongs to exactly one bridge process and one startup request.
export class InjectorConfirmation {
  private pending?: {token:number;fixtureId:string;requestId:string;send:(text:string)=>Promise<void>;sending?:boolean};
  request(token:number,fixtureId:string,requestId:string,send:(text:string)=>Promise<void>){
    if(!/^[a-f0-9]{32}$/.test(requestId))return false;
    this.pending={token,fixtureId,requestId,send};return true;
  }
  async confirm(token:number,fixtureId:string,requestId:string){
    const value=this.pending;
    if(!value||value.token!==token||value.fixtureId!==fixtureId||value.requestId!==requestId||value.sending)
      throw Error('This startup prompt is no longer active. Wait for the current match status.');
    value.sending=true;
    try{
      await value.send(JSON.stringify({event:'CONFIRM_BAKKESMOD',requestId})+'\n');
      if(this.pending===value)this.pending=undefined;
    }catch(error){value.sending=false;throw error;}
  }
  clear(token:number){if(this.pending?.token===token)this.pending=undefined;}
}
