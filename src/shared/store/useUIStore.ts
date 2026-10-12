
import { create } from 'zustand';

interface UIState {
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  toggleSidebar: () => void;
  toggleMobileSidebar: () => void;
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleMobileSidebar: () => set((state) => ({ mobileSidebarOpen: !state.mobileSidebarOpen })),
  openMobileSidebar: () => set({ mobileSidebarOpen: true }),
  closeMobileSidebar: () => set({ mobileSidebarOpen: false }),
}));
