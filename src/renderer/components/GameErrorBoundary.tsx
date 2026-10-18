import React from 'react';
export class GameErrorBoundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{
  state={failed:false};static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:Error){console.error('Screen failed',error);}
  render(){return this.state.failed?<main style={{margin:'auto',padding:50,maxWidth:650}}><p style={{color:'#ffbc58'}}>RL MANAGER</p><h1>This screen needs a fresh start.</h1><p style={{margin:'20px 0',lineHeight:1.7}}>Your saved careers are kept safe. Reopen the main menu and load your career to continue.</p><button className="btn btn-primary" onClick={()=>{location.hash='/';location.reload();}}>Reopen main menu</button><button className="btn btn-secondary" onClick={()=>window.api.app.openLogs()}>Open support logs</button></main>:this.props.children;}
}
