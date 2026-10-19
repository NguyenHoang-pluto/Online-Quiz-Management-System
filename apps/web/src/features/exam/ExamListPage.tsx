import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import {
  Badge, Button, Card, Cell, Empty, LABEL, Loading, Modal, PageHeader, Row, Table,
  formatDateTime,
} from '@/shared/components/ui';
import { PHASE } from '@/shared/components/phase';
import type { Exam, Paginated } from '@/shared/types/api';
import { ExamForm } from './ExamForm';

/** Module 3 — Danh sách đề thi và tạo đề mới. */
export function ExamListPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const exams = useQuery({
    queryKey: ['exams'],
    queryFn: async () => (await api.get<Paginated<Exam>>('/exams?limit=100')).data,
  });

  const create = useMutation({
    mutationFn: (body: unknown) => api.post<Exam>('/exams', body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['exams'] });
      setOpen(false);
      navigate(`/de-thi/${res.data.id}`);
    },
  });

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
        <ExamForm
          pending={create.isPending}
          error={create.isError ? create.error : null}
          submitLabel="Tạo đề và khai báo ma trận"
          onSubmit={(body) => create.mutate(body)}
        />
      </Modal>
    </div>
  );
}
