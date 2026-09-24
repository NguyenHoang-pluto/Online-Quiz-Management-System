import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import {
  Badge, Button, Card, Cell, Empty, LABEL, Loading, PageHeader, Row, Table,
  formatDateTime,
} from '@/shared/components/ui';
import type { HistoryRow } from '@/shared/types/api';

/** Module 6 — Lịch sử các ca thi của sinh viên (chức năng 6.3). */
export function MyHistoryPage() {
  const history = useQuery({
    queryKey: ['my-history'],
    queryFn: async () => (await api.get<HistoryRow[]>('/results/my-history')).data,
  });

  if (history.isLoading) return <Loading />;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <PageHeader title="Lịch sử thi" subtitle="Toàn bộ các ca thi bạn đã hoàn thành" />

      <Card>
        {history.data?.length === 0 ? (
          <Empty message="Bạn chưa hoàn thành ca thi nào" />
        ) : (
          <Table head={['Ca thi', 'Môn học', 'Nộp lúc', 'Số câu đúng', 'Điểm', 'Trạng thái', '']}>
            {history.data?.map((h) => (
              <Row key={h.attemptId}>
                <Cell className="font-medium">{h.examTitle}</Cell>
                <Cell className="text-xs">
                  <span className="font-mono text-text-subdued">{h.subject.code}</span>
                  <span className="block">{h.subject.name}</span>
                </Cell>
                <Cell className="font-mono text-xs">{formatDateTime(h.submittedAt)}</Cell>
                <Cell className="font-mono text-xs">{h.correctCount ?? '—'}</Cell>
                <Cell>
                  {h.score === null ? (
                    <span className="text-xs text-text-subdued">Không công bố</span>
                  ) : (
                    <span
                      className={`font-mono text-base font-bold ${
                        h.score >= 5 ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {h.score.toFixed(2)}
                      <span className="text-xs font-normal text-text-subdued">
                        /{h.totalScore}
                      </span>
                    </span>
                  )}
                </Cell>
                <Cell>
                  <Badge tone={h.status === 'TERMINATED' ? 'danger' : 'success'}>
                    {LABEL.attemptStatus[h.status]}
                  </Badge>
                  {h.violationCount > 0 && (
                    <span className="ml-1 text-[11px] text-warning">
                      {h.violationCount} vi phạm
                    </span>
                  )}
                </Cell>
                <Cell>
                  <Link to={`/ket-qua-cua-toi/${h.attemptId}`}>
                    <Button variant="ghost">Xem lại</Button>
                  </Link>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
