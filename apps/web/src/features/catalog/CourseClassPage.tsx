import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import {
  Badge, Button, Card, Cell, Empty, ErrorBox, Input, Loading, Modal, PageHeader,
  Row, Select, Table, Textarea,
} from '@/shared/components/ui';
import type { CourseClass, Paginated, Subject, User } from '@/shared/types/api';

/** Module 1 — Lớp học phần và danh sách sinh viên trong lớp. */
export function CourseClassPage() {
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = useState(false);
  const [enrollTo, setEnrollTo] = useState<CourseClass | null>(null);
  const [viewing, setViewing] = useState<CourseClass | null>(null);

  const classes = useQuery({
    queryKey: ['course-classes'],
    queryFn: async () =>
      (await api.get<Paginated<CourseClass>>('/catalog/course-classes?limit=100')).data,
  });

  const subjects = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => (await api.get<Paginated<Subject>>('/catalog/subjects?limit=100')).data,
  });

  const lecturers = useQuery({
    queryKey: ['users', 'LECTURER'],
    queryFn: async () =>
      (await api.get<Paginated<User>>('/users?role=LECTURER&limit=100')).data,
  });

  const enrollments = useQuery({
    queryKey: ['enrollments', viewing?.id],
    enabled: !!viewing,
    queryFn: async () =>
      (
        await api.get<{ id: string; student: User }[]>(
          `/catalog/course-classes/${viewing!.id}/enrollments`,
        )
      ).data,
  });

  const createClass = useMutation({
    mutationFn: (body: unknown) => api.post('/catalog/course-classes', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-classes'] });
      setOpenCreate(false);
    },
  });

  const enroll = useMutation({
    mutationFn: (codes: string[]) =>
      api.post(`/catalog/course-classes/${enrollTo!.id}/enrollments`, { studentCodes: codes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course-classes'] }),
  });

  return (
    <div>
      <PageHeader
        title="Lớp học phần"
        subtitle="Gán giảng viên phụ trách và danh sách sinh viên cho từng lớp"
        actions={<Button onClick={() => setOpenCreate(true)}>+ Thêm lớp học phần</Button>}
      />

      <Card>
        {classes.isLoading ? (
          <Loading />
        ) : classes.data?.items.length === 0 ? (
          <Empty message="Chưa có lớp học phần nào" />
        ) : (
          <Table
            head={['Mã lớp', 'Tên lớp', 'Môn học', 'Giảng viên', 'Sĩ số', 'Học kỳ', 'Thao tác']}
          >
            {classes.data?.items.map((c) => (
              <Row key={c.id}>
                <Cell className="font-mono text-xs font-semibold">{c.code}</Cell>
                <Cell>{c.name}</Cell>
                <Cell>
                  <span className="block">{c.subject.name}</span>
                  <span className="text-[11px] text-text-subdued">
                    {c.subject.credits} tín chỉ
                  </span>
                </Cell>
                <Cell>
                  <span className="block">{c.lecturer.fullName}</span>
                  <span className="text-[11px] text-text-subdued">{c.lecturer.email}</span>
                </Cell>
                <Cell>
                  <Badge tone={c._count.enrollments > 0 ? 'info' : 'neutral'}>
                    {c._count.enrollments}
                    {c.capacity > 0 ? ` / ${c.capacity}` : ''}
                  </Badge>
                </Cell>
                <Cell className="text-xs">{c.semester}</Cell>
                <Cell>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setViewing(c)}>
                      Xem SV
                    </Button>
                    <Button variant="ghost" onClick={() => setEnrollTo(c)}>
                      Gán SV
                    </Button>
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={openCreate} title="Thêm lớp học phần" onClose={() => setOpenCreate(false)}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            createClass.mutate({
              code: f.get('code'),
              name: f.get('name'),
              subjectId: f.get('subjectId'),
              lecturerId: f.get('lecturerId'),
              semester: f.get('semester'),
              capacity: Number(f.get('capacity')),
            });
          }}
        >
          <Input name="code" label="Mã lớp" placeholder="MATH102.N04" required />
          <Input name="name" label="Tên lớp" placeholder="Giải tích 2 - Nhóm 04" required />
          <Select name="subjectId" label="Môn học" required>
            {subjects.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.name}
              </option>
            ))}
          </Select>
          <Select name="lecturerId" label="Giảng viên phụ trách" required>
            {lecturers.data?.items.map((l) => (
              <option key={l.id} value={l.id}>
                {l.fullName} ({l.code})
              </option>
            ))}
          </Select>
          <Input name="semester" label="Học kỳ" placeholder="HK2 2024-2025" required />
          <Input name="capacity" label="Sĩ số tối đa" type="number" defaultValue={70} min={0} />
          {createClass.isError && <ErrorBox error={createClass.error} />}
          <Button type="submit" disabled={createClass.isPending} className="w-full">
            {createClass.isPending ? 'Đang lưu...' : 'Lưu lớp học phần'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={!!enrollTo}
        title={`Gán sinh viên vào ${enrollTo?.code ?? ''}`}
        onClose={() => {
          setEnrollTo(null);
          enroll.reset();
        }}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const raw = String(new FormData(e.currentTarget).get('codes') ?? '');
            const codes = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
            if (codes.length > 0) enroll.mutate(codes);
          }}
        >
          <Textarea
            name="codes"
            label="Danh sách MSSV"
            rows={7}
            placeholder={'3122410127\n3123410013\n3123410048'}
          />
          <p className="text-xs text-text-subdued">
            Mỗi MSSV một dòng, hoặc ngăn cách bằng dấu phẩy. MSSV đã có trong lớp sẽ được bỏ qua.
          </p>
          {enroll.isError && <ErrorBox error={enroll.error} />}
          {enroll.data && (
            <div className="space-y-1 rounded-default bg-success-bg px-3 py-2 text-sm text-success">
              <p>Đã gán {(enroll.data.data as any).enrolled} sinh viên.</p>
              {(enroll.data.data as any).alreadyEnrolled > 0 && (
                <p>Bỏ qua {(enroll.data.data as any).alreadyEnrolled} sinh viên đã có trong lớp.</p>
              )}
              {(enroll.data.data as any).notFound?.length > 0 && (
                <p className="text-danger">
                  Không tìm thấy: {(enroll.data.data as any).notFound.join(', ')}
                </p>
              )}
            </div>
          )}
          <Button type="submit" disabled={enroll.isPending} className="w-full">
            {enroll.isPending ? 'Đang gán...' : 'Gán vào lớp'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={!!viewing}
        title={`Sinh viên lớp ${viewing?.code ?? ''}`}
        onClose={() => setViewing(null)}
        wide
      >
        {enrollments.isLoading ? (
          <Loading />
        ) : enrollments.data?.length === 0 ? (
          <Empty message="Lớp chưa có sinh viên nào" />
        ) : (
          <Table head={['STT', 'MSSV', 'Họ và tên', 'Email']}>
            {enrollments.data?.map((e, i) => (
              <Row key={e.id}>
                <Cell className="font-mono text-xs">{i + 1}</Cell>
                <Cell className="font-mono text-xs">{e.student.code}</Cell>
                <Cell>{e.student.fullName}</Cell>
                <Cell className="text-xs text-text-secondary">{e.student.email}</Cell>
              </Row>
            ))}
          </Table>
        )}
      </Modal>
    </div>
  );
}
