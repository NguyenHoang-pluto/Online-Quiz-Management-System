import { useState } from 'react';
import { api } from '@/shared/api/client';
import type { ImportPreviewResponse, PreviewQuestion } from '@/shared/types/api';

export type ImportSource = 'excel' | 'word';
export type ImportStep = 'upload' | 'preview' | 'done';

/** Kiem lai 1 dong sau khi sua tay — mirror rule BE de bao loi som. */
function revalidateRow(row: PreviewQuestion): string[] {
  const errs: string[] = [];
  if (!row.content.trim()) errs.push('Thiếu nội dung câu hỏi');
  const filled = row.options.filter((o) => o.content.trim() !== '');
  const correct = filled.filter((o) => o.isCorrect).length;
  if (filled.length < 2) errs.push('Phải có tối thiểu 2 phương án');
  else if (correct === 0) errs.push('Phải chọn ít nhất 1 đáp án đúng');
  else if (row.type === 'SINGLE_CHOICE' && correct !== 1) {
    errs.push('Câu 1 đáp án chỉ được có đúng 1 phương án đúng');
  } else if (row.type === 'TRUE_FALSE' && (filled.length !== 2 || correct !== 1)) {
    errs.push('Câu đúng/sai phải có đúng 2 phương án với 1 đáp án đúng');
  }
  return errs;
}

/** State machine cho wizard import 3 buoc: tai file → xem truoc/sua → xac nhan. */
export function useQuestionImport() {
  const [step, setStep] = useState<ImportStep>('upload');
  const [source, setSource] = useState<ImportSource>('excel');
  const [subjectId, setSubjectId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PreviewQuestion[]>([]);
  const [errors, setErrors] = useState<ImportPreviewResponse['errors']>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<{ created: number; failed: number } | null>(null);

  const parsePreview = async () => {
    if (!file || !subjectId) return;
    if (source === 'word' && !chapterId) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('subjectId', subjectId);
      if (source === 'word') form.append('chapterId', chapterId);
      const res = await api.post<ImportPreviewResponse>(
        `/questions/import/${source}/preview`,
        form,
      );
      setRows(res.data.rows);
      setErrors(res.data.errors);
      setSelected(new Set(res.data.rows.filter((r) => r.rowErrors.length === 0).map((r) => r.rowIndex)));
      setStep('preview');
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  const editRow = (rowIndex: number, patch: Partial<PreviewQuestion>) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.rowIndex !== rowIndex) return r;
        const next = { ...r, ...patch };
        return { ...next, rowErrors: revalidateRow(next) };
      }),
    );

  const toggleRow = (rowIndex: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });

  const confirm = async () => {
    // Chi gui dong duoc tick VA sach — dong loi khong bao gio lot vao payload.
    const items = rows
      .filter((r) => selected.has(r.rowIndex) && r.rowErrors.length === 0)
      .map(({ rowIndex: _ri, rowErrors: _re, ...rest }) => ({
        ...rest,
        chapterId: rest.chapterId || chapterId,
      }));
    if (items.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ created: number; failed: number }>('/questions/import/confirm', {
        subjectId,
        chapterId: source === 'word' ? chapterId : undefined,
        items,
      });
      setResult(res.data);
      setStep('done');
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep('upload');
    setFile(null);
    setRows([]);
    setErrors([]);
    setSelected(new Set());
    setError(null);
    setResult(null);
  };

  return {
    step, source, setSource, subjectId, setSubjectId, chapterId, setChapterId,
    file, setFile, rows, errors, selected, loading, error, result,
    parsePreview, editRow, toggleRow, confirm, reset,
  };
}
