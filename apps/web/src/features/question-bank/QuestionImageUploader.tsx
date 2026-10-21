import { useState } from 'react';
import { api } from '@/shared/api/client';
import type { QuestionImageResponse } from '@/shared/types/api';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ['image/png', 'image/jpeg', 'image/webp'];

/** Upload anh minh hoa cau hoi (chuc nang 2.5). Can co questionId — luu cau hoi truoc. */
export function QuestionImageUploader({
  questionId,
  value,
  onChange,
}: {
  questionId: string | null;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!questionId) {
    return (
      <p className="rounded-default border border-dashed border-border-default bg-surface px-3 py-2 text-xs text-text-subdued">
        Lưu câu hỏi trước khi thêm ảnh minh họa.
      </p>
    );
  }

  const upload = async (file: File) => {
    setError(null);
    if (!ACCEPT.includes(file.type)) {
      setError('Chỉ chấp nhận ảnh PNG, JPEG hoặc WebP');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Ảnh vượt quá 5MB');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    try {
      setProgress(0);
      const res = await api.post<QuestionImageResponse>(`/questions/${questionId}/image`, form, {
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      onChange(res.data.imageUrl);
    } catch {
      setError('Tải ảnh lên thất bại, thử lại');
    } finally {
      setProgress(null);
    }
  };

  const remove = async () => {
    setError(null);
    try {
      await api.delete(`/questions/${questionId}/image`);
      onChange(null);
    } catch {
      setError('Xóa ảnh thất bại, thử lại');
    }
  };

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-text-secondary">Ảnh minh họa (tùy chọn)</p>
      {value ? (
        <div className="flex items-start gap-3">
          <img src={value} alt="" className="max-h-40 rounded-default border border-border-default" />
          <button
            type="button"
            onClick={remove}
            className="rounded-default border border-border-default px-3 py-1.5 text-xs text-danger hover:bg-surface-hover"
          >
            Xóa ảnh
          </button>
        </div>
      ) : (
        <input
          type="file"
          accept={ACCEPT.join(',')}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = '';
          }}
          className="text-sm"
        />
      )}
      {progress !== null && <p className="mt-1 text-xs text-text-subdued">Đang tải… {progress}%</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
