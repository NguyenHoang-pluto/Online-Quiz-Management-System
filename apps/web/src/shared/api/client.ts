import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/features/auth/auth.store';

export const api = axios.create({
  baseURL: '/api/v1',
  // Bắt buộc, vì refresh token nằm trong cookie httpOnly
  withCredentials: true,
  timeout: 15_000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Access token sống 15 phút. Khi hết hạn, tự động gọi /auth/refresh một lần
 * rồi phát lại request — sinh viên đang thi không bị đá ra giữa chừng.
 *
 * Nhiều request cùng hết hạn một lúc thì chỉ gọi refresh đúng một lần,
 * các request còn lại xếp hàng chờ.
 */
let refreshing: Promise<string> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };

    if (error.response?.status !== 401 || original?._retried) {
      return Promise.reject(error);
    }
    if (original.url?.includes('/auth/refresh') || original.url?.includes('/auth/login')) {
      useAuthStore.getState().clear();
      return Promise.reject(error);
    }

    original._retried = true;

    refreshing ??= api
      .post<{ accessToken: string }>('/auth/refresh')
      .then((res) => {
        useAuthStore.getState().setAccessToken(res.data.accessToken);
        return res.data.accessToken;
      })
      .finally(() => {
        refreshing = null;
      });

    try {
      const token = await refreshing;
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch (e) {
      useAuthStore.getState().clear();
      window.location.href = '/dang-nhap';
      return Promise.reject(e);
    }
  },
);
