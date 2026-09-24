import { useEffect, useState } from 'react';
import { api } from '@/shared/api/client';

/**
 * Ảnh bằng chứng vi phạm — chức năng 5.11.
 *
 * Không dùng thẳng `<img src>` được: endpoint ảnh có kiểm tra quyền qua header
 * Authorization, mà thẻ img thì không gửi header. Nên phải tải bằng axios rồi
 * dựng blob URL.
 *
 * Đây cũng là điều đúng đắn về mặt riêng tư — ảnh sinh trắc không nằm ở đường
 * dẫn tĩnh ai mở cũng xem được.
 */
export function EvidenceThumb({ url, alt }: { url: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    api
      .get(url, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data as Blob);
        setSrc(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (failed) {
    return (
      <span className="flex h-16 w-20 shrink-0 items-center justify-center rounded-default border border-border-default text-[10px] text-text-subdued">
        Ảnh đã hết hạn
      </span>
    );
  }

  if (!src) {
    return (
      <span className="h-16 w-20 shrink-0 animate-pulse rounded-default bg-surface-hover" />
    );
  }

  return (
    <button
      onClick={() => window.open(src, '_blank')}
      title="Mở ảnh cỡ lớn"
      className="shrink-0"
    >
      <img
        src={src}
        alt={alt}
        className="h-16 w-20 rounded-default border border-border-default object-cover transition hover:opacity-80"
      />
    </button>
  );
}
