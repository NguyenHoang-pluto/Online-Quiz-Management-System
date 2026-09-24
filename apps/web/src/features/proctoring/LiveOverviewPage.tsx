import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import {
  Badge, Button, Card, Empty, ErrorBox, LABEL, Loading, PageHeader, Stat,
  formatDateTime, formatTime,
} from '@/shared/components/ui';
import { PHASE } from '@/shared/components/phase';
import type { LiveOverview } from '@/shared/types/api';

/**
 * Giám sát toàn thể — tổng quan mọi ca thi.
 *
 * Màn giám sát chi tiết chỉ xem được một ca. Nhưng giảng viên thường có nhiều
 * lớp thi cùng buổi, và câu hỏi đầu tiên của họ là "ca nào đang chạy, ca nào
 * có vấn đề" chứ không phải chi tiết từng thí sinh.
 */
export function LiveOverviewPage() {
  const data = useQuery({
    queryKey: ['live-overview'],
    queryFn: async () => (await api.get<LiveOverview>('/proctoring/live')).data,
    refetchInterval: 10_000,
  });

  if (data.isLoading) return <Loading />;
  if (data.isError) return <ErrorBox error={data.error} />;

  const d = data.data!;
  const running = d.exams.filter((e) => e.phase === 'DANG_DIEN_RA');
  const others = d.exams.filter((e) => e.phase !== 'DANG_DIEN_RA');

  return (
    <div>
      <PageHeader
        title="Giám sát toàn thể"
        subtitle="Tổng quan mọi ca thi bạn phụ trách, tự làm mới mỗi 10 giây"
        actions={
          <Badge tone={d.totals.runningExams > 0 ? 'success' : 'neutral'}>
            Cập nhật {formatTime(d.generatedAt)}
          </Badge>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label="Ca thi đang diễn ra"
          value={d.totals.runningExams}
          tone={d.totals.runningExams > 0 ? 'success' : 'neutral'}
        />
        <Stat label="Thí sinh đang làm bài" value={d.totals.studentsInProgress} />
        <Stat label="Còn tín hiệu" value={d.totals.online} tone="success" />
        <Stat
          label="Mất kết nối"
          value={d.totals.disconnected}
          tone={d.totals.disconnected > 0 ? 'danger' : 'neutral'}
        />
        <Stat
          label="Vượt ngưỡng vi phạm"
          value={d.totals.flagged}
          tone={d.totals.flagged > 0 ? 'danger' : 'neutral'}
        />
      </div>

      <h2 className="mb-3 text-sm font-semibold text-primary">
        Đang diễn ra ({running.length})
      </h2>
      {running.length === 0 ? (
        <Card className="mb-8">
          <Empty message="Hiện không có ca thi nào đang diễn ra" />
        </Card>
      ) : (
        <div className="mb-8 grid gap-4 lg:grid-cols-2">
          {running.map((e) => {
            const p = PHASE[e.phase];
            const pct = e.stats.enrolled
              ? Math.round((e.stats.started / e.stats.enrolled) * 100)
              : 0;
            return (
              <Card
                key={e.examId}
                className={`p-4 ${e.needsAttention ? 'border-danger' : ''}`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge tone={p.tone}>{p.text}</Badge>
                  <Badge tone={e.proctoringMode === 'LAB' ? 'info' : 'warning'}>
                    {LABEL.mode[e.proctoringMode]}
                  </Badge>
                  {e.needsAttention && <Badge tone="danger">Cần chú ý</Badge>}
                </div>

                <Link
                  to={`/giam-sat/${e.examId}`}
                  className="font-semibold text-secondary hover:underline"
                >
                  {e.title}
                </Link>
                <p className="text-xs text-text-secondary">
                  {e.subject.name} · {e.courseClass.code}
                  {e.room ? ` · ${e.room.code}` : ''}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-text-subdued">
                  {formatDateTime(e.openAt)} → {formatDateTime(e.closeAt)}
                </p>

                <div className="mt-3 mb-1 flex justify-between text-xs">
                  <span className="text-text-secondary">Đã vào thi</span>
                  <span className="font-mono font-semibold">
                    {e.stats.started}/{e.stats.enrolled} ({pct}%)
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
                  <div className="h-full bg-secondary" style={{ width: `${pct}%` }} />
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  {[
                    ['Trực tuyến', e.stats.online, 'text-success'],
                    ['Nhắc nhở', e.stats.warned, 'text-warning'],
                    ['Vượt ngưỡng', e.stats.flagged, 'text-danger'],
                    ['Mất kết nối', e.stats.disconnected, 'text-danger'],
                  ].map(([label, n, cls]) => (
                    <div key={String(label)} className="rounded-default bg-surface py-1.5">
                      <p className={`font-mono text-lg font-bold ${n ? cls : 'text-text-subdued'}`}>
                        {n as number}
                      </p>
                      <p className="text-[10px] text-text-subdued">{label}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex gap-2">
                  <Link to={`/giam-sat/${e.examId}`} className="flex-1">
                    <Button className="w-full">Mở màn giám sát</Button>
                  </Link>
                  <Link to={`/ket-qua/${e.examId}`}>
                    <Button variant="ghost">Kết quả</Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {others.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-semibold text-primary">
            Các ca thi khác ({others.length})
          </h2>
          <Card>
            <ul className="divide-y divide-border-default">
            {others.map((e) => {
              const p = PHASE[e.phase];
              return (
                <li key={e.examId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Badge tone={p.tone}>{p.text}</Badge>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/de-thi/${e.examId}`}
                      className="text-sm font-medium text-secondary hover:underline"
                    >
                      {e.title}
                    </Link>
                    <p className="font-mono text-[11px] text-text-subdued">
                      {e.courseClass.code} · {formatDateTime(e.openAt)}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-text-secondary">
                    {e.stats.submitted}/{e.stats.enrolled} đã nộp
                  </span>
                  {e.phase === 'HET_GIO' && (
                    <Link to={`/de-thi/${e.examId}`}>
                      <Button variant="ghost">Chốt ca thi</Button>
                    </Link>
                  )}
                  {e.phase === 'DA_DONG' && (
                    <Link to={`/ket-qua/${e.examId}`}>
                      <Button variant="ghost">Kết quả</Button>
                    </Link>
                  )}
                </li>
              );
            })}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
