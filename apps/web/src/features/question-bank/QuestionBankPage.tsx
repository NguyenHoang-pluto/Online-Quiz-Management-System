import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { MathContent } from '@/shared/components/ui/MathContent';
import {
  Badge, Button, Card, Empty, ErrorBox, Input, LABEL, Loading, Modal, PageHeader,
  Pager, Select, Textarea, difficultyTone,
} from '@/shared/components/ui';
import type { Chapter, Paginated, Question, Subject } from '@/shared/types/api';

const SYMBOLS = [
  '\\frac{a}{b}', '\\sqrt{x}', '\\int_{a}^{b}', '\\iint_D', '\\sum_{i=1}^{n}',
  '\\lim_{x \\to 0}', '\\partial', '\\infty', '\\alpha', '\\beta', '\\pi',
  '\\leq', '\\geq', '\\neq', '\\in',
];

interface DraftOption {
  label: string;
  content: string;
  isCorrect: boolean;
}

const emptyDraft = () => ({
  chapterId: '',
  type: 'SINGLE_CHOICE',
  difficulty: 'MEDIUM',
  content: '',
  explanation: '',
  options: ['A', 'B', 'C', 'D'].map((label) => ({ label, content: '', isCorrect: false })),
});

/** Module 2 — Soạn thảo và quản lý ngân hàng câu hỏi. */
export function QuestionBankPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [subjectId, setSubjectId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [q, setQ] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<ReturnType<typeof emptyDraft>>(emptyDraft());

  const subjects = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => (await api.get<Paginated<Subject>>('/catalog/subjects?limit=100')).data,
  });

  const chapters = useQuery({
    queryKey: ['chapters', subjectId],
    enabled: !!subjectId,
    queryFn: async () => (await api.get<Chapter[]>(`/catalog/subjects/${subjectId}/chapters`)).data,
  });

  const draftChapters = useQuery({
    queryKey: ['chapters', 'draft', subjectId],
    enabled: editorOpen && !!subjectId,
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

  const createQuestion = useMutation({
    mutationFn: (body: unknown) => api.post('/questions', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['questions'] });
      setEditorOpen(false);
      setDraft(emptyDraft());
    },
  });

  const toggleStatus = useMutation({
    mutationFn: (item: Question) =>
      api.patch(`/questions/${item.id}/${item.status === 'ACTIVE' ? 'disable' : 'enable'}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questions'] }),
  });

  const setOption = (i: number, patch: Partial<DraftOption>) =>
    setDraft((d) => ({
      ...d,
      options: d.options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)),
    }));

  const pickCorrect = (i: number) =>
    setDraft((d) => ({
      ...d,
      options: d.options.map((o, idx) =>
        d.type === 'MULTIPLE_CHOICE'
          ? idx === i
            ? { ...o, isCorrect: !o.isCorrect }
            : o
          : { ...o, isCorrect: idx === i },
      ),
    }));

  const insertSymbol = (sym: string) =>
    setDraft((d) => ({ ...d, content: `${d.content}$${sym}$` }));

  const submit = () => {
    const options = draft.options.filter((o) => o.content.trim() !== '');
    createQuestion.mutate({
      chapterId: draft.chapterId,
      type: draft.type,
      difficulty: draft.difficulty,
      content: draft.content,
      explanation: draft.explanation || undefined,
      options,
    });
  };

  return (
    <div>
      <PageHeader
        title="Ngân hàng câu hỏi"
        subtitle="Soạn thảo công thức toán bằng LaTeX, xem trước đúng như thí sinh nhìn thấy"
        actions={
          <Button
            onClick={() => {
              setDraft({ ...emptyDraft(), chapterId: '' });
              setEditorOpen(true);
            }}
            disabled={!subjectId}
          >
            + Soạn câu hỏi mới
          </Button>
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
                <span className="ml-auto">
                  <Button variant="ghost" onClick={() => toggleStatus.mutate(item)}>
                    {item.status === 'ACTIVE' ? 'Vô hiệu hóa' : 'Kích hoạt lại'}
                  </Button>
                </span>
              </div>

              <MathContent content={item.content} className="mb-3 text-[15px]" />

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

      <Modal open={editorOpen} title="Soạn câu hỏi" onClose={() => setEditorOpen(false)} wide>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              label="Chương"
              value={draft.chapterId}
              onChange={(e) => setDraft({ ...draft, chapterId: e.target.value })}
            >
              <option value="">— Chọn chương —</option>
              {draftChapters.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              label="Loại câu hỏi"
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value })}
            >
              <option value="SINGLE_CHOICE">1 đáp án</option>
              <option value="MULTIPLE_CHOICE">Nhiều đáp án</option>
              <option value="TRUE_FALSE">Đúng / Sai</option>
            </Select>
            <Select
              label="Mức độ"
              value={draft.difficulty}
              onChange={(e) => setDraft({ ...draft, difficulty: e.target.value })}
            >
              <option value="EASY">Dễ (Nhận biết)</option>
              <option value="MEDIUM">Trung bình (Thông hiểu)</option>
              <option value="HARD">Khó (Vận dụng cao)</option>
            </Select>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-text-secondary">
              Chèn ký hiệu toán học
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SYMBOLS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => insertSymbol(s)}
                  className="rounded-default border border-border-default bg-surface px-2 py-1 font-mono text-[11px] hover:bg-selected-bg"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Textarea
              label="Nội dung câu hỏi (LaTeX đặt giữa dấu $)"
              rows={6}
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              placeholder="Tính tích phân $\int_0^1 x^2\,dx$"
            />
            <div>
              <p className="mb-1 text-xs font-medium text-text-secondary">
                Xem trước như thí sinh nhìn thấy
              </p>
              <div className="min-h-[9rem] rounded-default border border-border-default bg-surface p-3">
                {draft.content ? (
                  <MathContent content={draft.content} />
                ) : (
                  <span className="text-sm text-text-subdued">Chưa có nội dung</span>
                )}
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-text-secondary">
              Các phương án —{' '}
              {draft.type === 'MULTIPLE_CHOICE'
                ? 'bấm ô vuông để chọn nhiều đáp án đúng'
                : 'bấm ô tròn để chọn đáp án đúng duy nhất'}
            </p>
            <div className="space-y-2">
              {draft.options.slice(0, draft.type === 'TRUE_FALSE' ? 2 : 4).map((o, i) => (
                <div key={o.label} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => pickCorrect(i)}
                    aria-label={`Đánh dấu ${o.label} là đáp án đúng`}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center font-mono text-xs font-bold transition ${
                      draft.type === 'MULTIPLE_CHOICE' ? 'rounded-default' : 'rounded-full'
                    } ${o.isCorrect ? 'bg-success text-white' : 'bg-surface-hover text-text-secondary'}`}
                  >
                    {o.label}
                  </button>
                  <input
                    value={o.content}
                    onChange={(e) => setOption(i, { content: e.target.value })}
                    placeholder={
                      draft.type === 'TRUE_FALSE'
                        ? i === 0 ? 'Đúng' : 'Sai'
                        : `Nội dung phương án ${o.label}`
                    }
                    className="w-full rounded-default border border-border-default px-3 py-2 font-mono text-sm outline-none focus:border-secondary"
                  />
                  <div className="hidden w-40 shrink-0 rounded-default bg-surface px-2 py-1 text-sm sm:block">
                    <MathContent content={o.content} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Textarea
            label="Lời giải (tùy chọn, chỉ hiện khi đề cho phép xem đáp án)"
            rows={2}
            value={draft.explanation}
            onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
          />

          {createQuestion.isError && <ErrorBox error={createQuestion.error} />}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>
              Hủy
            </Button>
            <Button onClick={submit} disabled={createQuestion.isPending || !draft.chapterId}>
              {createQuestion.isPending ? 'Đang lưu...' : 'Lưu vào ngân hàng'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
