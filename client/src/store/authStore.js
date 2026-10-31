import { create } from 'zustand';

import apiClient, { configureAuthClient, unwrap } from '../api/client';

const initialState = {
  user: null,
  accessToken: null,
  isBootstrapping: true,
  isLoading: false,
};

export const useAuthStore = create((set, get) => ({
  ...initialState,

  setSession: ({ user, accessToken }) => set({ user, accessToken, isBootstrapping: false }),
  setAccessToken: (accessToken) => set({ accessToken }),
  clearSession: () => set({ ...initialState, isBootstrapping: false }),

  login: async (credentials) => {
    set({ isLoading: true });
    try {
      const response = await apiClient.post('/auth/login', credentials, { skipAuthRefresh: true });
      const { user, accessToken } = unwrap(response);
      set({ user, accessToken, isLoading: false, isBootstrapping: false });
      return user;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (registration) => {
    set({ isLoading: true });
    try {
      const response = await apiClient.post('/auth/register', registration, { skipAuthRefresh: true });
      const { user, accessToken } = unwrap(response);
      set({ user, accessToken, isLoading: false, isBootstrapping: false });
      return user;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  // A reload starts with no access token. The httpOnly refresh cookie is the only persistent credential.
  bootstrap: async () => {
    set({ isBootstrapping: true });
    try {
      const refreshResponse = await apiClient.post('/auth/refresh', undefined, {
        skipAuth: true,
        skipAuthRefresh: true,
      });
      const accessToken = unwrap(refreshResponse).accessToken;
      set({ accessToken });

      const meResponse = await apiClient.get('/auth/me');
      set({ user: unwrap(meResponse), isBootstrapping: false });
    } catch {
      get().clearSession();
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await apiClient.post('/auth/logout', undefined, { skipAuthRefresh: true });
    } finally {
      set({ ...initialState, isBootstrapping: false, isLoading: false });
    }
  },
}));

configureAuthClient({
  getToken: () => useAuthStore.getState().accessToken,
  onTokenRefreshed: (accessToken) => useAuthStore.getState().setAccessToken(accessToken),
  onAuthenticationFailed: () => useAuthStore.getState().clearSession(),
});
