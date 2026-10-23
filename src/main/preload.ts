import { contextBridge, ipcRenderer } from 'electron';

const api = {
  broadcast: {
    state:()=>ipcRenderer.invoke('broadcast:state'),
    onUpdate:(callback:(state:any)=>void)=>{
      const listener=(_:any,state:any)=>callback(state);ipcRenderer.on('broadcast:update',listener);
      return ()=>{ipcRenderer.removeListener('broadcast:update',listener);};
    },
  },
  // Database Operations (low-level)
  db: {
    query: (sql: string, ...params: any[]) => ipcRenderer.invoke('database:query', sql, params),
    run: (sql: string, ...params: any[]) => ipcRenderer.invoke('database:run', sql, params),
    all: (sql: string, ...params: any[]) => ipcRenderer.invoke('database:all', sql, params),
  },

  // Career Operations
  career: {
    create: (data: { managerName: string; teamId: string; region: string; difficulty: string;mode?:string;pathRank?:string;customOrgName?:string }) =>
      ipcRenderer.invoke('career:create', data),
    load: (id: string) => ipcRenderer.invoke('career:load', id),
    save: (id: string) => ipcRenderer.invoke('career:save', id),
    list: () => ipcRenderer.invoke('career:list'),
    delete: (id: string) => ipcRenderer.invoke('career:delete', id),
    pathTeams:(region?:string)=>ipcRenderer.invoke('career:pathTeams',region),
  },

  // Player Operations
  players: {
    getAll: () => ipcRenderer.invoke('players:getAll'),
    getById: (id: string) => ipcRenderer.invoke('players:getById', id),
    getByTeam: (teamId: string) => ipcRenderer.invoke('players:getByTeam', teamId),
    getFreeAgents: () => ipcRenderer.invoke('players:getFreeAgents'),
    update: (player: any) => ipcRenderer.invoke('players:update', player),
  },

  // Team Operations
  teams: {
    getSelectable:()=>ipcRenderer.invoke('teams:getSelectable'),
    getAll: () => ipcRenderer.invoke('teams:getAll'),
    getById: (id: string) => ipcRenderer.invoke('teams:getById', id),
  },

  // Competition & Fixtures
  competitions: {
    configureClubChampionship:(id:string,setup:import('./club-championship').ClubSetup)=>ipcRenderer.invoke('competitions:configureClubChampionship',id,setup),
    ceremony:(eventId?:string)=>ipcRenderer.invoke('competitions:ceremony',eventId),
    dismissCeremony:(id:string)=>ipcRenderer.invoke('competitions:dismissCeremony',id),
    getAll: () => ipcRenderer.invoke('competitions:getAll'),
    getById: (id: string) => ipcRenderer.invoke('competitions:getById', id),
    repairFormat:(id:string)=>ipcRenderer.invoke('competitions:repairFormat',id),
  },

  fixtures: {
    getByDate: (date: string) => ipcRenderer.invoke('fixtures:getByDate', date),
    getById: (id: string) => ipcRenderer.invoke('fixtures:getById', id),
    getUpcoming: (teamId: string, currentDate: string) => ipcRenderer.invoke('fixtures:getUpcoming', teamId, currentDate),
    updateResult: (id: string, homeScore: number, awayScore: number, status: string) =>
      ipcRenderer.invoke('fixtures:updateResult', id, homeScore, awayScore, status),
  },

  gameResults: {
    create: (result: any) => ipcRenderer.invoke('gameResults:create', result),
  },

  // Calendar
  calendar: {
    getEvents: (careerId: string, month?: string) => ipcRenderer.invoke('calendar:getEvents', careerId, month),
    advanceDay: (careerId: string) => ipcRenderer.invoke('calendar:advanceDay', careerId),
    advanceToEvent: (careerId: string) => ipcRenderer.invoke('calendar:advanceToEvent', careerId),
  },

  // Inbox
  inbox: {
    getAll: (careerId: string) => ipcRenderer.invoke('inbox:getAll', careerId),
    markRead: (id: string) => ipcRenderer.invoke('inbox:markRead', id),
    markAllRead: (careerId: string) => ipcRenderer.invoke('inbox:markAllRead',careerId),
    getUnreadCount: (careerId: string) => ipcRenderer.invoke('inbox:getUnreadCount', careerId),
  },

  // Statistics
  stats: {
    getPlayerLeaderboard: (stat: string, limit?: number) => ipcRenderer.invoke('stats:getPlayerLeaderboard', stat, limit),
    getTeamStandings: (competitionId: string) => ipcRenderer.invoke('stats:getTeamStandings', competitionId),
  },

  // Settings
  management: {
    simulation:(id:string,fixture:string)=>ipcRenderer.invoke('management:simulation',id,fixture),
    finances:(id:string)=>ipcRenderer.invoke('management:finances',id),
    scoutingRegions:(id:string)=>ipcRenderer.invoke('management:scoutingRegions',id),
    dispatchRegion:(id:string,region:string,months:number)=>ipcRenderer.invoke('management:dispatchRegion',id,region,months),
    approachAgent:(id:string,player:string,role:string)=>ipcRenderer.invoke('management:approachAgent',id,player,role),
    clubBranding:(id:string)=>ipcRenderer.invoke('management:clubBranding',id),
    saveClubBranding:(id:string,design:any)=>ipcRenderer.invoke('management:saveClubBranding',id,design),
    resetClubBranding:(id:string)=>ipcRenderer.invoke('management:resetClubBranding',id),
    squadGarage:(id:string)=>ipcRenderer.invoke('management:squadGarage',id),
    saveCarPreset:(id:string,player:string,preset:any)=>ipcRenderer.invoke('management:saveCarPreset',id,player,preset),
    resetCarPreset:(id:string,player:string)=>ipcRenderer.invoke('management:resetCarPreset',id,player),
    coordinateCars:(id:string)=>ipcRenderer.invoke('management:coordinateCars',id),
    copyCarPreset:(id:string,preset:any)=>ipcRenderer.invoke('management:copyCarPreset',id,preset),
    setDifficulty:(careerId:string,difficulty:string)=>ipcRenderer.invoke('management:setDifficulty',careerId,difficulty),
    chirpFeed: (careerId: string, options: any = {}) => ipcRenderer.invoke('management:chirpFeed', careerId, options),
    chirpUpdates: (careerId: string) => ipcRenderer.invoke('management:chirpUpdates', careerId),
    chirpProfile: (careerId: string, account: string) => ipcRenderer.invoke('management:chirpProfile', careerId, account),
    chirpThread: (careerId: string, post: string) => ipcRenderer.invoke('management:chirpThread', careerId, post),
    chirpFollow: (careerId: string, account: string) => ipcRenderer.invoke('management:chirpFollow', careerId, account),
    chirpReact: (careerId: string, post: string, type: string) => ipcRenderer.invoke('management:chirpReact', careerId, post, type),
    chirpPublish: (careerId: string, body: string, parent?: string) => ipcRenderer.invoke('management:chirpPublish', careerId, body, parent),
    chirpNotifications: (careerId: string, markRead?: boolean) => ipcRenderer.invoke('management:chirpNotifications', careerId, markRead),
    outgoingTransfers: (careerId: string) => ipcRenderer.invoke('management:outgoingTransfers', careerId),
    listForTransfer: (careerId: string, playerId: string, price: number, listed: boolean) => ipcRenderer.invoke('management:listForTransfer', careerId, playerId, price, listed),
    respondToOffer: (careerId: string, offerId: string, action: string, price?: number) => ipcRenderer.invoke('management:respondToOffer', careerId, offerId, action, price),
    dressingRoom: (careerId: string) => ipcRenderer.invoke('management:dressingRoom', careerId),
    replyToPlayer: (careerId: string, conversationId: string, response: string) => ipcRenderer.invoke('management:replyToPlayer', careerId, conversationId, response),
    chatWithPlayer: (careerId: string, playerId: string, topic: string) => ipcRenderer.invoke('management:chatWithPlayer', careerId, playerId, topic),
    teamTalks: (careerId: string, fixtureId: string) => ipcRenderer.invoke('management:teamTalks', careerId, fixtureId),
    giveTeamTalk: (careerId: string, fixtureId: string, phase: string, tone: string) => ipcRenderer.invoke('management:giveTeamTalk', careerId, fixtureId, phase, tone),
    overview: (careerId: string) => ipcRenderer.invoke('management:overview', careerId),
    training: (careerId: string) => ipcRenderer.invoke('management:training', careerId),
    saveTraining: (careerId: string, schedule: any[]) => ipcRenderer.invoke('management:saveTraining', careerId, schedule),
    allocateSkill: (careerId:string,playerId:string,skill:string) => ipcRenderer.invoke('management:allocateSkill',careerId,playerId,skill),
    pathOverview:(careerId:string)=>ipcRenderer.invoke('management:pathOverview',careerId),
    pathTutorial:(careerId:string,step:number)=>ipcRenderer.invoke('management:pathTutorial',careerId,step),
    pathRank:(careerId:string,rank:string)=>ipcRenderer.invoke('management:pathRank',careerId,rank),
    pathFormReward:(careerId:string,key:string,player:string,fixture:string)=>ipcRenderer.invoke('management:pathFormReward',careerId,key,player,fixture),
    seriesTimeout:(careerId:string,fixture:string,orders:Record<string,string>,tone:string)=>ipcRenderer.invoke('management:seriesTimeout',careerId,fixture,orders,tone),
    seriesTimeoutState:(careerId:string,fixture:string)=>ipcRenderer.invoke('management:seriesTimeoutState',careerId,fixture),
    activeSeriesTimeout:(careerId:string)=>ipcRenderer.invoke('management:activeSeriesTimeout',careerId),
    startSeriesTimeout:(careerId:string,fixture:string)=>ipcRenderer.invoke('management:startSeriesTimeout',careerId,fixture),
    setLineup: (careerId: string, players: string[]) => ipcRenderer.invoke('management:setLineup', careerId, players),
    tactics: (careerId: string) => ipcRenderer.invoke('management:tactics', careerId),
    saveTactics: (careerId: string, plan: any) => ipcRenderer.invoke('management:saveTactics', careerId, plan),
    scouting: (careerId: string) => ipcRenderer.invoke('management:scouting', careerId),
    dispatchScout: (careerId: string, target: string) => ipcRenderer.invoke('management:dispatchScout', careerId, target),
    signingQuote: (careerId: string, playerId: string) => ipcRenderer.invoke('management:signingQuote', careerId, playerId),
    sign: (careerId: string, playerId: string, offer: any) => ipcRenderer.invoke('management:sign', careerId, playerId, offer),
    shortlist: (careerId: string, playerId: string, add: boolean) => ipcRenderer.invoke('management:shortlist', careerId, playerId, add),
    social: (careerId: string) => ipcRenderer.invoke('management:social', careerId),
    supportPlayer: (careerId: string, postId: string) => ipcRenderer.invoke('management:supportPlayer', careerId, postId),
  },
  national: {
    status:()=>ipcRenderer.invoke('national:status'),
    appoint:(code:string)=>ipcRenderer.invoke('national:appoint',code),
    resign:()=>ipcRenderer.invoke('national:resign'),
    callUp:(ids:string[])=>ipcRenderer.invoke('national:callUp',ids),
    saveTactics:(plan:any)=>ipcRenderer.invoke('national:saveTactics',plan),
    match:(id:string)=>ipcRenderer.invoke('national:match',id),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),
  },

  // RLBot Integration
  rlbot: {
    testAudio: () => ipcRenderer.invoke('rlbot:testAudio'),
    detect: () => ipcRenderer.invoke('rlbot:detect'),
    botPlan: (config: any) => ipcRenderer.invoke('rlbot:botPlan', config),
    launch: (config: any) => ipcRenderer.invoke('rlbot:launch', config),
    status: () => ipcRenderer.invoke('rlbot:status'),
    confirmBakkesmod:(fixtureId:string,requestId:string)=>ipcRenderer.invoke('rlbot:confirmBakkesmod',fixtureId,requestId),
    testMatch: () => ipcRenderer.invoke('rlbot:testMatch'),
  },

  // System / Dialogs
  dialog: {
    openFile: (options?: any) => ipcRenderer.invoke('dialog:openFile', options),
    openDirectory: (options?: any) => ipcRenderer.invoke('dialog:openDirectory', options),
  },

  app: {
    getPath: (name: string) => ipcRenderer.invoke('app:getPath', name),
    playerInfo:()=>ipcRenderer.invoke('app:playerInfo'),
    integration:()=>ipcRenderer.invoke('app:integration'),
    saveIntegration:(values:{rocketLeague:string;botPack:string;aiRuntime:string;speechPython?:string;speechDevice?:string})=>ipcRenderer.invoke('app:saveIntegration',values),
    ready:()=>ipcRenderer.send('app:rendererReady'),
    startup:()=>ipcRenderer.invoke('app:startup'),
    onStartup:(callback:(state:any)=>void)=>{const listener=(_:unknown,state:any)=>callback(state);ipcRenderer.on('app:startupProgress',listener);return()=>ipcRenderer.removeListener('app:startupProgress',listener);},
    quit:()=>ipcRenderer.send('app:quit'),
    openLogs:()=>ipcRenderer.invoke('app:openLogs'),
    openLink:(url:string)=>ipcRenderer.invoke('app:openLink',url),
  },
  tutorial:{start:(mode:string)=>ipcRenderer.invoke('tutorial:start',mode),finish:(outcome:'completed'|'skipped')=>ipcRenderer.invoke('tutorial:finish',outcome)},
};

contextBridge.exposeInMainWorld('api', api);

export type ElectronAPI = typeof api;
