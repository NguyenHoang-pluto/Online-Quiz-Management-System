import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/auth.store';
import type { ProctoringThresholds } from '@/shared/types/api';

export interface PendingEvent {
  type: string;
  occurredAt: string;
  durationMs?: number;
  payload?: Record<string, unknown>;
}

export interface ProctorState {
  violationCount: number;
  maxViolations: number;
  warning: string | null;
  terminated: boolean;
}

interface Options {
  attemptId: string;
  thresholds: ProctoringThresholds | null;
  batchIntervalMs: number;
  enabled: boolean;
  onTerminated: () => void;
  /** Cung cấp ảnh bằng chứng khi máy chủ xác nhận có vi phạm (chế độ thi từ xa). */
  getEvidence?: () => Promise<Blob | null>;
}

/**
 * Thu thập tín hiệu giám sát ở phía trình duyệt — chức năng 5.1, 5.2, 5.3.
 *
 * Client chỉ BÁO CÁO sự kiện thô kèm thời lượng. Việc kết luận có vi phạm hay
 * không do server quyết định, vì đoạn mã này chạy trên máy thí sinh và hoàn
 * toàn có thể bị can thiệp.
 *
 * Sự kiện được gom theo lô và gửi mỗi 5 giây; gói này cũng đóng vai trò
 * heartbeat: server không nhận được lô nào trong ngưỡng cho phép thì coi như
 * mất kết nối.
 */
export function useProctoring({
  attemptId,
  thresholds,
  batchIntervalMs,
  enabled,
  onTerminated,
  getEvidence,
}: Options) {
  const [state, setState] = useState<ProctorState>({
    violationCount: 0,
    maxViolations: thresholds?.maxViolations ?? 3,
    warning: null,
    terminated: false,
  });

  const queue = useRef<PendingEvent[]>([]);
  const hiddenSince = useRef<number | null>(null);
  const blurSince = useRef<number | null>(null);

  // Giữ trong ref để hàm gửi lô không phải dựng lại mỗi lần cha render
  const evidenceRef = useRef(getEvidence);
  evidenceRef.current = getEvidence;
  const terminatedRef = useRef(onTerminated);
  terminatedRef.current = onTerminated;

  /** Cho phép nguồn khác (ví dụ camera) đẩy sự kiện vào cùng một hàng đợi. */
  const pushEvent = useCallback((e: PendingEvent) => {
    queue.current.push(e);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Rời tab hoặc chuyển sang ứng dụng khác
    const onVisibility = () => {
      if (document.hidden) {
        hiddenSince.current = Date.now();
      } else if (hiddenSince.current) {
        pushEvent({
          type: 'TAB_BLUR',
          occurredAt: new Date(hiddenSince.current).toISOString(),
          durationMs: Date.now() - hiddenSince.current,
        });
        hiddenSince.current = null;
      }
    };

    // Mất tiêu điểm cửa sổ mà tab vẫn hiện — ví dụ mở cửa sổ khác đè lên
    const onBlur = () => {
      blurSince.current = Date.now();
    };
    const onFocus = () => {
      if (!blurSince.current) return;
      pushEvent({
        type: 'WINDOW_BLUR',
        occurredAt: new Date(blurSince.current).toISOString(),
        durationMs: Date.now() - blurSince.current,
      });
      blurSince.current = null;
    };

    const onPaste = (ev: ClipboardEvent) => {
      pushEvent({
        type: 'PASTE',
        occurredAt: new Date().toISOString(),
        payload: { length: ev.clipboardData?.getData('text')?.length ?? 0 },
      });
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('paste', onPaste);

    const flush = async () => {
      // Vẫn gửi lô rỗng: đó chính là nhịp heartbeat
      const events = queue.current;
      queue.current = [];
      try {
        const { data } = await api.post(`/proctoring/attempts/${attemptId}/events`, {
          events,
          clientTime: new Date().toISOString(),
        });

        setState((s) => ({
          violationCount: data.violationCount ?? s.violationCount,
          maxViolations: data.maxViolations ?? s.maxViolations,
          warning:
            data.violations > 0
              ? `${data.message ?? 'Ghi nhận vi phạm'} — lần ${data.violationCount}/${data.maxViolations}`
              : s.warning,
          terminated: data.action === 'AUTO_SUBMIT',
        }));

        // Chức năng 5.10 — gửi kèm ảnh bằng chứng cho vi phạm vừa được ghi nhận
        const ids: string[] = data.violationIds ?? [];
        if (ids.length > 0 && evidenceRef.current) {
          const blob = await evidenceRef.current();
          if (blob) {
            const form = new FormData();
            form.append('file', blob, 'evidence.jpg');
            // Chỉ đính cho vi phạm đầu tiên của lô; một ảnh là đủ để đối chiếu
            await api
              .post(`/proctoring/violations/${ids[0]}/evidence`, form, {
                headers: { 'Content-Type': 'multipart/form-data' },
              })
              .catch(() => undefined);
          }
        }

        if (data.action === 'AUTO_SUBMIT') terminatedRef.current();
      } catch {
        // Mất mạng thì trả sự kiện về hàng đợi để lần sau gửi lại
        queue.current = [...events, ...queue.current];
      }
    };

    const timer = setInterval(flush, batchIntervalMs);

    /**
     * Gói cuối khi đóng trình duyệt đột ngột.
     *
     * Đặc tả ban đầu ghi navigator.sendBeacon, nhưng sendBeacon không đính kèm
     * được header Authorization nên server sẽ trả 401. Dùng fetch với
     * keepalive: true — cùng cơ chế gửi nền, lại giữ được token xác thực.
     */
    const onPageHide = () => {
      if (queue.current.length === 0) return;
      const body = JSON.stringify({
        events: queue.current,
        clientTime: new Date().toISOString(),
      });
      queue.current = [];
      void fetch(`/api/v1/proctoring/attempts/${attemptId}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${useAuthStore.getState().accessToken ?? ''}`,
        },
        body,
        keepalive: true,
        credentials: 'include',
      }).catch(() => undefined);
    };
    window.addEventListener('pagehide', onPageHide);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('paste', onPaste);
      window.removeEventListener('pagehide', onPageHide);
      clearInterval(timer);
    };
  }, [attemptId, batchIntervalMs, enabled, pushEvent]);

  return { state, pushEvent };
}
