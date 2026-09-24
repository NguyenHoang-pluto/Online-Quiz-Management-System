import { useNavigate } from 'react-router-dom';
import { api } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/auth.store';

export function LogoutButton() {
  const navigate = useNavigate();
  const clear = useAuthStore((s) => s.clear);

  const logout = async () => {
    // Gọi server để thu hồi token; lỗi mạng cũng vẫn xóa phiên phía trình duyệt
    try {
      await api.post('/auth/logout');
    } catch {
      /* bỏ qua */
    }
    clear();
    navigate('/dang-nhap', { replace: true });
  };

  return (
    <button
      onClick={logout}
      className="rounded-default border border-border-default px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-surface-hover"
    >
      Đăng xuất
    </button>
  );
}
