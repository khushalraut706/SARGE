import axios from 'axios';

const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api',
  timeout: 30000,
});

// Attach JWT token to all requests
API.interceptors.request.use(config => {
  const token = localStorage.getItem('sar_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
API.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('sar_token');
      localStorage.removeItem('sar_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const authAPI = {
  login: (data) => API.post('/auth/login', data),
  register: (data) => API.post('/auth/register', data),
  me: () => API.get('/auth/me'),
  updateProfile: (data) => API.patch('/auth/profile', data),
  changePassword: (data) => API.post('/auth/change-password', data),
};

// Transactions
export const transactionsAPI = {
  upload: (formData) => API.post('/transactions/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  }),
  manual: (data) => API.post('/transactions/manual', data),
  list: (params) => API.get('/transactions', { params }),
  get: (id) => API.get(`/transactions/${id}`),
  batch: (batchId) => API.get(`/transactions/batch/${batchId}`),
};

// SAR
export const sarAPI = {
  generate: (data) => API.post('/sar/generate', data),
  list: (params) => API.get('/sar', { params }),
  get: (id) => API.get(`/sar/${id}`),
  update: (id, data) => API.patch(`/sar/${id}`, data),
  delete: (id) => API.delete(`/sar/${id}`),
  downloadPDF: (id, filename) => API.get(`/sar/${id}/pdf`, { responseType: 'blob' }).then(res => {
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `${id}.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  }),
  downloadText: (id, filename) => API.get(`/sar/${id}/text`, { responseType: 'blob' }).then(res => {
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `${id}.txt`;
    a.click();
    window.URL.revokeObjectURL(url);
  }),
};

// Dashboard
export const dashboardAPI = {
  stats: () => API.get('/dashboard/stats'),
};

// Admin
export const adminAPI = {
  stats: () => API.get('/admin/stats'),
  users: () => API.get('/admin/users'),
  updateUser: (id, data) => API.patch(`/admin/users/${id}`, data),
  sars: (params) => API.get('/admin/sars', { params }),
};

export default API;
