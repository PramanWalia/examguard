import axios from 'axios';

import { useClockStore } from '../store/clockStore';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  withCredentials: true,
});

let getAccessToken = () => null;
let saveRefreshedToken = () => {};
let clearSession = () => {};
let refreshPromise = null;

export const configureAuthClient = ({ getToken, onTokenRefreshed, onAuthenticationFailed }) => {
  getAccessToken = getToken;
  saveRefreshedToken = onTokenRefreshed;
  clearSession = onAuthenticationFailed;
};

const refreshAccessToken = async () => {
  // Concurrent 401s must share one refresh request. Otherwise rotation races itself.
  if (!refreshPromise) {
    refreshPromise = apiClient
      .post('/auth/refresh', undefined, { skipAuth: true, skipAuthRefresh: true })
      .then((response) => {
        const accessToken = response.data?.data?.accessToken;
        if (!accessToken) throw new Error('Refresh response did not contain an access token.');
        saveRefreshedToken(accessToken);
        return accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

const authorizationValue = (accessToken) => `Bearer ${accessToken}`;

apiClient.interceptors.request.use((config) => {
  if (!config.skipAuth) {
    const accessToken = getAccessToken();
    if (accessToken) {
      config.headers = config.headers || {};
      config.headers.Authorization = authorizationValue(accessToken);
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    // Attempt and monitor responses carry the authoritative clock. Sync on every response.
    const serverTime = response.data?.data?.serverTime || response.data?.meta?.serverTime;
    if (serverTime) useClockStore.getState().sync(serverTime);
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const isUnauthorized = error.response?.status === 401;

    if (!isUnauthorized || !originalRequest || originalRequest._retry || originalRequest.skipAuthRefresh) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;
    try {
      const accessToken = await refreshAccessToken();
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = authorizationValue(accessToken);
      return apiClient(originalRequest);
    } catch (refreshError) {
      clearSession();
      return Promise.reject(refreshError);
    }
  },
);

export const unwrap = (response) => response.data?.data;
export const unwrapMeta = (response) => response.data?.meta;

export default apiClient;
