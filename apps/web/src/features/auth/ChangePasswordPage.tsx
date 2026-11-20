import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { Button, Card, ErrorBox, Input, PageHeader } from '@/shared/components/ui';
import { useAuthStore } from './auth.store';
import { validateChangePassword } from './passwordRules';

/** Chức năng 1.3 — tự đổi mật khẩu. Dùng chung cho giảng viên và sinh viên. */
export function ChangePasswordPage() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [done, setDone] = useState(false);

  const change = useMutation({
    retry: false,
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api.post('/auth/change-password', body),
    onSuccess: () => setDone(true),
  });

  const validationError = validateChangePassword(
    currentPassword,
    newPassword,
    confirmPassword,
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (validationError) return;
    change.mutate({ currentPassword, newPassword });
  };

  if (done) {
    return (
      <Card className="mx-auto max-w-lg p-6">
        <h1 className="text-lg font-semibold text-primary">Đổi mật khẩu thành công</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Mọi phiên đăng nhập cũ đã bị thu hồi. Vui lòng đăng nhập lại với mật khẩu mới.
        </p>
        <Button
          className="mt-5 w-full"
          onClick={() => {
            useAuthStore.getState().clear();
            navigate('/dang-nhap');
          }}
        >
          Đăng nhập lại
        </Button>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Đổi mật khẩu" subtitle="Mật khẩu mới có ít nhất 8 ký tự, gồm hoa, thường và số" />
      <Card className="p-6">
        <form className="space-y-4" onSubmit={submit}>
          <Input
            label="Mật khẩu hiện tại"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <Input
            label="Mật khẩu mới"
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Input
            label="Xác nhận mật khẩu mới"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {validationError && <p className="text-xs text-danger">{validationError}</p>}
          {change.isError && <ErrorBox error={change.error} />}
          <Button type="submit" className="w-full" disabled={!!validationError || change.isPending}>
            {change.isPending ? 'Đang lưu...' : 'Lưu mật khẩu mới'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
