import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import {
  Badge, Button, Card, Empty, LABEL, Loading, PageHeader, formatDateTime,
} from '@/shared/components/ui';
import type { ExamState, MyExam } from '@/shared/types/api';

const STATE: Record<ExamState, { label: string; tone: 'success' | 'warning' | 'info' | 'neutral' }> = {
  DANG_MO: { label: 'Đang mở', tone: 'success' },
  DANG_LAM: { label: 'Đang làm dở', tone: 'warning' },
  SAP_DIEN_RA: { label: 'Sắp diễn ra', tone: 'info' },
  DA_HOAN_THANH: { label: 'Đã hoàn thành', tone: 'neutral' },
  DA_DONG: { label: 'Đã đóng', tone: 'neutral' },
};

/** Module 4 — Danh sách ca thi của sinh viên (chức năng 4.1). */
export function MyExamsPage() {
  const exams = useQuery({
    queryKey: ['my-exams'],
    queryFn: async () => (await api.get<MyExam[]>('/attempts/my-exams')).data,
    refetchInterval: 30_000,
  });

  if (exams.isLoading) return <Loading />;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <PageHeader title="Ca thi của tôi" subtitle="Danh sách các bài kiểm tra được giao" />

      {exams.data?.length === 0 ? (
        <Card>
          <Empty message="Bạn chưa có ca thi nào" />
        </Card>
      ) : (
        <div className="space-y-3">
          {exams.data?.map((e) => {
            const s = STATE[e.state];
            const canEnter = e.state === 'DANG_MO' || e.state === 'DANG_LAM';
            return (
              <Card key={e.examId} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge tone={s.tone}>{s.label}</Badge>
                      <Badge tone={e.proctoringMode === 'LAB' ? 'info' : 'warning'}>
                        {LABEL.mode[e.proctoringMode]}
                      </Badge>
                      {e.room && (
                        <span className="font-mono text-[11px] text-text-subdued">
                          {e.room.code}
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-primary">{e.title}</p>
                    <p className="text-sm text-text-secondary">
                      {e.subject.name} · {e.courseClass.code}
                    </p>
                    <p className="mt-1 font-mono text-xs text-text-subdued">
                      {e.durationMinutes} phút · mở {formatDateTime(e.openAt)} → đóng{' '}
                      {formatDateTime(e.closeAt)}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    {e.state === 'DA_HOAN_THANH' && e.score !== null && (
                      <p className="mb-2 font-mono text-2xl font-bold text-primary">
                        {e.score.toFixed(2)}
                      </p>
                    )}
                    {canEnter && (
                      <Link to={`/thi/${e.examId}/the-le`}>
                        <Button>{e.state === 'DANG_LAM' ? 'Tiếp tục làm bài' : 'Vào thi'}</Button>
                      </Link>
                    )}
                    {e.state === 'DA_HOAN_THANH' && e.attemptId && (
                      <Link to={`/ket-qua-cua-toi/${e.attemptId}`}>
                        <Button variant="ghost">Xem kết quả</Button>
                      </Link>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
