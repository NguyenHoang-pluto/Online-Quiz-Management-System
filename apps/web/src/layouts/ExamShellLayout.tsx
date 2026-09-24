import { Outlet } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth.store';

/**
 * Khung riêng cho sinh viên làm bài.
 *
 * Cố ý KHÔNG có sidebar quản trị: mockup Module 4 đang vẽ nhầm menu
 * "Ngân hàng câu hỏi" và "Quản trị & Danh mục" vào màn thi của sinh viên.
 * Giữ nguyên thì thí sinh nhìn thấy đường dẫn tới kho câu hỏi ngay lúc đang thi.
 */
export function ExamShellLayout() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-10 flex h-[52px] items-center justify-between border-b border-border-default bg-surface-card px-4 sm:px-6">
        <p className="font-bold text-primary">EduExam Pro</p>
        <div className="text-right">
          <p className="text-sm font-medium">{user?.fullName}</p>
          <p className="font-mono text-xs text-text-subdued">MSSV: {user?.code}</p>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
