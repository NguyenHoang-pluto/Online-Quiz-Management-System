import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import {
  Badge, Button, Card, Cell, Empty, ErrorBox, Input, Loading, Modal, Row,
  Stat, Table, formatDateTime,
} from '@/shared/components/ui';
import type { LiveMonitor, MonitorRow, Timeline } from '@/shared/types/api';
import { EvidenceThumb } from './EvidenceThumb';
import { filterMonitorRows } from './filterMonitorRows';

const STATE_LABEL: Record<MonitorRow['state'], { text: string; tone: any }> = {
  BINH_THUONG: { text: 'Bình thường', tone: 'success' },
  NHAC_NHO: { text: 'Nhắc nhở', tone: 'warning' },
  DANH_DAU: { text: 'Đánh dấu', tone: 'danger' },
  MAT_KET_NOI: { text: 'Mất kết nối', tone: 'danger' },
  DA_NOP: { text: 'Đã nộp', tone: 'neutral' },
};

/** Chức năng 5.8 — báo cáo giám sát sau ca thi, đặt ngay trang kết quả. */
export function ProctoringReport({ examId }: { examId: string }) {
  const [state, setState] = useState<MonitorRow['state'] | ''>('DANH_DAU');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<MonitorRow | null>(null);

  const monitor = useQuery({
    queryKey: ['proctoring-report', examId],
    queryFn: async () =>
      (await api.get<LiveMonitor>(`/proctoring/exams/${examId}/monitor`)).data,
  });

  const timeline = useQuery({
    queryKey: ['proctoring-report-timeline', detail?.attemptId],
    enabled: !!detail,
    queryFn: async () =>
      (await api.get<Timeline>(`/proctoring/attempts/${detail!.attemptId}/timeline`)).data,
  });

  if (monitor.isLoading) return <Loading />;
  if (monitor.isError) return <ErrorBox error={monitor.error} />;

  const m = monitor.data!;
  const rows = filterMonitorRows(m.rows, state, query);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Sĩ số" value={m.stats.enrolled} />
        <Stat label="Nhắc nhở" value={m.stats.warned} tone="warning" />
        <Stat label="Đánh dấu" value={m.stats.flagged} tone="danger" />
        <Stat label="Đã nộp" value={m.stats.submitted} tone="success" />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input
            placeholder="Tìm theo MSSV hoặc họ tên..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex flex-wrap gap-1.5">
            {([['', `Tất cả (${m.rows.length})`]] as [string, string][])
              .concat(
                (Object.keys(STATE_LABEL) as MonitorRow['state'][]).map((k) => [
                  k,
                  `${STATE_LABEL[k].text} (${m.rows.filter((r) => r.state === k).length})`,
                ]),
              )
              .map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setState(key as MonitorRow['state'] | '')}
                  className={`rounded-default px-3 py-1.5 text-xs font-medium transition ${
                    state === key
                      ? 'bg-primary text-white'
                      : 'border border-border-default hover:bg-surface-hover'
                  }`}
                >
                  {label}
                </button>
              ))}
          </div>
        </div>
      </Card>

      <Card>
        {rows.length === 0 ? (
          <Empty message="Không có bài thi nào khớp bộ lọc" />
        ) : (
          <Table head={['Thí sinh', 'Trạng thái', 'Vi phạm', 'Tiến độ', '']}>
            {rows.map((r) => (
              <Row key={r.attemptId}>
                <Cell>
                  <span className="font-medium">{r.studentName}</span>
                  <span className="block font-mono text-[11px] text-text-subdued">
                    {r.studentCode}
                  </span>
                </Cell>
                <Cell>
                  <Badge tone={STATE_LABEL[r.state].tone}>{STATE_LABEL[r.state].text}</Badge>
                </Cell>
                <Cell className="font-mono text-xs">
                  {r.violationCount}/{r.maxViolations}
                </Cell>
                <Cell className="font-mono text-xs">
                  {r.progress.answered}/{r.progress.total}
                </Cell>
                <Cell>
                  <Button variant="ghost" onClick={() => setDetail(r)}>
                    Dòng thời gian
                  </Button>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        open={!!detail}
        title={`Nhật ký giám sát — ${detail?.studentName ?? ''}`}
        onClose={() => setDetail(null)}
        wide
      >
        {timeline.isLoading ? (
          <Loading />
        ) : !timeline.data ? (
          <Empty message="Chưa có dữ liệu" />
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-text-secondary">
              Bắt đầu {formatDateTime(timeline.data.startedAt)} ·{' '}
              {timeline.data.submittedAt
                ? `Nộp bài ${formatDateTime(timeline.data.submittedAt)}`
                : 'Chưa nộp bài'}
            </p>
            {timeline.data.violations.length === 0 ? (
              <Empty message="Không có vi phạm nào" />
            ) : (
              <ol className="space-y-2">
                {timeline.data.violations.map((v) => (
                  <li
                    key={v.sequenceNo}
                    className="flex items-start gap-3 rounded-default border border-border-default bg-danger-bg p-3"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger font-mono text-xs font-bold text-white">
                      {v.sequenceNo}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-danger">{v.note ?? v.type}</p>
                      <p className="font-mono text-[11px] text-text-subdued">
                        {formatDateTime(v.occurredAt)} · {v.type}
                      </p>
                    </div>
                    {v.evidenceUrl && (
                      <EvidenceThumb url={v.evidenceUrl} alt={`Bằng chứng vi phạm ${v.sequenceNo}`} />
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
