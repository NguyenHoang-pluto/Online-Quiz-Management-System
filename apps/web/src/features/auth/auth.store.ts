import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Role } from '@eduexam/shared';

export interface AuthUser {
  id: string;
  code: string;
  fullName: string;
  role: Role;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  setSession: (token: string, user: AuthUser) => void;
  setAccessToken: (token: string) => void;
  clear: () => void;
}

/**
 * Chỉ lưu thông tin hiển thị của người dùng vào localStorage.
 * Access token giữ trong bộ nhớ, refresh token nằm trong cookie httpOnly —
 * như vậy XSS không đọc được token.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      setSession: (accessToken, user) => set({ accessToken, user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      clear: () => set({ accessToken: null, user: null }),
    }),
    {
      name: 'eduexam-auth',
      partialize: (state) => ({ user: state.user }),
    },
  ),
);
