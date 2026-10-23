import { create } from 'zustand';
import { Career, Team, Player, Fixture, CalendarEvent, InboxItem } from '../types';

interface CareerState {
  nationalStatus:any;
  refreshNational:()=>Promise<void>;
  careerEnded: string | null;
  career: Career | null;
  currentDate: string;
  team: Team | null;
  roster: Player[];
  allTeams: Team[];
  isLoaded: boolean;
  upcomingFixtures: Fixture[];
  unreadInboxCount: number;
  loading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  createCareer: (data: { managerName: string; teamId: string; region: string; difficulty: string; customOrgName?: string;mode?:'Manager Career'|'Path To Glory';pathRank?:string }) => Promise<{ success: boolean; id?: string; error?: string }>;
  loadCareer: (id: string) => Promise<boolean>;
  saveCareer: () => Promise<void>;
  advanceDay: () => Promise<{ events: CalendarEvent[]; fixtures: Fixture[] } | null>;
  advanceToNextEvent: () => Promise<{ events: CalendarEvent[]; fixtures: Fixture[] } | null>;
  reloadRoster: () => Promise<void>;
  unloadCareer: () => void;
}

export const useCareerStore = create<CareerState>((set, get) => ({
  nationalStatus:null,
  refreshNational:async()=>{if(!get().career)return;const res=await window.api.national.status();if(res.error)throw Error(res.error);set({nationalStatus:res});},
  careerEnded: null,
  career: null,
  currentDate: '2025-09-01',
  team: null,
  roster: [],
  allTeams: [],
  isLoaded: false,
  upcomingFixtures: [],
  unreadInboxCount: 0,
  loading: false,
  error: null,

  initialize: async () => {
    try {
      if (typeof window !== 'undefined' && window.api?.teams) {
        const teams = await window.api.teams.getAll();
        set({ allTeams: teams });
      }
    } catch (err: any) {
      console.error('[CareerStore] Init error:', err);
    }
  },

  createCareer: async (data) => {
    set({ loading: true, error: null });
    try {
      if (window.api?.career) {
        const res = await window.api.career.create(data);
        if (res.success && res.id) {
          const loaded = await get().loadCareer(res.id);
          set({ loading: false });
          return { success: loaded, id: res.id };
        }
        set({ loading: false, error: res.error || 'Failed to create career' });
        return { success: false, error: res.error };
      }
      set({ loading: false });
      return { success: false, error: 'API unavailable' };
    } catch (err: any) {
      set({ loading: false, error: err.message });
      return { success: false, error: err.message };
    }
  },

  loadCareer: async (id: string) => {
    set({ loading: true, error: null });
    try {
      if (window.api?.career) {
        const res = await window.api.career.load(id);
        if (res.success && res.career) {
          const fixtures = await window.api.fixtures.getUpcoming(res.career.teamId, res.career.currentDate);
          const unreadCount = await window.api.inbox.getUnreadCount(id);
          const teams = await window.api.teams.getAll();
          const nationalStatus=await window.api.national.status();

          set({
            career: res.career,
            currentDate: res.career.currentDate,
            team: res.team,
            roster: res.players,
            allTeams: teams,
            nationalStatus:nationalStatus.error?null:nationalStatus,
            upcomingFixtures: fixtures,
            unreadInboxCount: unreadCount,
            isLoaded: true,
            loading: false,
          });
          return true;
        }
      }
      set({ loading: false, error: 'This career cannot be loaded. Dismissed careers cannot be resumed.' });
      return false;
    } catch (err: any) {
      set({ loading: false, error: err.message });
      return false;
    }
  },

  saveCareer: async () => {
    const { career } = get();
    if (!career || !window.api?.career) return;
    try {
      await window.api.career.save(career.id);
    } catch (err) {
      console.error('[CareerStore] Save error:', err);
    }
  },

  advanceDay: async () => {
    const { career } = get();
    if (!career || !window.api?.calendar) return null;
    try {
      const res = await window.api.calendar.advanceDay(career.id);
      if(res.careerEnded){set({careerEnded:res.reason,currentDate:res.newDate});return null;}
      if (res.success && res.newDate) {
        set({ currentDate: res.newDate, career: { ...career, currentDate: res.newDate }, error: null });
        // Refresh upcoming fixtures and roster fatigue
        const fixtures = await window.api.fixtures.getUpcoming(career.teamId, res.newDate);
        const unreadCount = await window.api.inbox.getUnreadCount(career.id);
        await get().reloadRoster();
        await get().refreshNational();
        set({ upcomingFixtures: fixtures, unreadInboxCount: unreadCount });
        return { events: res.events || [], fixtures: res.fixtures || [] };
      }
      set({ error: res.error || 'The calendar could not advance.' });
      return null;
    } catch (err) {
      console.error('[CareerStore] Advance day error:', err);
      return null;
    }
  },

  advanceToNextEvent: async () => {
    const { career } = get();
    if (!career || !window.api?.calendar) return null;
    try {
      const res = await window.api.calendar.advanceToEvent(career.id);
      if(res.careerEnded){set({careerEnded:res.reason,currentDate:res.newDate});return null;}
      if (res.success && res.newDate) {
        set({ currentDate: res.newDate, career: { ...career, currentDate: res.newDate }, error: null });
        const fixtures = await window.api.fixtures.getUpcoming(career.teamId, res.newDate);
        const unreadCount = await window.api.inbox.getUnreadCount(career.id);
        await get().reloadRoster();
        await get().refreshNational();
        set({ upcomingFixtures: fixtures, unreadInboxCount: unreadCount });
        return { events: res.events || [], fixtures: res.fixtures || [] };
      }
      set({ error: res.error || 'The calendar could not advance.' });
      return null;
    } catch (err) {
      console.error('[CareerStore] Advance to event error:', err);
      return null;
    }
  },

  reloadRoster: async () => {
    const { team, career } = get();
    if (!team || !window.api?.players) return;
    try {
      const players = await window.api.players.getByTeam(team.id);
      const refreshedTeam = await window.api.teams.getById(team.id);
      const unread = career ? await window.api.inbox.getUnreadCount(career.id) : 0;
      set({ roster: players, team: refreshedTeam || team, unreadInboxCount: unread });
    } catch (err) {
      console.error('[CareerStore] Reload roster error:', err);
    }
  },

  unloadCareer: () => {
    set({
      nationalStatus:null,
      careerEnded: null,
      career: null,
      currentDate: '2025-09-01',
      team: null,
      roster: [],
      isLoaded: false,
      upcomingFixtures: [],
      unreadInboxCount: 0,
    });
  },
}));
