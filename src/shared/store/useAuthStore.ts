
import { create } from 'zustand';
import { UserInfo } from '../types';

interface AuthState {
  user: UserInfo | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: UserInfo, token: string) => void;
  logout: () => void;
}

const getStoredUser = (): UserInfo | null => {
  try {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

export const useAuthStore = create<AuthState>((set) => ({
  user: getStoredUser(),
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  login: (user, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ user, token, isAuthenticated: true });
  },
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ user: null, token: null, isAuthenticated: false });
  },
}));
