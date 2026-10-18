import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({windows:[] as any[],handle:vi.fn(),dip:vi.fn((_:any,b:any)=>({...b,x:b.x/2,y:b.y/2,width:b.width/2,height:b.height/2}))}));
vi.mock('electron',()=>({ipcMain:{handle:mock.handle},screen:{screenToDipRect:mock.dip},BrowserWindow:class {
  options:any;visible=false;bounds={x:0,y:0,width:840,height:430};events:any={};
  webContents={send:vi.fn()};setIgnoreMouseEvents=vi.fn();setAlwaysOnTop=vi.fn();loadURL=vi.fn().mockResolvedValue(undefined);loadFile=vi.fn().mockResolvedValue(undefined);
  hide=vi.fn(()=>this.visible=false);showInactive=vi.fn(()=>this.visible=true);getBounds=()=>this.bounds;setBounds=vi.fn(b=>this.bounds=b);isVisible=()=>this.visible;
  on=(name:string,fn:any)=>this.events[name]=fn;close=vi.fn(()=>this.events.closed?.());
  constructor(options:any){this.options=options;mock.windows.push(this);}
}}));
import {BroadcastOverlay} from '../src/main/broadcast-overlay';
describe('Broadcast overlay lifecycle',()=>{
  beforeEach(()=>{mock.windows.length=0;vi.clearAllMocks();});
  const packet={blue:2,orange:1,remaining:235,foreground:true,bounds:{x:100,y:200,width:1920,height:1080},scoreboard:false};
  it('uses a transparent click-through window, scales to game bounds and never takes focus',()=>{
    const overlay=new BroadcastOverlay();overlay.prepare({event:'Regional'});const w=mock.windows[0];
    expect(w.options).toMatchObject({transparent:true,focusable:false,show:false,skipTaskbar:true});
    expect(w.setIgnoreMouseEvents).toHaveBeenCalledWith(true);
    overlay.update(packet);expect(w.showInactive).toHaveBeenCalledOnce();
    expect(w.bounds).toEqual({x:110,y:108,width:840,height:106});
    overlay.update({...packet,scoreboard:true});expect(w.bounds.height).toBe(520);
    expect(w.webContents.send).toHaveBeenLastCalledWith('broadcast:update',expect.objectContaining({blue:2,remaining:235,context:{event:'Regional'}}));
  });
  it('hides when the game loses focus, ends or supplies unusable bounds; rejects corrupt clocks',()=>{
    const overlay=new BroadcastOverlay();overlay.prepare({});const w=mock.windows[0];overlay.update(packet);
    overlay.update({...packet,foreground:false});expect(w.visible).toBe(false);
    overlay.update(packet);overlay.update({...packet,ended:true});expect(w.visible).toBe(false);
    overlay.update(packet);overlay.update({...packet,bounds:null});expect(w.visible).toBe(false);
    const calls=w.webContents.send.mock.calls.length;overlay.update({...packet,remaining:NaN});expect(w.webContents.send.mock.calls.length).toBe(calls);
  });
  it('closes the previous match window and clears state on shutdown',()=>{
    const overlay=new BroadcastOverlay();overlay.prepare({event:'Game 1'});const old=mock.windows[0];
    overlay.prepare({event:'Game 2'});expect(old.close).toHaveBeenCalledOnce();
    overlay.close();expect(mock.windows[1].close).toHaveBeenCalledOnce();
    expect(mock.handle.mock.calls[0][1]()).toBe(null);
  });
});
