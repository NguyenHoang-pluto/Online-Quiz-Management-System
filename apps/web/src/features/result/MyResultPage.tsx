import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { MathContent } from '@/shared/components/ui/MathContent';
import {
  Badge, Button, Card, Empty, ErrorBox, LABEL, Loading, Stat, difficultyTone,
  formatClock, formatDateTime,
} from '@/shared/components/ui';
import type { StudentResult } from '@/shared/types/api';

/** Module 6 — Sinh viên xem điểm và xem lại bài làm (chức năng 6.2). */
export function MyResultPage() {
  const { attemptId = '' } = useParams();

  const result = useQuery({
    queryKey: ['my-result', attemptId],
    queryFn: async () =>
      (await api.get<StudentResult>(`/results/attempts/${attemptId}`)).data,
  });

  if (result.isLoading) return <Loading />;
  if (result.isError) return <div className="p-6"><ErrorBox error={result.error} /></div>;

  const r = result.data!;
  const percent = r.score != null && r.totalScore ? (r.score / r.totalScore) * 100 : 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">{r.examTitle}</h1>
          <p className="text-sm text-text-secondary">
            {r.subject} · nộp lúc {formatDateTime(r.submittedAt)}
          </p>
        </div>
        <Link to="/ca-thi">
          <Button variant="ghost">Về danh sách</Button>
        </Link>
      </div>

      {r.status === 'TERMINATED' && (
        <div className="mb-4 rounded-default bg-danger-bg px-4 py-3 text-sm text-danger">
          <strong>Bài thi bị hủy do vượt ngưỡng vi phạm giám sát.</strong> Liên hệ giảng viên
          phụ trách nếu bạn cho rằng đây là nhầm lẫn.
        </div>
      )}

      {r.resultDisplay === 'NONE' ? (
        <Card className="p-8 text-center">
          <p className="text-lg font-semibold text-primary">Bài thi đã được ghi nhận</p>
          <p className="mt-2 text-sm text-text-secondary">
            {r.message ?? 'Ca thi này không công bố điểm.'}
          </p>
        </Card>
      ) : (
        <>
          <Card className="mb-5 p-6 text-center">
            <p className="text-[11px] tracking-wide text-text-subdued uppercase">Điểm số</p>
            <p
              className={`font-mono text-5xl font-bold ${
                (r.score ?? 0) >= 5 ? 'text-success' : 'text-danger'
              }`}
            >
              {r.score?.toFixed(2) ?? '—'}
            </p>
            <p className="text-sm text-text-secondary">trên thang {r.totalScore} điểm</p>

            <div className="mx-auto mt-4 h-2 max-w-sm overflow-hidden rounded-full bg-surface-hover">
              <div
                className={`h-full rounded-full ${(r.score ?? 0) >= 5 ? 'bg-success' : 'bg-danger'}`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </Card>

          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <Stat
              label="Số câu đúng"
              value={`${r.correctCount ?? 0}/${r.totalQuestions}`}
              tone="success"
            />
            <Stat
              label="Thời gian làm bài"
              value={r.durationUsedSeconds ? formatClock(r.durationUsedSeconds) : '—'}
            />
            <Stat
              label="Vi phạm giám sát"
              value={r.violationCount}
              tone={r.violationCount > 0 ? 'warning' : 'neutral'}
            />
          </div>
        </>
      )}

      {r.questions && (
        <>
          <h2 className="mb-3 font-semibold text-primary">Xem lại bài làm</h2>
          <div className="space-y-3">
            {r.questions.map((q) => (
              <Card
                key={q.orderIndex}
                className={`p-4 ${q.isCorrect ? '' : 'border-danger'}`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-primary">
                    Câu {q.orderIndex + 1}
                  </span>
                  <Badge tone={difficultyTone(q.difficulty)}>
                    {LABEL.difficulty[q.difficulty]}
                  </Badge>
                  <Badge tone={q.isCorrect ? 'success' : 'danger'}>
                    {q.isCorrect ? `Đúng · +${q.earnedScore.toFixed(2)}` : 'Sai · 0 điểm'}
                  </Badge>
                  <span className="font-mono text-[11px] text-text-subdued">
                    {q.chapter.code}
                  </span>
                </div>

                <MathContent content={q.content} className="mb-3" />

                <div className="grid gap-2 sm:grid-cols-2">
                  {q.options.map((o) => {
                    const tone = o.isCorrect
                      ? 'border-success bg-success-bg'
                      : o.selected
                        ? 'border-danger bg-danger-bg'
                        : 'border-border-default';
                    return (
                      <div
                        key={o.label}
                        className={`flex items-start gap-2 rounded-default border px-3 py-2 text-sm ${tone}`}
                      >
                        <span className="font-mono text-xs font-bold">{o.label}.</span>
                        <MathContent content={o.content} />
                        <span className="ml-auto shrink-0 text-[11px] font-medium">
                          {o.isCorrect && <span className="text-success">Đáp án đúng</span>}
                          {!o.isCorrect && o.selected && (
                            <span className="text-danger">Bạn đã chọn</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {q.explanation && (
                  <div className="mt-3 rounded-default bg-surface p-3">
                    <p className="mb-1 text-[11px] font-semibold tracking-wide text-text-subdued uppercase">
                      Lời giải
                    </p>
                    <MathContent content={q.explanation} className="text-sm" />
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      {r.resultDisplay === 'SCORE_ONLY' && (
        <Card className="p-5">
          <Empty message="Ca thi này chỉ công bố điểm, không cho xem lại đáp án." />
        </Card>
      )}
    </div>
  );
}
