import { MathContent } from '@/shared/components/ui/MathContent';

interface PreviewOption {
  label: string;
  content: string;
  isCorrect: boolean;
}

/** Render 1 cau hoi dung nhu thi sinh nhin thay — dung chung cho editor va preview import. */
export function QuestionPreviewCard({
  content,
  options,
  imageUrl,
}: {
  content: string;
  options: PreviewOption[];
  imageUrl?: string | null;
}) {
  return (
    <div className="rounded-default border border-border-default bg-surface p-3">
      {content ? (
        <MathContent content={content} className="mb-3 text-[15px]" />
      ) : (
        <span className="text-sm text-text-subdued">Chưa có nội dung</span>
      )}
      {imageUrl && (
        <img src={imageUrl} alt="" className="mb-3 max-h-60 rounded-default border border-border-default" />
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {options
          .filter((o) => o.content.trim() !== '')
          .map((o) => (
            <div
              key={o.label}
              className={`flex items-start gap-2 rounded-default border px-3 py-2 text-sm ${
                o.isCorrect ? 'border-success bg-success-bg' : 'border-border-default bg-surface'
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-default font-mono text-xs font-semibold ${
                  o.isCorrect ? 'bg-success text-white' : 'bg-surface-hover'
                }`}
              >
                {o.label}
              </span>
              <MathContent content={o.content} />
            </div>
          ))}
      </div>
    </div>
  );
}
