import { NavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth.store';
import { LogoutButton } from './LogoutButton';

const NAV = [
  { to: '/ca-thi', label: 'Ca thi của tôi' },
  { to: '/lich-su', label: 'Lịch sử thi' },
];

/** Khung cho sinh viên ngoài lúc làm bài. */
export function StudentLayout() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-10 border-b border-border-default bg-surface-card">
        <div className="mx-auto flex h-[52px] max-w-4xl items-center gap-4 px-4">
          <p className="font-bold text-primary">EduExam Pro</p>
          <nav className="flex gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `rounded-default px-3 py-1.5 text-sm transition ${
                    isActive
                      ? 'bg-selected-bg font-semibold text-primary'
                      : 'text-text-secondary hover:bg-surface-hover'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium">{user?.fullName}</p>
              <p className="font-mono text-[11px] text-text-subdued">MSSV: {user?.code}</p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
