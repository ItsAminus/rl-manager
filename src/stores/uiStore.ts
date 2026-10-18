import { create } from 'zustand';

interface UiState {
  sidebarCollapsed: boolean;
  notifications: any[];
  modalState: {
    isOpen: boolean;
    type: string | null;
    data: any;
  };
  
  toggleSidebar: () => void;
  addNotification: (notification: any) => void;
  clearNotifications: () => void;
  openModal: (type: string, data?: any) => void;
  closeModal: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  notifications: [{ id: 1, message: 'Welcome to RL Manager!' }],
  modalState: {
    isOpen: false,
    type: null,
    data: null,
  },

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  
  addNotification: (notification) => set((state) => ({ 
    notifications: [...state.notifications, notification] 
  })),
  
  clearNotifications: () => set({ notifications: [] }),
  
  openModal: (type, data = null) => set({ 
    modalState: { isOpen: true, type, data } 
  }),
  
  closeModal: () => set({ 
    modalState: { isOpen: false, type: null, data: null } 
  }),
}));
