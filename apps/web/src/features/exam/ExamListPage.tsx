import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import {
  Badge, Button, Card, Cell, Empty, ErrorBox, Input, LABEL, Loading, Modal,
  PageHeader, Row, Select, Table, formatDateTime,
} from '@/shared/components/ui';
import { PHASE } from '@/shared/components/phase';
import type { CourseClass, Exam, ExamRoom, Paginated } from '@/shared/types/api';

/** Định dạng cho input datetime-local, vốn cần giờ địa phương không kèm múi. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Module 3 — Danh sách đề thi và tạo đề mới. */
export function ExamListPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'LAB' | 'REMOTE'>('LAB');

  const exams = useQuery({
    queryKey: ['exams'],
    queryFn: async () => (await api.get<Paginated<Exam>>('/exams?limit=100')).data,
  });

  const classes = useQuery({
    queryKey: ['course-classes'],
    queryFn: async () =>
      (await api.get<Paginated<CourseClass>>('/catalog/course-classes?limit=100')).data,
  });

  const rooms = useQuery({
    queryKey: ['rooms'],
    queryFn: async () => (await api.get<ExamRoom[]>('/catalog/rooms')).data,
  });

  const create = useMutation({
    mutationFn: (body: unknown) => api.post<Exam>('/exams', body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['exams'] });
      setOpen(false);
      navigate(`/de-thi/${res.data.id}`);
    },
  });

  const now = new Date();
  const later = new Date(now.getTime() + 3 * 3600_000);

  return (
    <div>
      <PageHeader
        title="Đề thi & Ma trận đề"
        subtitle="Mỗi đề thi tự chọn hình thức thi, kéo theo bộ ngưỡng giám sát tương ứng"
        actions={<Button onClick={() => setOpen(true)}>+ Tạo đề thi</Button>}
      />

      <Card>
        {exams.isLoading ? (
          <Loading />
        ) : exams.data?.items.length === 0 ? (
          <Empty message="Chưa có đề thi nào" />
        ) : (
          <Table
            head={['Tiêu đề', 'Lớp học phần', 'Thời lượng', 'Khung giờ', 'Hình thức', 'Trạng thái', '']}
          >
            {exams.data?.items.map((e) => (
              <Row key={e.id} className={e.phase === 'DANG_DIEN_RA' ? 'bg-success-bg/40' : ''}>
                <Cell>
                  <Link to={`/de-thi/${e.id}`} className="font-medium text-secondary hover:underline">
                    {e.title}
                  </Link>
                  <span className="block text-[11px] text-text-subdued">
                    {e._count?.matrixItems ?? 0} dòng ma trận · {e._count?.attempts ?? 0} lượt thi
                  </span>
                </Cell>
                <Cell>
                  <span className="font-mono text-xs">{e.courseClass.code}</span>
                  <span className="block text-[11px] text-text-subdued">{e.subject.name}</span>
                </Cell>
                <Cell className="font-mono text-xs">{e.durationMinutes}′</Cell>
                <Cell className="text-xs">
                  {formatDateTime(e.openAt)}
                  <span className="block text-text-subdued">→ {formatDateTime(e.closeAt)}</span>
                </Cell>
                <Cell>
                  <Badge tone={e.proctoringMode === 'LAB' ? 'info' : 'warning'}>
                    {LABEL.mode[e.proctoringMode]}
                  </Badge>
                </Cell>
                <Cell>
                  <Badge tone={PHASE[e.phase].tone}>{PHASE[e.phase].text}</Badge>
                  {e.phase === 'DANG_DIEN_RA' && e.inProgressCount > 0 && (
                    <span className="mt-0.5 block font-mono text-[11px] text-success">
                      {e.inProgressCount} SV đang làm bài
                    </span>
                  )}
                </Cell>
                <Cell>
                  <div className="flex gap-2">
                    <Link to={`/de-thi/${e.id}`}>
                      <Button variant="ghost">Mở</Button>
                    </Link>
                    {e.status !== 'DRAFT' && (
                      <>
                        <Link to={`/giam-sat/${e.id}`}>
                          <Button variant="ghost">Giám sát</Button>
                        </Link>
                        <Link to={`/ket-qua/${e.id}`}>
                          <Button variant="ghost">Kết quả</Button>
                        </Link>
                      </>
                    )}
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={open} title="Tạo đề thi" onClose={() => setOpen(false)} wide>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            create.mutate({
              title: f.get('title'),
              courseClassId: f.get('courseClassId'),
              durationMinutes: Number(f.get('durationMinutes')),
              openAt: new Date(String(f.get('openAt'))).toISOString(),
              closeAt: new Date(String(f.get('closeAt'))).toISOString(),
              totalScore: Number(f.get('totalScore')),
              resultDisplay: f.get('resultDisplay'),
              proctoringMode: mode,
              roomId: mode === 'LAB' ? f.get('roomId') : undefined,
            });
          }}
        >
          <Input name="title" label="Tiêu đề đề thi" placeholder="Thi giữa kỳ Giải tích 2" required />

          <div className="grid gap-3 sm:grid-cols-2">
            <Select name="courseClassId" label="Lớp học phần" required>
              {classes.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name} ({c._count.enrollments} SV)
                </option>
              ))}
            </Select>
            <Input
              name="durationMinutes"
              label="Thời lượng làm bài (phút)"
              type="number"
              defaultValue={60}
              min={1}
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              name="openAt"
              label="Thời điểm mở phòng thi"
              type="datetime-local"
              defaultValue={toLocalInput(now)}
              required
            />
            <Input
              name="closeAt"
              label="Thời điểm đóng phòng thi"
              type="datetime-local"
              defaultValue={toLocalInput(later)}
              required
              hint="Khung giờ phải dài hơn thời lượng làm bài"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              name="totalScore"
              label="Tổng điểm quy đổi"
              type="number"
              step="0.5"
              defaultValue={10}
              required
            />
            <Select name="resultDisplay" label="Hiển thị kết quả" defaultValue="SCORE_ONLY">
              <option value="NONE">Không công bố</option>
              <option value="SCORE_ONLY">Chỉ hiện điểm</option>
              <option value="WITH_ANSWERS">Hiện kèm đáp án đúng</option>
            </Select>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-text-secondary">Hình thức thi</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(['LAB', 'REMOTE'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-card border-2 p-3 text-left transition ${
                    mode === m
                      ? 'border-secondary bg-selected-bg'
                      : 'border-border-default hover:bg-surface-hover'
                  }`}
                >
                  <span className="block text-sm font-semibold">{LABEL.mode[m]}</span>
                  <span className="mt-0.5 block text-[11px] text-text-secondary">
                    {m === 'LAB'
                      ? 'Khóa dải IP phòng máy · ngưỡng chặt · hủy bài sau 3 vi phạm'
                      : 'Nhận diện khuôn mặt tại máy SV · ngưỡng rộng · hủy sau 5 vi phạm'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {mode === 'LAB' && (
            <Select name="roomId" label="Phòng máy" required>
              {rooms.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} — {r.name} ({r.ipRules.length} dải IP)
                </option>
              ))}
            </Select>
          )}

          {create.isError && <ErrorBox error={create.error} />}
          <Button type="submit" disabled={create.isPending} className="w-full">
            {create.isPending ? 'Đang tạo...' : 'Tạo đề và khai báo ma trận'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
