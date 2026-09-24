import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from 'react';

/* ============================================================
   Bộ component nền dùng chung. Màu và bo góc lấy từ design token
   khai báo trong styles/index.css, không hard-code mã màu ở đây.
   ============================================================ */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-card border border-border-default bg-surface-card shadow-level1 ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-primary">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-secondary',
  secondary: 'bg-secondary text-white hover:opacity-90',
  ghost: 'border border-border-default bg-surface-card text-text-primary hover:bg-surface-hover',
  danger: 'bg-danger text-white hover:opacity-90',
  success: 'bg-success text-white hover:opacity-90',
};

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...rest}
      className={`rounded-default px-4 py-2 text-sm font-semibold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Input({
  label,
  hint,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-xs font-medium text-text-secondary">{label}</span>
      )}
      <input
        {...rest}
        className={`w-full rounded-default border border-border-default bg-surface-card px-3 py-2 text-sm outline-none transition focus:border-secondary disabled:bg-surface-hover ${className}`}
      />
      {hint && <span className="mt-1 block text-[11px] text-text-subdued">{hint}</span>}
    </label>
  );
}

export function Select({
  label,
  children,
  className = '',
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-xs font-medium text-text-secondary">{label}</span>
      )}
      <select
        {...rest}
        className={`w-full rounded-default border border-border-default bg-surface-card px-3 py-2 text-sm outline-none focus:border-secondary ${className}`}
      >
        {children}
      </select>
    </label>
  );
}

export function Textarea({
  label,
  className = '',
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-xs font-medium text-text-secondary">{label}</span>
      )}
      <textarea
        {...rest}
        className={`w-full rounded-default border border-border-default bg-surface-card px-3 py-2 font-mono text-sm outline-none focus:border-secondary ${className}`}
      />
    </label>
  );
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-hover text-text-secondary',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-selected-bg text-secondary',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  const color =
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'danger'
          ? 'text-danger'
          : 'text-primary';
  return (
    <Card className="p-4">
      <p className="text-[11px] font-medium tracking-wide text-text-subdued uppercase">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-text-secondary">{hint}</p>}
    </Card>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border-default text-left">
            {head.map((h, i) => (
              <th
                key={i}
                className="px-3 py-2.5 text-[11px] font-semibold tracking-wide text-text-secondary uppercase"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <tr className={`border-b border-border-default last:border-0 hover:bg-surface-hover ${className}`}>
      {children}
    </tr>
  );
}

export function Cell({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 align-middle ${className}`}>{children}</td>;
}

export function Empty({ message }: { message: string }) {
  return <p className="px-3 py-10 text-center text-sm text-text-subdued">{message}</p>;
}

export function Loading({ label = 'Đang tải...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-text-subdued">
      <span className="h-3 w-3 animate-pulse rounded-full bg-secondary" />
      {label}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  const message =
    (error as any)?.response?.data?.message ?? (error as any)?.message ?? 'Đã xảy ra lỗi';
  return (
    <div className="rounded-default bg-danger-bg px-3 py-2 text-sm text-danger">
      {Array.isArray(message) ? message.join('; ') : String(message)}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgb(15_23_42/0.4)] p-4 backdrop-blur-[4px]"
      onClick={onClose}
    >
      <div
        className={`my-8 w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} rounded-dialog bg-surface-card shadow-level3`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border-default px-5 py-3">
          <h2 className="font-semibold text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-default px-2 text-xl leading-none text-text-subdued hover:bg-surface-hover"
            aria-label="Đóng"
          >
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Pager({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 px-3 py-3 text-sm">
      <Button variant="ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Trước
      </Button>
      <span className="font-mono text-xs text-text-secondary">
        {page} / {totalPages}
      </span>
      <Button variant="ghost" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Tiếp
      </Button>
    </div>
  );
}

/** Nhãn hiển thị tiếng Việt cho các mã enum dùng khắp giao diện. */
export const LABEL = {
  difficulty: { EASY: 'Dễ', MEDIUM: 'Trung bình', HARD: 'Khó' } as Record<string, string>,
  questionType: {
    SINGLE_CHOICE: '1 đáp án',
    MULTIPLE_CHOICE: 'Nhiều đáp án',
    TRUE_FALSE: 'Đúng/Sai',
  } as Record<string, string>,
  examStatus: {
    DRAFT: 'Bản nháp',
    PUBLISHED: 'Đã phát hành',
    CLOSED: 'Đã đóng',
  } as Record<string, string>,
  attemptStatus: {
    IN_PROGRESS: 'Đang làm',
    SUBMITTED: 'Đã nộp',
    AUTO_SUBMITTED: 'Tự động nộp',
    TERMINATED: 'Hủy do vi phạm',
    CHUA_THI: 'Chưa thi',
  } as Record<string, string>,
  mode: { LAB: 'Tại phòng máy', REMOTE: 'Thi từ xa' } as Record<string, string>,
  resultDisplay: {
    NONE: 'Không công bố',
    SCORE_ONLY: 'Chỉ hiện điểm',
    WITH_ANSWERS: 'Hiện kèm đáp án',
  } as Record<string, string>,
};

export const difficultyTone = (d: string): Tone =>
  d === 'EASY' ? 'success' : d === 'MEDIUM' ? 'info' : 'danger';

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Chỉ giờ và phút.
 *
 * Không cắt chuỗi từ formatDateTime: locale vi-VN đặt giờ TRƯỚC ngày
 * ("13:54 24/09/2026"), nên slice(-5) ra "/2026" chứ không ra giờ.
 */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
