import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { MathContent } from '@/shared/components/ui/MathContent';
import {
  Badge, Button, Card, Cell, Empty, ErrorBox, LABEL, Loading, PageHeader, Row,
  Stat, Table, formatDateTime,
} from '@/shared/components/ui';
import { ScoreDistributionChart } from './ScoreDistributionChart';
import type { Distribution, Gradebook, ItemAnalysis } from '@/shared/types/api';

const QUALITY: Record<string, { text: string; tone: any }> = {
  RAT_TOT: { text: 'Rất tốt', tone: 'success' },
  TOT: { text: 'Tốt', tone: 'success' },
  TAM_DUOC: { text: 'Tạm được', tone: 'warning' },
  CAN_RA_SOAT: { text: 'Cần rà soát', tone: 'danger' },
};

type Tab = 'gradebook' | 'analysis';

/** Module 6 — Bảng điểm, phổ điểm và phân tích câu hỏi. */
export function ResultPage() {
  const { examId = '' } = useParams();
  const [tab, setTab] = useState<Tab>('gradebook');

  const gradebook = useQuery({
    queryKey: ['gradebook', examId],
    queryFn: async () => (await api.get<Gradebook>(`/results/exams/${examId}/gradebook`)).data,
  });

  const distribution = useQuery({
    queryKey: ['distribution', examId],
    queryFn: async () =>
      (await api.get<Distribution>(`/results/exams/${examId}/distribution`)).data,
  });

  const analysis = useQuery({
    queryKey: ['item-analysis', examId],
    enabled: tab === 'analysis',
    queryFn: async () =>
      (await api.get<ItemAnalysis>(`/results/exams/${examId}/item-analysis`)).data,
  });

  const exportExcel = async () => {
    const res = await api.get(`/results/exams/${examId}/export.xlsx`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bang-diem-${gradebook.data?.examTitle ?? examId}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (gradebook.isLoading) return <Loading />;
  if (gradebook.isError) return <ErrorBox error={gradebook.error} />;

  const g = gradebook.data!;

  return (
    <div>
      <PageHeader
        title="Kết quả & Báo cáo"
        subtitle={`${g.examTitle} · ${g.subject}`}
        actions={
          <>
            <Link to={`/giam-sat/${examId}`}>
              <Button variant="ghost">Nhật ký giám sát</Button>
            </Link>
            <Button onClick={exportExcel}>Xuất bảng điểm Excel</Button>
          </>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Đã nộp bài"
          value={`${g.submitted}/${g.enrolled}`}
          hint={`${((g.submitted / Math.max(1, g.enrolled)) * 100).toFixed(1)}% sĩ số`}
        />
        <Stat
          label="Điểm trung bình"
          value={g.summary.average.toFixed(2)}
          hint={`trên thang ${g.totalScore}`}
          tone={g.summary.average >= 5 ? 'success' : 'danger'}
        />
        <Stat
          label="Cao nhất / Thấp nhất"
          value={`${g.summary.max} / ${g.summary.min}`}
          hint={`Độ lệch chuẩn ${g.summary.stdDev}`}
        />
        <Stat
          label="Tỉ lệ đạt"
          value={`${g.summary.passRate}%`}
          hint="từ 5.0 điểm trở lên"
          tone={g.summary.passRate >= 50 ? 'success' : 'danger'}
        />
      </div>

      {distribution.data && distribution.data.total > 0 && (
        <Card className="mb-5 p-5">
          <ScoreDistributionChart data={distribution.data} />
        </Card>
      )}

      <div className="mb-4 flex gap-1.5">
        {(
          [
            ['gradebook', `Bảng điểm (${g.rows.length})`],
            ['analysis', 'Phân tích câu hỏi'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-default px-4 py-2 text-sm font-medium transition ${
              tab === key ? 'bg-primary text-white' : 'border border-border-default hover:bg-surface-hover'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'gradebook' ? (
        <Card>
          {g.rows.length === 0 ? (
            <Empty message="Lớp chưa có sinh viên nào" />
          ) : (
            <Table
              head={['STT', 'MSSV', 'Họ và tên', 'Số câu đúng', 'Điểm', 'Nộp lúc', 'Vi phạm', 'Trạng thái']}
            >
              {g.rows.map((r) => (
                <Row key={r.studentId}>
                  <Cell className="font-mono text-xs">{String(r.stt).padStart(2, '0')}</Cell>
                  <Cell className="font-mono text-xs font-semibold">{r.code}</Cell>
                  <Cell>{r.fullName}</Cell>
                  <Cell className="font-mono text-xs">{r.correctCount ?? '—'}</Cell>
                  <Cell>
                    {r.score === null ? (
                      <span className="text-text-subdued">—</span>
                    ) : (
                      <span
                        className={`rounded-default px-2 py-0.5 font-mono text-sm font-bold ${
                          r.score >= 8.5
                            ? 'bg-success-bg text-success'
                            : r.score >= 5
                              ? 'bg-selected-bg text-secondary'
                              : 'bg-danger-bg text-danger'
                        }`}
                      >
                        {r.score.toFixed(2)}
                      </span>
                    )}
                  </Cell>
                  <Cell className="font-mono text-xs">{formatDateTime(r.submittedAt)}</Cell>
                  <Cell>
                    {r.violationCount > 0 ? (
                      <Badge tone="warning">{r.violationCount} lần</Badge>
                    ) : (
                      <span className="text-xs text-text-subdued">—</span>
                    )}
                  </Cell>
                  <Cell>
                    <Badge
                      tone={
                        r.status === 'TERMINATED'
                          ? 'danger'
                          : r.status === 'CHUA_THI'
                            ? 'neutral'
                            : 'success'
                      }
                    >
                      {LABEL.attemptStatus[r.status] ?? r.status}
                    </Badge>
                  </Cell>
                </Row>
              ))}
            </Table>
          )}
        </Card>
      ) : analysis.isLoading ? (
        <Loading />
      ) : !analysis.data || analysis.data.items.length === 0 ? (
        <Card>
          <Empty message="Chưa có bài nào được chấm để phân tích" />
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-text-secondary">
            Độ khó là tỉ lệ trả lời đúng. Hệ số phân biệt so tỉ lệ đúng của nhóm{' '}
            {analysis.data.groupSize} bài điểm cao nhất với nhóm {analysis.data.groupSize} bài
            điểm thấp nhất — hệ số thấp nghĩa là câu hỏi không phân loại được thí sinh.
          </p>

          {analysis.data.items.map((it, i) => (
            <Card key={it.questionId} className={`p-4 ${it.suspicious ? 'border-danger' : ''}`}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-primary">Câu {i + 1}</span>
                <Badge tone={QUALITY[it.quality].tone}>{QUALITY[it.quality].text}</Badge>
                <span className="font-mono text-xs text-text-secondary">
                  Độ khó {it.correctPercent}% · Phân biệt {it.discriminationIndex.toFixed(2)}
                </span>
                <span className="ml-auto font-mono text-xs text-text-subdued">
                  {it.correctAnswers}/{it.totalAnswers} đúng
                </span>
              </div>

              <MathContent content={it.content} className="mb-3 text-sm" />

              <div className="space-y-1.5">
                {it.distribution.map((d) => (
                  <div key={d.label} className="flex items-center gap-2 text-xs">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-default font-mono font-bold ${
                        d.isCorrect ? 'bg-success text-white' : 'bg-surface-hover'
                      }`}
                    >
                      {d.label}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-hover">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${d.percent}%`,
                          background: d.isCorrect
                            ? 'var(--color-success)'
                            : 'var(--color-border-strong)',
                        }}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-right font-mono tabular-nums">
                      {d.chosen} ({d.percent}%)
                    </span>
                  </div>
                ))}
              </div>

              {it.warning && (
                <p className="mt-3 rounded-default bg-danger-bg px-3 py-2 text-xs text-danger">
                  {it.warning}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
