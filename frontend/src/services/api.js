import axios from 'axios';

// In-memory access token storage
let inMemoryToken = null;
let refreshSubscribers = [];
let isRefreshing = false;

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Crucial for passing HTTP-only cookies (refresh_token)
  headers: {
    'Content-Type': 'application/json',
  },
});

export const setAccessToken = (token) => {
  inMemoryToken = token;
};

export const getAccessToken = () => {
  return inMemoryToken;
};

// Request Interceptor: Attach access token if present
api.interceptors.request.use(
  (config) => {
    if (inMemoryToken) {
      config.headers.Authorization = `Bearer ${inMemoryToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Helper to queue requests while token is refreshing
const subscribeTokenRefresh = (callback) => {
  refreshSubscribers.push(callback);
};

const onRefreshed = (token) => {
  refreshSubscribers.map((callback) => callback(token));
  refreshSubscribers = [];
};

// Response Interceptor: Catch 401 and attempt silent refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const originalRequest = config;

    // If unauthorized and we haven't already retried this request
    if (response && response.status === 401 && !originalRequest._retry) {
      // Avoid infinite retries on login endpoint
      if (originalRequest.url.includes('/auth/login')) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // If refresh is already in progress, wait for it and replay request
        return new Promise((resolve) => {
          subscribeTokenRefresh((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Call refresh endpoint to rotate tokens
        const refreshResponse = await axios.post(
          `${API_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        const newAccessToken = refreshResponse.data.access_token;
        setAccessToken(newAccessToken);
        onRefreshed(newAccessToken);
        isRefreshing = false;

        // Replay original request
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        setAccessToken(null);
        refreshSubscribers = [];
        
        // Dispatch logout event for AuthContext to pick up
        window.dispatchEvent(new Event('auth-logout'));
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
