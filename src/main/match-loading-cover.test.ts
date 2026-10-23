import {beforeEach,describe,expect,it,vi} from 'vitest';

const fake=vi.hoisted(()=>({windows:[] as any[],resolve:null as null|(()=>void)}));
vi.mock('electron',()=>({
  app:{getPath:()=>'/tmp'},
  BrowserWindow:class {
    gone=false;shown=false;handlers:Record<string,()=>void>={};bounds:any;
    constructor(){fake.windows.push(this);}
    loadFile(){return new Promise<void>(resolve=>{fake.resolve=resolve;});}
    setAlwaysOnTop(){}setIgnoreMouseEvents(){}focus(){}
    on(event:string,fn:()=>void){this.handlers[event]=fn;}
    setBounds(bounds:any){this.bounds=bounds;}
    show(){this.shown=true;}
    isDestroyed(){return this.gone;}
    close(){this.gone=true;this.handlers.closed?.();}
  },screen:{screenToDipRect:(_:any,b:any)=>b,getDisplayMatching:()=>({bounds:{x:1920,y:0,width:1920,height:1080}}),
    getCursorScreenPoint:()=>({x:0,y:0}),getDisplayNearestPoint:()=>({bounds:{x:0,y:0,width:1920,height:1080}})}
}));
vi.mock('node:fs',()=>({default:{existsSync:()=>false,writeFileSync:()=>{}}}));
import {MatchLoadingCover,matchLoadingHtml} from './match-loading-cover';

describe('match transition cover',()=>{
  beforeEach(()=>{fake.windows=[];fake.resolve=null;});
  it('preloads hidden and covers the game monitor only when requested',async()=>{
    const cover=new MatchLoadingCover();cover.prepare();
    const window=fake.windows[0];expect(window.shown).toBe(false);
    cover.show({x:2000,y:0,width:1366,height:768});fake.resolve?.();await Promise.resolve();
    expect(window.shown).toBe(true);expect(window.bounds.x).toBe(1920);
    cover.close();expect(window.gone).toBe(true);
  });
  it('does not reopen after match readiness closes a still-loading page',async()=>{
    const cover=new MatchLoadingCover();cover.show();const window=fake.windows[0];
    cover.close();fake.resolve?.();await Promise.resolve();
    expect(window.shown).toBe(false);expect(window.gone).toBe(true);
  });
  it('uses an indeterminate indicator rather than inventing a loading percentage',()=>{
    const html=matchLoadingHtml('data:image/png;base64,EXAMPLE');
    expect(html).toContain('object-fit:cover');expect(html).toContain('class="spinner"');
    expect(html).toContain('data:image/png;base64,EXAMPLE');expect(html).not.toContain('100% complete');
  });
});
