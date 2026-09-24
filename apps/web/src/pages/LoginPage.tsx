import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { useAuthStore, type AuthUser } from '@/features/auth/auth.store';

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ accessToken: string; user: AuthUser }>('/auth/login', {
        code,
        password,
      });
      return data;
    },
    onSuccess: (data) => {
      setSession(data.accessToken, data.user);
      navigate(data.user.role === 'STUDENT' ? '/ca-thi' : '/', { replace: true });
    },
    retry: false,
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate();
        }}
        className="w-full max-w-sm rounded-card border border-border-default bg-surface-card p-8 shadow-level1"
      >
        <h1 className="text-xl font-bold text-primary">EduExam Pro</h1>
        <p className="mt-1 mb-6 text-sm text-text-secondary">
          Hệ thống thi trắc nghiệm trực tuyến
        </p>

        <label className="mb-1 block text-xs font-medium text-text-secondary">
          MSSV / Mã giảng viên
        </label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="username"
          required
          className="mb-4 w-full rounded-default border border-border-default px-3 py-2 font-mono text-sm outline-none focus:border-secondary"
        />

        <label className="mb-1 block text-xs font-medium text-text-secondary">Mật khẩu</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="mb-5 w-full rounded-default border border-border-default px-3 py-2 text-sm outline-none focus:border-secondary"
        />

        {login.isError && (
          <p className="mb-4 rounded-default bg-danger-bg px-3 py-2 text-sm text-danger">
            Mã đăng nhập hoặc mật khẩu không đúng
          </p>
        )}

        <button
          type="submit"
          disabled={login.isPending}
          className="w-full rounded-default bg-primary py-2.5 text-sm font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
        >
          {login.isPending ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  );
}
