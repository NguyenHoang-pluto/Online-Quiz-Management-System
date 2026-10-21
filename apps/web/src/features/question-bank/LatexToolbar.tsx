const SYMBOLS = [
  '\\frac{a}{b}', '\\sqrt{x}', '\\int_{a}^{b}', '\\iint_D', '\\sum_{i=1}^{n}',
  '\\lim_{x \\to 0}', '\\partial', '\\infty', '\\alpha', '\\beta', '\\pi',
  '\\leq', '\\geq', '\\neq', '\\in',
];

const TEMPLATES = [
  { label: 'Phân số', snippet: '\\frac{}{}' },
  { label: 'Tích phân', snippet: '\\int_{}^{}' },
  { label: 'Tổng', snippet: '\\sum_{i=1}^{n}' },
  { label: 'Giới hạn', snippet: '\\lim_{x \\to 0}' },
];

/** Thanh chen ky hieu Toan — goi onInsert, component cha tu chen vao vi tri con tro. */
export function LatexToolbar({ onInsert }: { onInsert: (snippet: string) => void }) {
  return (
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
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {TEMPLATES.map((t) => (
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
  );
}
