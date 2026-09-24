import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { api } from '@/shared/api/client';
import {
  Badge, Button, Card, Cell, Empty, ErrorBox, Input, LABEL, Loading, Modal,
  PageHeader, Row, Stat, Table, formatClock, formatDateTime,
} from '@/shared/components/ui';
import { EvidenceThumb } from './EvidenceThumb';
import type { LiveMonitor, MonitorRow, Timeline } from '@/shared/types/api';

const STATE_LABEL: Record<MonitorRow['state'], { text: string; tone: any }> = {
  BINH_THUONG: { text: 'Bình thường', tone: 'success' },
  NHAC_NHO: { text: 'Nhắc nhở', tone: 'warning' },
  DANH_DAU: { text: 'Đánh dấu', tone: 'danger' },
  MAT_KET_NOI: { text: 'Mất kết nối', tone: 'danger' },
  DA_NOP: { text: 'Đã nộp', tone: 'neutral' },
};

/** Module 5 — Theo dõi trực tiếp ca thi (chức năng 5.7). */
export function LiveMonitorPage() {
  const { examId = '' } = useParams();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<MonitorRow['state'] | ''>('');
  const [q, setQ] = useState('');
  const [timelineOf, setTimelineOf] = useState<MonitorRow | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [live, setLive] = useState(false);

  const monitor = useQuery({
    queryKey: ['monitor', examId],
    queryFn: async () => (await api.get<LiveMonitor>(`/proctoring/exams/${examId}/monitor`)).data,
    refetchInterval: 5000,
  });

  // Kênh realtime đẩy cập nhật ngay khi có vi phạm, không phải chờ chu kỳ 5 giây
  useEffect(() => {
    const socket: Socket = io('/', { transports: ['websocket', 'polling'] });
    socket.on('connect', () => {
      setLive(true);
      socket.emit('monitor:join', { examId });
    });
    socket.on('disconnect', () => setLive(false));
    socket.on('monitor:update', () => qc.invalidateQueries({ queryKey: ['monitor', examId] }));
    return () => {
      socket.close();
    };
  }, [examId, qc]);

  const timeline = useQuery({
    queryKey: ['timeline', timelineOf?.attemptId],
    enabled: !!timelineOf,
    queryFn: async () =>
      (await api.get<Timeline>(`/proctoring/attempts/${timelineOf!.attemptId}/timeline`)).data,
  });

  const broadcast = useMutation({
    mutationFn: (message: string) =>
      api.post(`/proctoring/exams/${examId}/broadcast`, { message }),
  });

  if (monitor.isLoading) return <Loading />;
  if (monitor.isError) return <ErrorBox error={monitor.error} />;

  const m = monitor.data!;
  const rows = m.rows.filter(
    (r) =>
      (!filter || r.state === filter) &&
      (!q ||
        r.studentCode.toLowerCase().includes(q.toLowerCase()) ||
        r.studentName.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div>
      <PageHeader
        title="Giám sát hành vi thi"
        subtitle={`${m.examTitle} · ${m.subject} · ${LABEL.mode[m.proctoringMode]}${m.room ? ` · ${m.room.name}` : ''}`}
        actions={
          <>
            <Badge tone={live ? 'success' : 'neutral'}>
              {live ? 'Kết nối trực tiếp' : 'Làm mới mỗi 5 giây'}
            </Badge>
            <Button variant="ghost" onClick={() => setBroadcastOpen(true)}>
              Gửi cảnh báo chung
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Sĩ số ca thi" value={m.stats.enrolled} hint={`${m.stats.started} đã vào thi`} />
        <Stat label="Đang trực tuyến" value={m.stats.online} tone="success" hint="còn tín hiệu" />
        <Stat label="Nhắc nhở" value={m.stats.warned} tone="warning" hint="1 đến 2 vi phạm" />
        <Stat
          label="Vượt ngưỡng"
          value={m.stats.flagged}
          tone="danger"
          hint={`≥ ${m.thresholds.maxViolations} vi phạm`}
        />
        <Stat label="Mất kết nối" value={m.stats.disconnected} tone="danger" hint="cần kiểm tra" />
      </div>

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input
            placeholder="Tìm theo MSSV hoặc họ tên..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
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
                  onClick={() => setFilter(key as any)}
                  className={`rounded-default px-3 py-1.5 text-xs font-medium transition ${
                    filter === key
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
          <Empty message="Không có thí sinh nào khớp bộ lọc" />
        ) : (
          <Table
            head={['Thí sinh', 'Kết nối', 'Tiến độ', 'Còn lại', 'Vi phạm gần nhất', 'Trạng thái', '']}
          >
            {rows.map((r) => (
              <Row key={r.attemptId}>
                <Cell>
                  <span className="font-medium">{r.studentName}</span>
                  <span className="block font-mono text-[11px] text-text-subdued">
                    {r.studentCode}
                    {r.machineCode ? ` · ${r.machineCode}` : ''}
                  </span>
                </Cell>
                <Cell>
                  <span className="flex items-center gap-1.5 text-xs">
                    <span
                      className={`h-2 w-2 rounded-full ${r.online ? 'animate-pulse bg-success' : 'bg-danger'}`}
                    />
                    {r.online ? 'Trực tuyến' : 'Mất tín hiệu'}
                  </span>
                  <span className="block font-mono text-[11px] text-text-subdued">
                    {r.ipAddress ?? '—'}
                  </span>
                </Cell>
                <Cell>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-hover">
                      <div
                        className="h-full bg-secondary"
                        style={{ width: `${r.progressPercent}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs">
                      {r.progress.answered}/{r.progress.total}
                    </span>
                  </div>
                </Cell>
                <Cell className="font-mono text-xs">
                  {r.status === 'IN_PROGRESS' ? formatClock(r.remainingSeconds) : '—'}
                </Cell>
                <Cell className="text-xs">
                  {r.recentViolations.length === 0 ? (
                    <span className="text-text-subdued">Không có</span>
                  ) : (
                    <span className="text-warning">{r.recentViolations[0].note}</span>
                  )}
                </Cell>
                <Cell>
                  <Badge tone={STATE_LABEL[r.state].tone}>
                    {STATE_LABEL[r.state].text}
                    {r.violationCount > 0 ? ` (${r.violationCount}/${r.maxViolations})` : ''}
                  </Badge>
                </Cell>
                <Cell>
                  <Button variant="ghost" onClick={() => setTimelineOf(r)}>
                    Dòng thời gian
                  </Button>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        open={!!timelineOf}
        title={`Nhật ký giám sát — ${timelineOf?.studentName ?? ''}`}
        onClose={() => setTimelineOf(null)}
        wide
      >
        {timeline.isLoading ? (
          <Loading />
        ) : !timeline.data ? (
          <Empty message="Chưa có dữ liệu" />
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Vi phạm" value={timeline.data.violationCount} tone="danger" />
              <Stat label="Sự kiện ghi nhận" value={timeline.data.events.length} />
              <Stat label="Bắt đầu" value={formatDateTime(timeline.data.startedAt).slice(-5)} />
              <Stat
                label="Nộp bài"
                value={
                  timeline.data.submittedAt
                    ? formatDateTime(timeline.data.submittedAt).slice(-5)
                    : 'Chưa nộp'
                }
              />
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold">Các lần vi phạm</p>
              {timeline.data.violations.length === 0 ? (
                <Empty message="Thí sinh không có vi phạm nào" />
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
                          Phút thứ {Math.floor(v.offsetSeconds / 60)}:
                          {String(v.offsetSeconds % 60).padStart(2, '0')} kể từ lúc bắt đầu ·{' '}
                          {formatDateTime(v.occurredAt)}
                        </p>
                      </div>

                      {/* Ảnh bằng chứng — chức năng 5.11, chỉ có ở ca thi từ xa */}
                      {v.evidenceUrl && (
                        <EvidenceThumb
                          url={v.evidenceUrl}
                          alt={`Ảnh bằng chứng vi phạm ${v.sequenceNo}`}
                        />
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold">
                Toàn bộ sự kiện thô ({timeline.data.events.length})
              </p>
              <div className="max-h-64 overflow-y-auto rounded-default border border-border-default">
                <Table head={['Phút', 'Loại tín hiệu', 'Thời lượng']}>
                  {timeline.data.events.map((ev, i) => (
                    <Row key={i}>
                      <Cell className="font-mono text-xs">
                        {Math.floor(ev.offsetSeconds / 60)}:
                        {String(ev.offsetSeconds % 60).padStart(2, '0')}
                      </Cell>
                      <Cell className="font-mono text-xs">{ev.type}</Cell>
                      <Cell className="font-mono text-xs">
                        {ev.durationMs ? `${(ev.durationMs / 1000).toFixed(1)}s` : '—'}
                      </Cell>
                    </Row>
                  ))}
                </Table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={broadcastOpen}
        title="Gửi cảnh báo tới toàn bộ thí sinh"
        onClose={() => {
          setBroadcastOpen(false);
          broadcast.reset();
        }}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const msg = String(new FormData(e.currentTarget).get('message') ?? '');
            if (msg.trim()) broadcast.mutate(msg);
          }}
        >
          <Input
            name="message"
            label="Nội dung cảnh báo"
            placeholder="Vui lòng giữ tiêu điểm trên tab thi"
            required
          />
          {broadcast.isError && <ErrorBox error={broadcast.error} />}
          {broadcast.data && (
            <p className="rounded-default bg-success-bg px-3 py-2 text-sm text-success">
              Đã gửi tới {(broadcast.data.data as any).sent} thí sinh đang thi.
            </p>
          )}
          <Button type="submit" disabled={broadcast.isPending} className="w-full">
            {broadcast.isPending ? 'Đang gửi...' : 'Gửi cảnh báo'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
