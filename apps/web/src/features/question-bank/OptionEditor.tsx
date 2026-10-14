export interface DraftOption {
  label: string;
  content: string;
  isCorrect: boolean;
}

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/** Mirror server validateOptions de bao loi som — BE van la chot. */
export function validateDraftOptions(
  type: string,
  options: DraftOption[],
): string | null {
  const filled = options.filter((o) => o.content.trim() !== '');
  const correct = filled.filter((o) => o.isCorrect).length;
  if (filled.length < 2) return 'Cần tối thiểu 2 phương án có nội dung';
  if (correct === 0) return 'Phải chọn ít nhất 1 đáp án đúng';
  if (type === 'SINGLE_CHOICE' && correct !== 1) return 'Câu 1 đáp án chỉ được có 1 đáp án đúng';
  if (type === 'TRUE_FALSE') {
    if (filled.length !== 2) return 'Câu đúng/sai phải có đúng 2 phương án';
    if (correct !== 1) return 'Câu đúng/sai chỉ được có 1 đáp án đúng';
  }
  if (type === 'MULTIPLE_CHOICE' && correct === filled.length) {
    return 'Câu nhiều đáp án không thể có tất cả đều đúng';
  }
  return null;
}

/** Them/xoa/sap xep dap an + danh dau dung (chuc nang 2.2). */
export function OptionEditor({
  type,
  options,
  onChange,
}: {
  type: string;
  options: DraftOption[];
  onChange: (options: DraftOption[]) => void;
}) {
  const visible = type === 'TRUE_FALSE' ? options.slice(0, 2) : options;

  const set = (i: number, patch: Partial<DraftOption>) =>
    onChange(options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));

  const pick = (i: number) =>
    onChange(
      options.map((o, idx) =>
        type === 'MULTIPLE_CHOICE'
          ? idx === i
            ? { ...o, isCorrect: !o.isCorrect }
            : o
          : { ...o, isCorrect: idx === i },
      ),
    );

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= options.length) return;
    const next = [...options];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next.map((o, idx) => ({ ...o, label: LABELS[idx] })));
  };

  const add = () => {
    if (options.length >= 8) return;
    onChange([...options, { label: LABELS[options.length], content: '', isCorrect: false }]);
  };

  const remove = (i: number) => {
    if (options.length <= 2) return;
    onChange(
      options.filter((_, idx) => idx !== i).map((o, idx) => ({ ...o, label: LABELS[idx] })),
    );
  };

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-text-secondary">
        Các phương án —{' '}
        {type === 'MULTIPLE_CHOICE'
          ? 'bấm ô vuông để chọn nhiều đáp án đúng'
          : 'bấm ô tròn để chọn đáp án đúng duy nhất'}
      </p>
      <div className="space-y-2">
        {visible.map((o, i) => (
          <div key={`${o.label}-${i}`} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => pick(i)}
              aria-label={`Đánh dấu ${o.label} là đáp án đúng`}
              className={`flex h-8 w-8 shrink-0 items-center justify-center font-mono text-xs font-bold transition ${
                type === 'MULTIPLE_CHOICE' ? 'rounded-default' : 'rounded-full'
              } ${o.isCorrect ? 'bg-success text-white' : 'bg-surface-hover text-text-secondary'}`}
            >
              {o.label}
            </button>
            <input
              value={o.content}
              onChange={(e) => set(i, { content: e.target.value })}
              placeholder={
                type === 'TRUE_FALSE' ? (i === 0 ? 'Đúng' : 'Sai') : `Nội dung phương án ${o.label}`
              }
              className="w-full rounded-default border border-border-default px-3 py-2 font-mono text-sm outline-none focus:border-secondary"
            />
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label="Lên"
              className="shrink-0 rounded-default px-2 py-1 text-text-subdued hover:bg-surface-hover disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === visible.length - 1}
              aria-label="Xuống"
              className="shrink-0 rounded-default px-2 py-1 text-text-subdued hover:bg-surface-hover disabled:opacity-30"
            >
              ↓
            </button>
            {type !== 'TRUE_FALSE' && (
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={options.length <= 2}
                aria-label="Xóa phương án"
                className="shrink-0 rounded-default px-2 py-1 text-danger hover:bg-surface-hover disabled:opacity-30"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      {type !== 'TRUE_FALSE' && options.length < 8 && (
        <button
          type="button"
          onClick={add}
          className="mt-2 rounded-default border border-dashed border-border-default px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover"
        >
          + Thêm phương án
        </button>
      )}
    </div>
  );
}
