import path from 'node:path';
export const handlers = ((globalThis as any).__rlPreviewHandlers ||= new Map());
export const ipcMain = { handle: (name: string, fn: any) => handlers.set(name, fn) };
export const lifecycle = ((globalThis as any).__rlPreviewLifecycle ||= new Map<string,Function[]>());
export const app = { getPath: () => path.join(process.cwd(), 'scratch', 'ui-preview-data'), getAppPath: () => process.cwd(),on:(name:string,fn:Function)=>lifecycle.set(name,[...(lifecycle.get(name)||[]),fn]) };
export const BrowserWindow:any = class {constructor(){throw new Error('Native windows disabled in isolated UI preview');}};
export const screen:any = {};
export const dialog = {};
