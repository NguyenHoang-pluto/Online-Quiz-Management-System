import { NavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth.store';
import { LogoutButton } from './LogoutButton';

const NAV = [
  { to: '/danh-muc', label: 'Môn học & Chương', hint: 'Danh mục, kho câu hỏi', module: 1 },
  { to: '/lop-hoc-phan', label: 'Lớp học phần', hint: 'Gán sinh viên vào lớp', module: 1 },
  { to: '/tai-khoan', label: 'Tài khoản', hint: 'Import sinh viên từ Excel', module: 1, adminOnly: true },
  { to: '/ngan-hang-cau-hoi', label: 'Ngân hàng câu hỏi', hint: 'LaTeX/KaTeX, 3 mức độ', module: 2 },
  { to: '/de-thi', label: 'Đề thi & Ma trận', hint: 'Ma trận đề, chính sách giám sát', module: 3 },
  { to: '/giam-sat', label: 'Giám sát toàn thể', hint: 'Mọi ca thi đang diễn ra', module: 5 },
];

/** Khung cho phân hệ quản trị và giảng dạy. KHÔNG dùng cho màn làm bài. */
export function DashboardLayout() {
  const user = useAuthStore((s) => s.user);
  const items = NAV.filter((n) => !n.adminOnly || user?.role === 'ADMIN');

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r border-border-default bg-surface-card p-4 lg:block">
        <div className="mb-6 px-2">
          <p className="font-bold text-primary">EduExam Pro</p>
          <p className="text-xs text-text-subdued">
            {user?.role === 'ADMIN' ? 'Phân hệ quản trị' : 'Phân hệ giảng dạy'}
          </p>
        </div>
        <nav className="space-y-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block rounded-default px-3 py-2 text-sm transition ${
                  isActive
                    ? 'bg-selected-bg font-semibold text-primary'
                    : 'text-text-secondary hover:bg-surface-hover'
                }`
              }
            >
              <span className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-text-subdued">M{item.module}</span>
                {item.label}
              </span>
              <span className="block text-[11px] text-text-subdued">{item.hint}</span>
            </NavLink>
          ))}
        </nav>

        <p className="mt-6 px-3 text-[11px] text-text-subdued">
          Báo cáo và phổ điểm mở từ trang chi tiết của từng đề thi.
        </p>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex h-14 items-center gap-3 border-b border-border-default bg-surface-card px-4 sm:px-6">
          <NavLink to="/de-thi" className="font-bold text-primary lg:hidden">
            EduExam Pro
          </NavLink>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium">{user?.fullName}</p>
              <p className="font-mono text-[11px] text-text-subdued">
                {user?.code} · {user?.role === 'ADMIN' ? 'Quản trị viên' : 'Giảng viên'}
              </p>
            </div>
            <LogoutButton />
          </div>
        </header>

        {/* Thanh điều hướng thu gọn cho màn hình nhỏ */}
        <nav className="flex gap-1 overflow-x-auto border-b border-border-default bg-surface-card px-4 py-2 lg:hidden">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `shrink-0 rounded-default px-3 py-1.5 text-xs transition ${
                  isActive ? 'bg-primary text-white' : 'text-text-secondary hover:bg-surface-hover'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <main className="p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
