import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import type { Role } from '@eduexam/shared';
import { useAuthStore } from '@/features/auth/auth.store';
import { ErrorPage } from './ErrorPage';

import { LoginPage } from '@/pages/LoginPage';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { StudentLayout } from '@/layouts/StudentLayout';
import { ExamShellLayout } from '@/layouts/ExamShellLayout';

import { MyExamsPage } from '@/features/attempt/MyExamsPage';
import { ExamRulesPage } from '@/features/attempt/ExamRulesPage';
import { DoExamPage } from '@/features/attempt/DoExamPage';


/**
 * Cac trang nang duoc nap muon.
 *
 * Quan trong nhat: man lam bai (DoExamPage) duoc nap thang, khong keo theo
 * Recharts hay Socket.IO. Sinh vien thi bang mang yeu khong phai tai ve
 * nhung thu vien chi dung cho bao cao va man giam sat.
 */
const CatalogPage = lazy(() => import('@/features/catalog/CatalogPage').then((m) => ({ default: m.CatalogPage })));
const CourseClassPage = lazy(() => import('@/features/catalog/CourseClassPage').then((m) => ({ default: m.CourseClassPage })));
const UsersPage = lazy(() => import('@/features/catalog/UsersPage').then((m) => ({ default: m.UsersPage })));
const QuestionBankPage = lazy(() => import('@/features/question-bank/QuestionBankPage').then((m) => ({ default: m.QuestionBankPage })));
const ExamListPage = lazy(() => import('@/features/exam/ExamListPage').then((m) => ({ default: m.ExamListPage })));
const ExamEditorPage = lazy(() => import('@/features/exam/ExamEditorPage').then((m) => ({ default: m.ExamEditorPage })));
const LiveMonitorPage = lazy(() => import('@/features/proctoring/LiveMonitorPage').then((m) => ({ default: m.LiveMonitorPage })));
const LiveOverviewPage = lazy(() => import('@/features/proctoring/LiveOverviewPage').then((m) => ({ default: m.LiveOverviewPage })));
const ResultPage = lazy(() => import('@/features/result/ResultPage').then((m) => ({ default: m.ResultPage })));
const MyResultPage = lazy(() => import('@/features/result/MyResultPage').then((m) => ({ default: m.MyResultPage })));
const MyHistoryPage = lazy(() => import('@/features/result/MyHistoryPage').then((m) => ({ default: m.MyHistoryPage })));

function Lazy({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-text-subdued">
          <span className="h-3 w-3 animate-pulse rounded-full bg-secondary" />
          Đang tải...
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

/** Chặn route theo vai trò — song song với RolesGuard ở backend. */
function RequireRole({ roles }: { roles: Role[] }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/dang-nhap" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Đưa mỗi vai trò về đúng trang chủ của mình. */
function HomeRedirect() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/dang-nhap" replace />;
  return <Navigate to={user.role === 'STUDENT' ? '/ca-thi' : '/de-thi'} replace />;
}

export const router = createBrowserRouter([
  { path: '/dang-nhap', element: <LoginPage />, errorElement: <ErrorPage /> },
  { path: '/', element: <HomeRedirect /> },

  // ---------- Phân hệ quản trị và giảng dạy ----------
  {
    element: <RequireRole roles={['ADMIN', 'LECTURER']} />,
    errorElement: <ErrorPage />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { path: '/danh-muc', element: (
              <Lazy>
                <CatalogPage />
              </Lazy>
            ) },          // M1
          { path: '/lop-hoc-phan', element: (
              <Lazy>
                <CourseClassPage />
              </Lazy>
            ) },  // M1
          { path: '/tai-khoan', element: (
              <Lazy>
                <UsersPage />
              </Lazy>
            ) },           // M1
          { path: '/ngan-hang-cau-hoi', element: (
              <Lazy>
                <QuestionBankPage />
              </Lazy>
            ) }, // M2
          { path: '/de-thi', element: (
              <Lazy>
                <ExamListPage />
              </Lazy>
            ) },           // M3
          { path: '/de-thi/:id', element: (
              <Lazy>
                <ExamEditorPage />
              </Lazy>
            ) },     // M3
          { path: '/giam-sat', element: (
              <Lazy>
                <LiveOverviewPage />
              </Lazy>
            ) }, // M5
          { path: '/giam-sat/:examId', element: (
              <Lazy>
                <LiveMonitorPage />
              </Lazy>
            ) }, // M5
          { path: '/ket-qua/:examId', element: (
              <Lazy>
                <ResultPage />
              </Lazy>
            ) },    // M6
        ],
      },
    ],
  },

  // ---------- Phân hệ sinh viên ----------
  {
    element: <RequireRole roles={['STUDENT']} />,
    errorElement: <ErrorPage />,
    children: [
      {
        element: <StudentLayout />,
        children: [
          { path: '/ca-thi', element: <MyExamsPage /> },                     // M4
          { path: '/lich-su', element: (
              <Lazy>
                <MyHistoryPage />
              </Lazy>
            ) },                  // M6
          { path: '/ket-qua-cua-toi/:attemptId', element: (
              <Lazy>
                <MyResultPage />
              </Lazy>
            ) },// M6
        ],
      },
      {
        /**
         * Màn thi dùng khung RIÊNG, không có thanh điều hướng.
         * Mockup Module 4 vẽ nhầm sidebar giảng viên vào đây — giữ nguyên thì
         * thí sinh nhìn thấy đường dẫn tới ngân hàng câu hỏi ngay lúc đang thi.
         */
        element: <ExamShellLayout />,
        children: [
          { path: '/thi/:examId/the-le', element: <ExamRulesPage /> },
          { path: '/thi/lam-bai/:attemptId', element: <DoExamPage /> },
        ],
      },
    ],
  },

  { path: '*', element: <Navigate to="/" replace /> },
]);
