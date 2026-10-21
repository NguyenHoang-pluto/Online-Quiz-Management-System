import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { MathContent } from '@/shared/components/ui/MathContent';
import {
  Badge, Button, Card, Empty, Input, LABEL, Loading, PageHeader,
  Pager, Select, difficultyTone,
} from '@/shared/components/ui';
import type { Chapter, Paginated, Question, Subject } from '@/shared/types/api';
import { QuestionEditorModal } from './QuestionEditorModal';

/** Module 2 — Quan ly ngan hang cau hoi (loc + xem + tao/sua qua modal dung chung). */
export function QuestionBankPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [subjectId, setSubjectId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [q, setQ] = useState('');
  const [editor, setEditor] = useState<{ open: boolean; initial: Question | null }>({
    open: false,
    initial: null,
  });

  const subjects = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => (await api.get<Paginated<Subject>>('/catalog/subjects?limit=100')).data,
  });

  const chapters = useQuery({
    queryKey: ['chapters', subjectId],
    enabled: !!subjectId,
    queryFn: async () => (await api.get<Chapter[]>(`/catalog/subjects/${subjectId}/chapters`)).data,
  });

  const editorChapters = useQuery({
    queryKey: ['chapters', 'editor', subjectId],
    enabled: editor.open && !!subjectId,
    queryFn: async () => (await api.get<Chapter[]>(`/catalog/subjects/${subjectId}/chapters`)).data,
  });

  const questions = useQuery({
    queryKey: ['questions', page, subjectId, chapterId, difficulty, q],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: '10' });
      if (subjectId) p.set('subjectId', subjectId);
      if (chapterId) p.set('chapterId', chapterId);
      if (difficulty) p.set('difficulty', difficulty);
      if (q) p.set('q', q);
      return (await api.get<Paginated<Question>>(`/questions?${p}`)).data;
    },
  });

  const toggleStatus = useMutation({
    mutationFn: (item: Question) =>
      api.patch(`/questions/${item.id}/${item.status === 'ACTIVE' ? 'disable' : 'enable'}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questions'] }),
  });

  return (
    <div>
      <PageHeader
        title="Ngân hàng câu hỏi"
        subtitle="Soạn thảo công thức toán bằng LaTeX, xem trước đúng như thí sinh nhìn thấy"
        actions={
          <div className="flex gap-2">
            <Link to="/ngan-hang-cau-hoi/import">
              <Button variant="ghost">Import từ file</Button>
            </Link>
            <Button
              onClick={() => setEditor({ open: true, initial: null })}
              disabled={!subjectId}
            >
              + Soạn câu hỏi mới
            </Button>
          </div>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Select
            label="Môn học"
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setChapterId('');
              setPage(1);
            }}
          >
            <option value="">Tất cả môn học</option>
            {subjects.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.name}
              </option>
            ))}
          </Select>
          <Select
            label="Chương"
            value={chapterId}
            disabled={!subjectId}
            onChange={(e) => {
              setChapterId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả chương</option>
            {chapters.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            label="Mức độ"
            value={difficulty}
            onChange={(e) => {
              setDifficulty(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả mức độ</option>
            <option value="EASY">Dễ</option>
            <option value="MEDIUM">Trung bình</option>
            <option value="HARD">Khó</option>
          </Select>
          <Input
            label="Tìm kiếm"
            placeholder="Nội dung hoặc chuỗi LaTeX..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {!subjectId && (
          <p className="mt-3 text-xs text-text-subdued">
            Chọn môn học để bật nút soạn câu hỏi mới.
          </p>
        )}
      </Card>

      {questions.isLoading ? (
        <Loading />
      ) : questions.data?.items.length === 0 ? (
        <Card>
          <Empty message="Không có câu hỏi nào khớp bộ lọc" />
        </Card>
      ) : (
        <div className="space-y-3">
          {questions.data?.items.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-text-subdued">
                  {item.chapter.code}
                </span>
                <Badge tone={difficultyTone(item.difficulty)}>
                  {LABEL.difficulty[item.difficulty]}
                </Badge>
                <Badge>{LABEL.questionType[item.type]}</Badge>
                <Badge tone={item.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {item.status === 'ACTIVE' ? 'Khả dụng' : 'Vô hiệu hóa'}
                </Badge>
                <span className="ml-auto flex gap-1">
                  <Button variant="ghost" onClick={() => setEditor({ open: true, initial: item })}>
                    Sửa
                  </Button>
                  <Button variant="ghost" onClick={() => toggleStatus.mutate(item)}>
                    {item.status === 'ACTIVE' ? 'Vô hiệu hóa' : 'Kích hoạt lại'}
                  </Button>
                </span>
              </div>

              <MathContent content={item.content} className="mb-3 text-[15px]" />

              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt=""
                  className="mb-3 max-h-40 rounded-default border border-border-default"
                />
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                {item.options.map((o) => (
                  <div
                    key={o.id}
                    className={`flex items-start gap-2 rounded-default border px-3 py-2 text-sm ${
                      o.isCorrect
                        ? 'border-success bg-success-bg'
                        : 'border-border-default bg-surface'
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-default font-mono text-xs font-semibold ${
                        o.isCorrect ? 'bg-success text-white' : 'bg-surface-hover'
                      }`}
                    >
                      {o.label}
                    </span>
                    <MathContent content={o.content} />
                  </div>
                ))}
              </div>
            </Card>
          ))}
          <Card>
            <Pager page={page} totalPages={questions.data?.totalPages ?? 1} onChange={setPage} />
          </Card>
        </div>
      )}

      <QuestionEditorModal
        open={editor.open}
        initial={editor.initial}
        chapters={editorChapters.data ?? []}
        defaultChapterId={chapterId}
        onClose={() => setEditor({ open: false, initial: null })}
        onSaved={() => qc.invalidateQueries({ queryKey: ['questions'] })}
      />
    </div>
  );
}
