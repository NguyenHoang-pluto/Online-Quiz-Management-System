import { Link, useRouteError } from 'react-router-dom';

/**
 * Màn hình dự phòng khi một trang ném lỗi.
 *
 * Không có nó, React Router hiện nguyên vết ngăn xếp — với sinh viên đang thi
 * thì đó vừa khó hiểu vừa lộ đường dẫn mã nguồn.
 */
export function ErrorPage() {
  const error = useRouteError() as Error | undefined;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md rounded-card border border-border-default bg-surface-card p-8 text-center shadow-level1">
        <p className="font-mono text-4xl font-bold text-danger">!</p>
        <h1 className="mt-3 text-lg font-bold text-primary">Trang gặp sự cố</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Đã xảy ra lỗi ngoài dự kiến. Nếu bạn đang làm bài thi, đáp án đã chọn vẫn được lưu trên
          máy chủ — hãy tải lại trang để tiếp tục.
        </p>

        {import.meta.env.DEV && error && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-default bg-surface p-3 text-left font-mono text-[11px] text-danger">
            {error.message}
          </pre>
        )}

        <div className="mt-6 flex gap-2">
          <button
            onClick={() => window.location.reload()}
            className="flex-1 rounded-default bg-primary py-2 text-sm font-semibold text-white"
          >
            Tải lại trang
          </button>
          <Link
            to="/"
            className="flex-1 rounded-default border border-border-default py-2 text-sm font-semibold"
          >
            Về trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}
