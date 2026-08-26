import axios, { AxiosError, InternalAxiosRequestConfig } from'axios';
import Constants from'expo-constants';
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from'@/auth/tokenStorage';

const { apiBaseUrl } = (Constants.expoConfig?.extra ?? {}) as {
 apiBaseUrl?: string;
};

export const api = axios.create({
 baseURL: apiBaseUrl ?? 'https://api.dev.lioris.app',
 timeout: 15000,
});

// Attach the access token to every request.
api.interceptors.request.use(async (config) => {
 const token = await getAccessToken();
 if (token) {
 config.headers.set?.('Authorization', `Bearer ${token}`) ??
 // fall back for older axios header shapes
 ((config.headers as Record<string, string>).Authorization = `Bearer ${token}`);
 }
 return config;
});

let isRefreshing = false;
let pendingQueue: Array<(token: string | null) => void> = [];

function subscribeTokenRefresh(cb: (token: string | null) => void) {
 pendingQueue.push(cb);
}

function onRefreshed(token: string | null) {
 pendingQueue.forEach((cb) => cb(token));
 pendingQueue = [];
}

// On a 401, try exactly one refresh, then retry the original request once.
// This matches PRD 12.1: backend is the source of truth for auth; the
// client only reacts to what the server tells it.
api.interceptors.response.use(
 (response) => response,
 async (error: AxiosError) => {
 const originalRequest = error.config as InternalAxiosRequestConfig & {
 _retry?: boolean;
 };

 if (error.response?.status !== 401 || originalRequest._retry) {
 return Promise.reject(error);
 }

 if (isRefreshing) {
 return new Promise((resolve, reject) => {
 subscribeTokenRefresh((token) => {
 if (!token) return reject(error);
 originalRequest._retry = true;
 originalRequest.headers = originalRequest.headers ?? {};
 (originalRequest.headers as Record<string, string>).Authorization = `Bearer ${token}`;
 resolve(api(originalRequest));
 });
 });
 }

 originalRequest._retry = true;
 isRefreshing = true;

 try {
 const refreshToken = await getRefreshToken();
 if (!refreshToken) throw error;

 const { data } = await axios.post(`${apiBaseUrl}/auth/refresh`, { refreshToken });
 await setTokens(data.accessToken, data.refreshToken);
 onRefreshed(data.accessToken);

 originalRequest.headers = originalRequest.headers ?? {};
 (originalRequest.headers as Record<string, string>).Authorization = `Bearer ${data.accessToken}`;
 return api(originalRequest);
 } catch (refreshError) {
 onRefreshed(null);
 await clearTokens();
 return Promise.reject(refreshError);
 } finally {
 isRefreshing = false;
 }
 },
);
