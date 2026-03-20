import { create } from 'zustand';
import { apiClient } from '../lib/api-client.js';

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  passwordRequired: boolean;
  setToken: (token: string) => void;
  clearToken: () => void;
  setPasswordRequired: (required: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: sessionStorage.getItem('com.twle.vantage.token'),
  isAuthenticated: sessionStorage.getItem('com.twle.vantage.token') !== null,
  passwordRequired: false,

  setToken: (token: string) => {
    apiClient.setToken(token);
    set({ token, isAuthenticated: true });
  },

  clearToken: () => {
    apiClient.clearToken();
    set({ token: null, isAuthenticated: false });
  },

  setPasswordRequired: (required: boolean) => {
    set({ passwordRequired: required });
  },
}));
