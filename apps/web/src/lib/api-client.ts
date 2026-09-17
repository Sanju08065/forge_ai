import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env['VITE_API_URL'] ?? '',
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token from localStorage
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('forgeai_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 — clear token
apiClient.interceptors.response.use(
  (res) => res,
  (err: unknown) => {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      localStorage.removeItem('forgeai_token');
    }
    return Promise.reject(err);
  }
);
