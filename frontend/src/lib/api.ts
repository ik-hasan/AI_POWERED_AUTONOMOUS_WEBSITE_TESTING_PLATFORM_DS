import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
          localStorage.setItem('accessToken', data.data.accessToken);
          localStorage.setItem('refreshToken', data.data.refreshToken);
          original.headers.Authorization = `Bearer ${data.data.accessToken}`;
          return api(original);
        } catch {
          localStorage.clear();
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  register: (data: { email: string; password: string; name: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
};

export const projectApi = {
  list: (page = 1, limit = 20) => api.get('/projects', { params: { page, limit } }),
  get: (id: string) => api.get(`/projects/${id}`),
  create: (data: { name: string; description?: string }) => api.post('/projects', data),
  update: (id: string, data: { name?: string; description?: string }) => api.put(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
};

export const websiteApi = {
  list: (projectId: string) => api.get('/websites', { params: { projectId } }),
  get: (id: string) => api.get(`/websites/${id}`),
  create: (data: { projectId: string; name: string; url: string; description?: string }) =>
    api.post('/websites', data),
  update: (id: string, data: Partial<{ name: string; url: string; description: string }>) =>
    api.put(`/websites/${id}`, data),
  delete: (id: string) => api.delete(`/websites/${id}`),
};

export const testCaseApi = {
  list: (projectId: string, page = 1, search?: string) =>
    api.get('/test-cases', { params: { projectId, page, search } }),
  get: (id: string) => api.get(`/test-cases/${id}`),
  create: (data: object) => api.post('/test-cases', data),
  update: (id: string, data: object) => api.put(`/test-cases/${id}`, data),
  delete: (id: string) => api.delete(`/test-cases/${id}`),
  generate: (data: { projectId: string; websiteId: string; websiteUrl: string; prompt: string; title?: string }) =>
    api.post('/ai/generate', data),
  explore: (data: {
    projectId: string;
    websiteId: string;
    websiteUrl: string;
    prompt: string;
    title?: string;
    headless?: boolean;
  }) => api.post('/ai/explore', data),
  getExplore: (id: string) => api.get(`/ai/explore/${id}`),
  abortExplore: (id: string) => api.post(`/ai/explore/${id}/abort`),
};

export const executionApi = {
  start: (
    testCaseId: string,
    options?: { parallelWorkers?: number; maxRetries?: number; headless?: boolean }
  ) => api.post('/executions', { testCaseId, ...options }),
  list: (projectId?: string, page = 1) =>
    api.get('/executions', { params: { projectId, page } }),
  get: (id: string) => api.get(`/executions/${id}`),
  retry: (id: string) => api.post(`/executions/${id}/retry`),
  abort: (id: string) => api.post(`/executions/${id}/abort`),
};

export const reportApi = {
  list: (params: { projectId?: string; page?: number; search?: string; status?: string }) =>
    api.get('/reports', { params }),
  get: (id: string) => api.get(`/reports/${id}`),
  download: (id: string) => api.get(`/reports/${id}/download`, { responseType: 'blob' }),
  delete: (id: string) => api.delete(`/reports/${id}`),
};

export const analyticsApi = {
  get: (projectId?: string) => api.get('/analytics', { params: { projectId } }),
};

export default api;
