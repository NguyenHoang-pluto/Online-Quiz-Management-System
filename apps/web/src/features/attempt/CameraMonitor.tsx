import type { RefObject } from 'react';
import { Card } from '@/shared/components/ui';
import type { FaceState, FaceStatus } from './useFaceProctoring';

const STATUS: Record<FaceStatus, { text: string; dot: string; tone: string }> = {
  DANG_KHOI_DONG: {
    text: 'Đang khởi động camera',
    dot: 'bg-text-subdued',
    tone: 'text-text-secondary',
  },
  HOP_LE: { text: 'Khuôn mặt hợp lệ', dot: 'bg-success', tone: 'text-success' },
  KHONG_THAY_MAT: {
    text: 'Không phát hiện khuôn mặt',
    dot: 'bg-warning',
    tone: 'text-warning',
  },
  NHIEU_MAT: { text: 'Phát hiện nhiều khuôn mặt', dot: 'bg-danger', tone: 'text-danger' },
  QUAY_MAT: { text: 'Bạn đang quay mặt khỏi màn hình', dot: 'bg-warning', tone: 'text-warning' },
  CAMERA_LOI: { text: 'Camera gặp sự cố', dot: 'bg-danger', tone: 'text-danger' },
};

/**
 * Khung camera nhỏ hiển thị trong ca thi từ xa — chức năng 5.9.
 *
 * Cố ý cho thí sinh THẤY hình của chính mình và trạng thái nhận diện. Giám sát
 * mà giấu thì vừa gây lo lắng vừa khiến người ta không biết mình đang bị ghi
 * nhận vi phạm để tự điều chỉnh.
 */
export function CameraMonitor({
  videoRef,
  canvasRef,
  state,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  state: FaceState;
}) {
  const s = STATUS[state.status];
  const bad = state.status === 'NHIEU_MAT' || state.status === 'CAMERA_LOI';
  const warn = state.status === 'KHONG_THAY_MAT' || state.status === 'QUAY_MAT';

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border-default px-3 py-2">
        <p className="text-[11px] font-semibold tracking-wide text-text-subdued uppercase">
          Giám sát camera
        </p>
        <span className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${s.dot} ${state.status === 'HOP_LE' ? 'animate-pulse' : ''}`}
          />
          <span className={`text-[11px] font-medium ${s.tone}`}>{s.text}</span>
        </span>
      </div>

      <div
        className={`relative aspect-[4/3] w-full bg-[#0f172a] ${
          bad ? 'ring-2 ring-[var(--color-danger)]' : warn ? 'ring-2 ring-[var(--color-warning)]' : ''
        } ring-inset`}
      >
        <video
          ref={videoRef}
          muted
          playsInline
          // Lật ngang cho giống soi gương, người dùng đỡ mất phương hướng
          className="h-full w-full scale-x-[-1] object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />

        {state.status === 'CAMERA_LOI' && (
          <div className="absolute inset-0 flex items-center justify-center bg-[rgb(15_23_42/0.85)] p-3">
            <p className="text-center text-xs text-white">{state.error}</p>
          </div>
        )}

        {state.ready && state.status !== 'CAMERA_LOI' && (
          <span className="absolute top-2 left-2 rounded-default bg-[rgb(15_23_42/0.6)] px-1.5 py-0.5 font-mono text-[10px] text-white">
            {state.faceCount} khuôn mặt
          </span>
        )}
      </div>

      <p className="px-3 py-2 text-[11px] leading-snug text-text-subdued">
        Nhận diện chạy ngay trên máy bạn. Video <strong>không được gửi đi</strong>; hệ thống chỉ
        lưu một ảnh tại thời điểm phát hiện bất thường.
      </p>
    </Card>
  );
}
