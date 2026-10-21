import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { Button, ErrorBox, Modal, Select, Textarea } from '@/shared/components/ui';
import type { Chapter, Question } from '@/shared/types/api';
import { LatexToolbar } from './LatexToolbar';
import { DraftOption, OptionEditor, validateDraftOptions } from './OptionEditor';
import { QuestionImageUploader } from './QuestionImageUploader';
import { QuestionPreviewCard } from './QuestionPreviewCard';

const freshOptions = (): DraftOption[] =>
  ['A', 'B', 'C', 'D'].map((label) => ({ label, content: '', isCorrect: false }));

/** Modal dung chung tao + sua cau hoi (chuc nang 2.1, 2.2, 2.3, 2.4, 2.5). */
export function QuestionEditorModal({
  open,
  initial,
  chapters,
  defaultChapterId,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: Question | null;
  chapters: Chapter[];
  defaultChapterId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [chapterId, setChapterId] = useState(defaultChapterId);
  const [type, setType] = useState('SINGLE_CHOICE');
  const [difficulty, setDifficulty] = useState('MEDIUM');
  const [content, setContent] = useState('');
  const [explanation, setExplanation] = useState('');
  const [options, setOptions] = useState<DraftOption[]>(freshOptions());
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setChapterId(initial?.chapter.id ?? defaultChapterId);
    setType(initial?.type ?? 'SINGLE_CHOICE');
    setDifficulty(initial?.difficulty ?? 'MEDIUM');
    setContent(initial?.content ?? '');
    setExplanation(initial?.explanation ?? '');
    setOptions(
      initial
        ? initial.options.map((o) => ({ label: o.label, content: o.content, isCorrect: o.isCorrect }))
        : freshOptions(),
    );
    setImageUrl(initial?.imageUrl ?? null);
    setSavedId(initial?.id ?? null);
    setCursor(null);
  }, [open, initial, defaultChapterId]);

  const effectiveId = initial?.id ?? savedId;
  const validationError = validateDraftOptions(type, options);

  const save = useMutation({
    mutationFn: (body: unknown) =>
      effectiveId ? api.patch(`/questions/${effectiveId}`, body) : api.post('/questions', body),
    onSuccess: (res) => {
      // Tao xong van giu modal de gan anh; bao cha refetch ngay de dong bang cach
      // nao cung thay cau hoi moi (nut Xong chi goi onClose).
      onSaved();
      if (!effectiveId) setSavedId(res.data.id as string);
      else onClose();
    },
  });

  const insertSymbol = (snippet: string) =>
    setContent((c) => {
      const at = cursor ?? c.length;
      const next = c.slice(0, at) + snippet + c.slice(at);
      setCursor(at + snippet.length);
      return next;
    });

  const submit = () => {
    if (validationError || !chapterId) return;
    save.mutate({
      chapterId,
      type,
      difficulty,
      content,
      explanation: explanation || undefined,
      options: options.filter((o) => o.content.trim() !== ''),
    });
  };

  return (
    <Modal open={open} title={effectiveId ? 'Sửa câu hỏi' : 'Soạn câu hỏi'} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Chương" value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
            <option value="">— Chọn chương —</option>
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            label="Loại câu hỏi"
            value={type}
            onChange={(e) => {
              const t = e.target.value;
              setType(t);
              setOptions(
                t === 'TRUE_FALSE'
                  ? [
                      { label: 'A', content: options[0]?.content ?? '', isCorrect: false },
                      { label: 'B', content: options[1]?.content ?? '', isCorrect: false },
                    ]
                  : freshOptions(),
              );
            }}
          >
            <option value="SINGLE_CHOICE">1 đáp án</option>
            <option value="MULTIPLE_CHOICE">Nhiều đáp án</option>
            <option value="TRUE_FALSE">Đúng / Sai</option>
          </Select>
          <Select label="Mức độ" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="EASY">Dễ (Nhận biết)</option>
            <option value="MEDIUM">Trung bình (Thông hiểu)</option>
            <option value="HARD">Khó (Vận dụng cao)</option>
          </Select>
        </div>

        <LatexToolbar onInsert={insertSymbol} />

        <div className="grid gap-3 lg:grid-cols-2">
          <Textarea
            label="Nội dung câu hỏi (LaTeX đặt giữa dấu $)"
            rows={6}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onSelect={(e) => setCursor(e.currentTarget.selectionStart ?? null)}
            placeholder="Tính tích phân $\int_0^1 x^2\,dx$"
          />
          <div>
            <p className="mb-1 text-xs font-medium text-text-secondary">
              Xem trước như thí sinh nhìn thấy
            </p>
            <QuestionPreviewCard content={content} options={options} imageUrl={imageUrl} />
          </div>
        </div>

        <OptionEditor type={type} options={options} onChange={setOptions} />

        <QuestionImageUploader questionId={effectiveId} value={imageUrl} onChange={setImageUrl} />

        <Textarea
          label="Lời giải (tùy chọn, chỉ hiện khi đề cho phép xem đáp án)"
          rows={2}
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
        />

        {validationError && <p className="text-xs text-danger">{validationError}</p>}
        {save.isError && <ErrorBox error={save.error} />}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {savedId && !initial ? 'Xong' : 'Hủy'}
          </Button>
          {!(savedId && !initial) && (
            <Button onClick={submit} disabled={save.isPending || !chapterId || !!validationError}>
              {save.isPending ? 'Đang lưu...' : effectiveId ? 'Lưu thay đổi' : 'Lưu vào ngân hàng'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
