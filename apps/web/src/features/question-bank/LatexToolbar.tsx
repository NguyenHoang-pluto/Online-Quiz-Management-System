import { STRUCTURED_TEMPLATES } from './latexInsert';

const SYMBOLS = [
  '\\frac{a}{b}', '\\sqrt{x}', '\\int_{a}^{b}', '\\iint_D', '\\sum_{i=1}^{n}',
  '\\lim_{x \\to 0}', '\\partial', '\\infty', '\\alpha', '\\beta', '\\pi',
  '\\leq', '\\geq', '\\neq', '\\in',
];

/**
 * Soạn công thức bằng các khối bấm được: chèn cấu trúc rồi xem trước KaTeX
 * ngay bên cạnh. Không cần thêm trình soạn WYSIWYG cho đồ án — ponytail:
 * nếu sau này cần ký hiệu phức tạp hơn, thay toolbar bằng MathLive.
 */
export function LatexToolbar({ onInsert }: { onInsert: (snippet: string) => void }) {
  return (
    <div className="space-y-1.5">
      <div>
        <p className="mb-1 text-xs font-medium text-text-secondary">Cấu trúc công thức</p>
        <div className="flex flex-wrap gap-1.5">
          {STRUCTURED_TEMPLATES.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => onInsert(`$${t.snippet}$`)}
              className="rounded-default border border-dashed border-border-default bg-surface px-2 py-1 text-[11px] text-text-secondary hover:bg-selected-bg"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-text-secondary">Chèn ký hiệu toán học</p>
        <div className="flex flex-wrap gap-1.5">
          {SYMBOLS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onInsert(`$${s}$`)}
              className="rounded-default border border-border-default bg-surface px-2 py-1 font-mono text-[11px] hover:bg-selected-bg"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
