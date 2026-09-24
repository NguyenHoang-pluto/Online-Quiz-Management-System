import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { useAuthStore, type AuthUser } from '@/features/auth/auth.store';

/**
 * Ký hiệu toán trôi trong nền.
 *
 * Chọn ký hiệu giải tích vì đây là hệ thống thi có hỗ trợ công thức KaTeX —
 * nền gợi đúng thứ hệ thống làm, thay vì mấy hình tròn trang trí chung chung.
 *
 * Toạ độ cố định chứ không random: random mỗi lần dựng lại thì mỗi lần vào
 * trang nền một khác, khó biết lúc nào là do mình sửa hỏng.
 *
 * depth — biên độ dịch theo chuột, ký hiệu càng to càng dịch nhiều để ra cảm
 * giác lớp gần lớp xa. dur — chu kỳ trôi, lệch nhau để chúng không trôi đồng loạt.
 */
const GLYPHS = [
  { char: '∫', left: '6%', top: '14%', size: '5.5rem', depth: '34px', dur: '19s' },
  { char: 'Σ', left: '16%', top: '64%', size: '4.5rem', depth: '24px', dur: '25s' },
  { char: '√', left: '27%', top: '31%', size: '3.2rem', depth: '14px', dur: '17s' },
  { char: 'π', left: '9%', top: '86%', size: '3.8rem', depth: '27px', dur: '21s' },
  { char: '∂', left: '77%', top: '19%', size: '5rem', depth: '31px', dur: '23s' },
  { char: '∞', left: '88%', top: '70%', size: '4.2rem', depth: '20px', dur: '18s' },
  { char: 'Δ', left: '69%', top: '87%', size: '3.4rem', depth: '16px', dur: '27s' },
  { char: 'θ', left: '93%', top: '36%', size: '3rem', depth: '12px', dur: '20s' },
];

interface Ripple {
  id: number;
  x: number;
  y: number;
}

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  const stageRef = useRef<HTMLDivElement>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const rippleId = useRef(0);

  /**
   * Ghi vị trí chuột vào biến CSS, mỗi khung hình đúng một lần.
   *
   * Không đưa vào state: chuột di chuyển sinh hàng trăm sự kiện mỗi giây, mỗi
   * lần setState là một lần React dựng lại cả cây — ô mật khẩu đang gõ cũng bị
   * dựng lại theo. Ghi thẳng vào biến CSS thì chỉ trình duyệt vẽ lại, React
   * không phải làm gì.
   */
  const pending = useRef(0);
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = stageRef.current;
    if (!el || pending.current) return;

    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    pending.current = requestAnimationFrame(() => {
      pending.current = 0;
      el.style.setProperty('--mx', x.toFixed(4));
      el.style.setProperty('--my', y.toFixed(4));
    });
  }, []);

  /** Gợn sóng lan ra từ chỗ vừa bấm. Tự xoá khi hoạt ảnh chạy xong. */
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const id = ++rippleId.current;
    setRipples((r) => [...r, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
  }, []);

  const dropRipple = useCallback((id: number) => {
    setRipples((r) => r.filter((k) => k.id !== id));
  }, []);

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
    <div
      ref={stageRef}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      className="login-stage relative flex min-h-screen items-center justify-center overflow-hidden bg-primary px-4 py-10"
    >
      {/* ---------- Nền: chỉ để nhìn, không nhận chuột ---------- */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#16307a] via-primary to-[#0b1f52]" />

        <div className="login-aurora absolute -top-1/4 -left-1/4 h-[70vmax] w-[70vmax] rounded-full bg-secondary/25" />
        <div className="login-aurora login-aurora--slow absolute -right-1/4 -bottom-1/3 h-[60vmax] w-[60vmax] rounded-full bg-[#38bdf8]/20" />

        {GLYPHS.map((g) => (
          <div
            key={g.char}
            className="login-glyph absolute font-mono font-bold text-white/[0.07] select-none"
            style={
              {
                left: g.left,
                top: g.top,
                fontSize: g.size,
                '--depth': g.depth,
                '--dur': g.dur,
              } as React.CSSProperties
            }
          >
            <span>{g.char}</span>
          </div>
        ))}

        <div className="login-spotlight absolute inset-0" />
      </div>

      {/* ---------- Gợn sóng khi bấm, nằm dưới thẻ ---------- */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {ripples.map((r) => (
          <span
            key={r.id}
            onAnimationEnd={() => dropRipple(r.id)}
            className="login-ripple absolute block h-[34rem] w-[34rem] rounded-full border border-white/40 bg-white/10"
            style={{ left: r.x, top: r.y }}
          />
        ))}
      </div>

      {/* ---------- Thẻ đăng nhập ---------- */}
      <div className="login-rise relative w-full max-w-[26rem]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
          className="login-card relative overflow-hidden rounded-dialog border border-white/60 bg-surface-card/95 p-8 shadow-level3 backdrop-blur-sm"
        >
          {/* Vệt sáng lướt theo chuột */}
          <div
            aria-hidden="true"
            className="login-sheen pointer-events-none absolute inset-0 opacity-60"
          />

          <div className="relative">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card bg-gradient-to-br from-secondary to-primary font-mono text-2xl leading-none font-bold text-white shadow-level2">
                ∫
              </span>
              <div>
                <h1 className="text-xl leading-tight font-bold text-primary">EduExam Pro</h1>
                <p className="text-xs text-text-secondary">
                  Hệ thống thi trắc nghiệm trực tuyến
                </p>
              </div>
            </div>

            <div className="mb-6 h-px bg-gradient-to-r from-transparent via-border-strong to-transparent" />

            <label
              htmlFor="login-code"
              className="mb-1 block text-xs font-medium text-text-secondary"
            >
              MSSV / Mã giảng viên
            </label>
            <input
              id="login-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="username"
              required
              className="mb-4 w-full rounded-default border border-border-default bg-surface-card px-3 py-2.5 font-mono text-sm transition outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20"
            />

            <label
              htmlFor="login-password"
              className="mb-1 block text-xs font-medium text-text-secondary"
            >
              Mật khẩu
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="mb-5 w-full rounded-default border border-border-default bg-surface-card px-3 py-2.5 text-sm transition outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20"
            />

            {login.isError && (
              <p
                role="alert"
                className="login-rise mb-4 rounded-default bg-danger-bg px-3 py-2 text-sm text-danger"
              >
                Mã đăng nhập hoặc mật khẩu không đúng
              </p>
            )}

            <button
              type="submit"
              disabled={login.isPending}
              className="group relative w-full overflow-hidden rounded-default bg-primary py-2.5 text-sm font-semibold text-white transition hover:bg-secondary active:scale-[0.99] disabled:opacity-60"
            >
              {/* Vệt sáng quét ngang khi rê chuột lên nút */}
              <span
                aria-hidden="true"
                className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
              />
              <span className="relative">
                {login.isPending ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </span>
            </button>
          </div>
        </form>

        <p className="mt-5 text-center text-xs text-white/50">
          Đồ án môn học · Nhóm 08
        </p>
      </div>
    </div>
  );
}
