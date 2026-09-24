import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import {
  Badge, Button, Card, Cell, Empty, ErrorBox, Input, Loading, Modal,
  PageHeader, Row, Table, difficultyTone,
} from '@/shared/components/ui';
import type { Chapter, InventoryRow, Paginated, Subject } from '@/shared/types/api';

/** Module 1 — Môn học, chương và kho câu hỏi theo chương. */
export function CatalogPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Subject | null>(null);
  const [openSubject, setOpenSubject] = useState(false);
  const [openChapter, setOpenChapter] = useState(false);

  const subjects = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => (await api.get<Paginated<Subject>>('/catalog/subjects?limit=100')).data,
  });

  const chapters = useQuery({
    queryKey: ['chapters', selected?.id],
    enabled: !!selected,
    queryFn: async () =>
      (await api.get<Chapter[]>(`/catalog/subjects/${selected!.id}/chapters`)).data,
  });

  const inventory = useQuery({
    queryKey: ['inventory', selected?.id],
    enabled: !!selected,
    queryFn: async () =>
      (await api.get<InventoryRow[]>(`/catalog/subjects/${selected!.id}/inventory`)).data,
  });

  const createSubject = useMutation({
    mutationFn: (body: unknown) => api.post('/catalog/subjects', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subjects'] });
      setOpenSubject(false);
    },
  });

  const createChapter = useMutation({
    mutationFn: (body: unknown) =>
      api.post(`/catalog/subjects/${selected!.id}/chapters`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chapters', selected?.id] });
      qc.invalidateQueries({ queryKey: ['inventory', selected?.id] });
      setOpenChapter(false);
    },
  });

  const invByChapter = new Map(inventory.data?.map((i) => [i.chapterId, i]) ?? []);

  return (
    <div>
      <PageHeader
        title="Môn học & Chương"
        subtitle="Khai báo môn học, chương mục và theo dõi số câu hỏi khả dụng"
        actions={<Button onClick={() => setOpenSubject(true)}>+ Thêm môn học</Button>}
      />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <p className="border-b border-border-default px-4 py-3 text-sm font-semibold">
            Danh sách môn học
          </p>
          {subjects.isLoading ? (
            <Loading />
          ) : subjects.data?.items.length === 0 ? (
            <Empty message="Chưa có môn học nào" />
          ) : (
            <ul className="p-2">
              {subjects.data?.items.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => setSelected(s)}
                    className={`w-full rounded-default px-3 py-2 text-left text-sm transition ${
                      selected?.id === s.id
                        ? 'bg-selected-bg font-semibold text-primary'
                        : 'hover:bg-surface-hover'
                    }`}
                  >
                    <span className="font-mono text-xs text-text-subdued">{s.code}</span>
                    <span className="block">{s.name}</span>
                    <span className="text-[11px] text-text-subdued">
                      {s.credits} tín chỉ · {s._count?.chapters ?? 0} chương ·{' '}
                      {s._count?.questions ?? 0} câu hỏi
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
            <p className="text-sm font-semibold">
              {selected ? `Chương của ${selected.name}` : 'Chọn một môn học'}
            </p>
            {selected && (
              <Button variant="ghost" onClick={() => setOpenChapter(true)}>
                + Thêm chương
              </Button>
            )}
          </div>

          {!selected ? (
            <Empty message="Chọn môn học ở cột bên trái để xem chương" />
          ) : chapters.isLoading ? (
            <Loading />
          ) : chapters.data?.length === 0 ? (
            <Empty message="Môn học chưa có chương nào" />
          ) : (
            <Table head={['Mã', 'Tên chương', 'Dễ', 'Trung bình', 'Khó', 'Tổng']}>
              {chapters.data?.map((c) => {
                const inv = invByChapter.get(c.id);
                return (
                  <Row key={c.id}>
                    <Cell className="font-mono text-xs">{c.code}</Cell>
                    <Cell>{c.name}</Cell>
                    {(['EASY', 'MEDIUM', 'HARD'] as const).map((d) => (
                      <Cell key={d}>
                        <Badge tone={difficultyTone(d)}>{inv?.available[d] ?? 0}</Badge>
                      </Cell>
                    ))}
                    <Cell className="font-mono font-semibold">{inv?.total ?? 0}</Cell>
                  </Row>
                );
              })}
            </Table>
          )}
        </Card>
      </div>

      <Modal open={openSubject} title="Thêm môn học" onClose={() => setOpenSubject(false)}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            createSubject.mutate({
              code: f.get('code'),
              name: f.get('name'),
              credits: Number(f.get('credits')),
            });
          }}
        >
          <Input name="code" label="Mã môn học" placeholder="MATH102" required />
          <Input name="name" label="Tên môn học" placeholder="Giải tích 2" required />
          <Input name="credits" label="Số tín chỉ" type="number" defaultValue={3} min={1} required />
          {createSubject.isError && <ErrorBox error={createSubject.error} />}
          <Button type="submit" disabled={createSubject.isPending} className="w-full">
            {createSubject.isPending ? 'Đang lưu...' : 'Lưu môn học'}
          </Button>
        </form>
      </Modal>

      <Modal open={openChapter} title="Thêm chương" onClose={() => setOpenChapter(false)}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            createChapter.mutate({
              code: f.get('code'),
              name: f.get('name'),
              orderIndex: Number(f.get('orderIndex')),
            });
          }}
        >
          <Input name="code" label="Mã chương" placeholder="CAL2-C03" required />
          <Input name="name" label="Tên chương" placeholder="Tích phân bội" required />
          <Input
            name="orderIndex"
            label="Thứ tự hiển thị"
            type="number"
            defaultValue={(chapters.data?.length ?? 0) + 1}
            min={0}
          />
          {createChapter.isError && <ErrorBox error={createChapter.error} />}
          <Button type="submit" disabled={createChapter.isPending} className="w-full">
            {createChapter.isPending ? 'Đang lưu...' : 'Lưu chương'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
