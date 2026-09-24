import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { MathContent } from '@/shared/components/ui/MathContent';
import {
  Badge, Button, Card, Cell, ErrorBox, Input, LABEL, Loading, Modal, PageHeader,
  Row, Select, Stat, Table, difficultyTone, formatDateTime,
} from '@/shared/components/ui';
import type {
  Chapter, Difficulty, Exam, MatrixAvailability, ProctoringThresholds,
} from '@/shared/types/api';

type Difficulty3 = 'EASY' | 'MEDIUM' | 'HARD';
const DIFFS: Difficulty3[] = ['EASY', 'MEDIUM', 'HARD'];

interface PreviewQuestion {
  orderIndex: number;
  chapter: { code: string; name: string };
  difficulty: Difficulty;
  content: string;
  options: { id: string; label: string; content: string; isCorrect: boolean }[];
}

/** Module 3 — Khai báo ma trận, cấu hình giám sát, xem trước và phát hành. */
export function ExamEditorPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [grid, setGrid] = useState<Record<string, number>>({});
  const [previewOpen, setPreviewOpen] = useState(false);

  const exam = useQuery({
    queryKey: ['exam', id],
    queryFn: async () => (await api.get<Exam>(`/exams/${id}`)).data,
  });

  const chapters = useQuery({
    queryKey: ['chapters-of-exam', exam.data?.subject.code],
    enabled: !!exam.data,
    queryFn: async () => {
      const subjects = await api.get<{ items: { id: string; code: string }[] }>(
        '/catalog/subjects?limit=100',
      );
      const s = subjects.data.items.find((x) => x.code === exam.data!.subject.code);
      if (!s) return [];
      return (await api.get<Chapter[]>(`/catalog/subjects/${s.id}/chapters`)).data;
    },
  });

  const availability = useQuery({
    queryKey: ['availability', id],
    queryFn: async () =>
      (await api.get<MatrixAvailability>(`/exams/${id}/matrix/availability`)).data,
  });

  // Nạp ma trận đã lưu vào lưới nhập liệu
  useEffect(() => {
    if (!exam.data?.matrixItems) return;
    const next: Record<string, number> = {};
    for (const m of exam.data.matrixItems) next[`${m.chapterId}:${m.difficulty}`] = m.quantity;
    setGrid(next);
  }, [exam.data?.matrixItems]);

  const saveMatrix = useMutation({
    mutationFn: () => {
      const items = Object.entries(grid)
        .filter(([, qty]) => qty > 0)
        .map(([key, quantity]) => {
          const [chapterId, difficulty] = key.split(':');
          return { chapterId, difficulty, quantity };
        });
      return api.put(`/exams/${id}/matrix`, { items });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['availability', id] });
      qc.invalidateQueries({ queryKey: ['exam', id] });
    },
  });

  const savePolicy = useMutation({
    mutationFn: (body: unknown) => api.patch(`/exams/${id}/policy`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exam', id] }),
  });

  const publish = useMutation({
    mutationFn: () => api.patch(`/exams/${id}/publish`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exam', id] }),
  });

  const close = useMutation({
    mutationFn: () => api.patch(`/exams/${id}/close`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exam', id] }),
  });

  const preview = useQuery({
    queryKey: ['preview', id],
    enabled: previewOpen,
    staleTime: 0,
    queryFn: async () => (await api.get<PreviewQuestion[]>(`/exams/${id}/preview`)).data,
  });

  if (exam.isLoading) return <Loading />;
  if (!exam.data) return <ErrorBox error="Không tìm thấy đề thi" />;

  const e = exam.data;
  const isDraft = e.status === 'DRAFT';
  const thresholds = e.policy?.thresholds as ProctoringThresholds | undefined;
  const total = Object.values(grid).reduce((s, v) => s + (v || 0), 0);

  const availByKey = new Map(
    availability.data?.rows.map((r) => [`${r.chapterId}:${r.difficulty}`, r]) ?? [],
  );

  return (
    <div>
      <PageHeader
        title={e.title}
        subtitle={`${e.subject.name} · ${e.courseClass.code} · ${e.durationMinutes} phút · ${formatDateTime(e.openAt)} → ${formatDateTime(e.closeAt)}`}
        actions={
          <>
            <Badge tone={e.status === 'PUBLISHED' ? 'success' : e.status === 'CLOSED' ? 'neutral' : 'warning'}>
              {LABEL.examStatus[e.status]}
            </Badge>
            <Button variant="ghost" onClick={() => setPreviewOpen(true)}>
              Xem trước đề mẫu
            </Button>
            {isDraft ? (
              <Button
                onClick={() => publish.mutate()}
                disabled={publish.isPending || !availability.data?.canPublish}
              >
                {publish.isPending ? 'Đang phát hành...' : 'Phát hành đề thi'}
              </Button>
            ) : e.status === 'PUBLISHED' ? (
              <Button variant="danger" onClick={() => close.mutate()} disabled={close.isPending}>
                Đóng ca thi
              </Button>
            ) : null}
          </>
        }
      />

      {publish.isError && (
        <div className="mb-4">
          <ErrorBox error={publish.error} />
        </div>
      )}

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Tổng số câu" value={availability.data?.totalQuestions ?? 0} hint="theo ma trận" />
        <Stat
          label="Điểm mỗi câu"
          value={(availability.data?.scorePerQuestion ?? 0).toFixed(3)}
          hint={`Thang ${Number(e.totalScore)} điểm`}
        />
        <Stat
          label="Hình thức thi"
          value={LABEL.mode[e.proctoringMode]}
          hint={e.room ? `Phòng ${e.room.code}` : 'Thi tại nhà'}
          tone={e.proctoringMode === 'LAB' ? 'neutral' : 'warning'}
        />
        <Stat
          label="Ngưỡng hủy bài"
          value={thresholds?.maxViolations ?? '—'}
          hint="lần vi phạm"
          tone="danger"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-default px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Ma trận đề thi</p>
              <p className="text-[11px] text-text-subdued">
                Số trong ngoặc là số câu hiện có trong ngân hàng
              </p>
            </div>
            {isDraft && (
              <Button onClick={() => saveMatrix.mutate()} disabled={saveMatrix.isPending || total === 0}>
                {saveMatrix.isPending ? 'Đang lưu...' : `Lưu ma trận (${total} câu)`}
              </Button>
            )}
          </div>

          {saveMatrix.isError && (
            <div className="p-4">
              <ErrorBox error={saveMatrix.error} />
            </div>
          )}

          <Table head={['Chương', 'Dễ', 'Trung bình', 'Khó', 'Tổng']}>
            {chapters.data?.map((c) => {
              const rowTotal = DIFFS.reduce((s, d) => s + (grid[`${c.id}:${d}`] || 0), 0);
              return (
                <Row key={c.id}>
                  <Cell>
                    <span className="font-mono text-[11px] text-text-subdued">{c.code}</span>
                    <span className="block text-sm">{c.name}</span>
                  </Cell>
                  {DIFFS.map((d) => {
                    const key = `${c.id}:${d}`;
                    const av = availByKey.get(key);
                    const stock = av?.available ?? c._count?.questions ?? 0;
                    const short = av?.status === 'THIEU';
                    const tight = av?.status === 'SAT_NGUONG';
                    return (
                      <Cell key={d}>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            disabled={!isDraft}
                            value={grid[key] ?? 0}
                            onChange={(ev) =>
                              setGrid({ ...grid, [key]: Math.max(0, Number(ev.target.value)) })
                            }
                            className={`w-16 rounded-default border px-2 py-1 text-center font-mono text-sm outline-none disabled:bg-surface-hover ${
                              short
                                ? 'border-danger bg-danger-bg'
                                : tight
                                  ? 'border-warning bg-warning-bg'
                                  : 'border-border-default'
                            }`}
                          />
                          <span className="font-mono text-[11px] text-text-subdued">
                            /{av ? av.available : stock}
                          </span>
                        </div>
                      </Cell>
                    );
                  })}
                  <Cell className="font-mono font-semibold">{rowTotal}</Cell>
                </Row>
              );
            })}
          </Table>

          {availability.data && availability.data.rows.length > 0 && (
            <div className="border-t border-border-default p-4">
              <div className="flex flex-wrap gap-2">
                {availability.data.rows.map((r, i) => (
                  <Badge
                    key={i}
                    tone={r.status === 'THIEU' ? 'danger' : r.status === 'SAT_NGUONG' ? 'warning' : 'success'}
                  >
                    {r.chapterCode} · {LABEL.difficulty[r.difficulty]}: cần {r.required}/{r.available}
                    {r.status === 'THIEU' ? ' — THIẾU' : r.status === 'SAT_NGUONG' ? ' — sát ngưỡng' : ''}
                  </Badge>
                ))}
              </div>
              {!availability.data.canPublish && (
                <p className="mt-3 rounded-default bg-danger-bg px-3 py-2 text-sm text-danger">
                  Ngân hàng câu hỏi không đủ so với ma trận. Bổ sung câu hỏi hoặc giảm số lượng
                  trước khi phát hành.
                </p>
              )}
              {availability.data.canPublish &&
                availability.data.rows.some((r) => r.status === 'SAT_NGUONG') && (
                  <p className="mt-3 rounded-default bg-warning-bg px-3 py-2 text-sm text-warning">
                    Một số ô dùng gần hết kho câu hỏi. Đề của các sinh viên sẽ gần giống nhau,
                    nên bổ sung thêm câu hỏi.
                  </p>
                )}
            </div>
          )}
        </Card>

        <Card className="h-fit">
          <p className="border-b border-border-default px-4 py-3 text-sm font-semibold">
            Chính sách giám sát hành vi
          </p>
          <form
            className="space-y-3 p-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              const f = new FormData(ev.currentTarget);
              savePolicy.mutate({
                thresholds: {
                  blurMs: Number(f.get('blurMs')),
                  heartbeatTimeoutS: Number(f.get('heartbeatTimeoutS')),
                  faceAbsentMs: Number(f.get('faceAbsentMs')),
                  maxViolations: Number(f.get('maxViolations')),
                },
                actionOnExceed: f.get('actionOnExceed'),
              });
            }}
          >
            <div className="rounded-default bg-selected-bg px-3 py-2 text-xs text-secondary">
              Hồ sơ đang áp dụng: <strong>{e.policy?.name ?? '—'}</strong>
            </div>

            <Input
              name="blurMs"
              label="Rời màn hình quá (mili giây) thì tính vi phạm"
              type="number"
              min={0}
              step={500}
              defaultValue={thresholds?.blurMs ?? 3000}
              disabled={!isDraft}
            />
            <Input
              name="heartbeatTimeoutS"
              label="Mất tín hiệu quá (giây) thì coi là mất kết nối"
              type="number"
              min={5}
              defaultValue={thresholds?.heartbeatTimeoutS ?? 30}
              disabled={!isDraft}
              hint="Thi tại nhà nên để rộng, mạng gia đình hay chập chờn"
            />
            {e.proctoringMode === 'REMOTE' && (
              <Input
                name="faceAbsentMs"
                label="Vắng mặt trước camera quá (mili giây)"
                type="number"
                min={0}
                step={1000}
                defaultValue={thresholds?.faceAbsentMs ?? 10000}
                disabled={!isDraft}
              />
            )}
            {e.proctoringMode === 'LAB' && (
              <input type="hidden" name="faceAbsentMs" value={thresholds?.faceAbsentMs ?? 0} />
            )}
            <Input
              name="maxViolations"
              label="Số lần vi phạm tối đa"
              type="number"
              min={1}
              defaultValue={thresholds?.maxViolations ?? 3}
              disabled={!isDraft}
            />
            <Select
              name="actionOnExceed"
              label="Xử lý khi vượt ngưỡng"
              defaultValue={e.policy?.actionOnExceed ?? 'FLAG'}
              disabled={!isDraft}
            >
              <option value="WARN">Chỉ cảnh báo</option>
              <option value="FLAG">Gắn cờ để giảng viên xét duyệt</option>
              <option value="AUTO_SUBMIT">Tự động hủy và nộp bài</option>
            </Select>

            {e.proctoringMode === 'LAB' && e.room && (
              <div className="rounded-default border border-border-default p-3">
                <p className="text-xs font-medium text-text-secondary">
                  Dải IP phòng {e.room.code}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {e.room.ipRules.map((r) => (
                    <li key={r.id} className="font-mono text-xs">
                      {r.cidr}
                    </li>
                  ))}
                  {e.room.ipRules.length === 0 && (
                    <li className="text-xs text-danger">
                      Chưa khai báo dải IP — mọi máy đều vào thi được
                    </li>
                  )}
                </ul>
              </div>
            )}

            {savePolicy.isError && <ErrorBox error={savePolicy.error} />}
            {isDraft && (
              <Button type="submit" disabled={savePolicy.isPending} className="w-full">
                {savePolicy.isPending ? 'Đang lưu...' : 'Lưu chính sách'}
              </Button>
            )}
          </form>
        </Card>
      </div>

      {!isDraft && (
        <div className="mt-5 flex gap-2">
          <Link to={`/giam-sat/${id}`}>
            <Button variant="ghost">Mở màn hình giám sát</Button>
          </Link>
          <Link to={`/ket-qua/${id}`}>
            <Button variant="ghost">Xem kết quả và báo cáo</Button>
          </Link>
        </div>
      )}

      <Modal
        open={previewOpen}
        title="Đề mẫu sinh ngẫu nhiên"
        onClose={() => setPreviewOpen(false)}
        wide
      >
        {preview.isLoading ? (
          <Loading />
        ) : preview.isError ? (
          <ErrorBox error={preview.error} />
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-text-subdued">
              Mỗi sinh viên nhận một đề riêng theo đúng ma trận này. Đáp án đúng được tô xanh —
              thí sinh không nhìn thấy dấu hiệu đó.
            </p>
            {preview.data?.map((q) => (
              <div key={q.orderIndex} className="rounded-card border border-border-default p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-primary">
                    Câu {q.orderIndex + 1}
                  </span>
                  <Badge tone={difficultyTone(q.difficulty)}>
                    {LABEL.difficulty[q.difficulty]}
                  </Badge>
                  <span className="font-mono text-[11px] text-text-subdued">
                    {q.chapter.code}
                  </span>
                </div>
                <MathContent content={q.content} className="mb-3" />
                <div className="grid gap-2 sm:grid-cols-2">
                  {q.options.map((o) => (
                    <div
                      key={o.id}
                      className={`flex gap-2 rounded-default border px-3 py-2 text-sm ${
                        o.isCorrect ? 'border-success bg-success-bg' : 'border-border-default'
                      }`}
                    >
                      <span className="font-mono text-xs font-bold">{o.label}.</span>
                      <MathContent content={o.content} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <Button variant="ghost" onClick={() => preview.refetch()} className="w-full">
              Sinh đề mẫu khác
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
