import { useCallback, useEffect, useRef, useState } from 'react';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import type { ProctoringThresholds } from '@/shared/types/api';

export type FaceStatus =
  | 'DANG_KHOI_DONG'
  | 'HOP_LE'
  | 'KHONG_THAY_MAT'
  | 'NHIEU_MAT'
  | 'QUAY_MAT'
  | 'CAMERA_LOI';

export interface FaceState {
  status: FaceStatus;
  faceCount: number;
  ready: boolean;
  error: string | null;
}

interface FaceEvent {
  type: 'FACE_ABSENT' | 'FACE_MULTIPLE' | 'FACE_AWAY' | 'CAMERA_BLOCKED';
  occurredAt: string;
  durationMs?: number;
  payload?: Record<string, unknown>;
}

interface Options {
  enabled: boolean;
  thresholds: ProctoringThresholds | null;
  onEvent: (e: FaceEvent) => void;
}

/** Nhận diện chạy 2 lần mỗi giây. Cao hơn chỉ tốn CPU chứ không bắt thêm được gì. */
const DETECT_INTERVAL_MS = 500;

/** Mũi lệch khỏi trung điểm hai mắt quá tỉ lệ này thì coi là đã quay mặt đi. */
const YAW_RATIO_LIMIT = 0.38;

/**
 * Số khung liên tiếp phải xác nhận trước khi đổi kết luận.
 *
 * Bộ nhận diện nào cũng chập chờn: chớp mắt, nhoè chuyển động, ngược sáng đều
 * làm rớt một vài khung, và ngược lại hoa văn nền đôi khi cho dương tính giả.
 * Nếu tin ngay từng khung một thì bộ đếm "vắng mặt" bị reset liên tục và
 * KHÔNG BAO GIỜ đủ ngưỡng — tức là cả cơ chế giám sát trở nên vô dụng.
 *
 * 3 khung ở nhịp 500ms tương đương 1,5 giây xác nhận.
 */
const CONFIRM_FRAMES = 3;

/**
 * Giám sát bằng camera cho ca thi TỪ XA — chức năng 5.9.
 *
 * Điểm cốt lõi: toàn bộ việc nhận diện chạy bằng WebAssembly NGAY TRÊN MÁY
 * THÍ SINH. Luồng video không bao giờ được gửi lên máy chủ. Thứ đi qua mạng chỉ
 * là kết luận dạng "thấy 0 khuôn mặt trong 12 giây", vài chục byte mỗi lần.
 *
 * Nhờ vậy: không cần máy chủ media, không tốn băng thông, và nghĩa vụ theo
 * Nghị định 13/2023 nhẹ hơn hẳn so với việc quay và lưu video cả ca thi.
 *
 * Đánh đổi: mã chạy trên máy thí sinh nên về lý thuyết can thiệp được. Nhưng
 * mục tiêu của giám sát là răn đe và tạo bằng chứng, không phải chống tin tặc —
 * bốn tín hiệu trình duyệt cũng cùng bản chất đó.
 */
export function useFaceProctoring({ enabled, thresholds, onEvent }: Options) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<FaceDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  /** Khung hình chụp đúng lúc phát hiện bất thường, chờ gửi làm bằng chứng. */
  const pendingFrame = useRef<Blob | null>(null);

  const absentSince = useRef<number | null>(null);
  const awaySince = useRef<number | null>(null);
  const multipleReported = useRef(false);
  const lastTs = useRef(0);
  const detectErrors = useRef(0);
  /** Đếm khung liên tiếp cho từng kết luận, dùng để khử nhiễu. */
  const streak = useRef({ present: 0, absent: 0, multiple: 0, away: 0 });

  const [state, setState] = useState<FaceState>({
    status: 'DANG_KHOI_DONG',
    faceCount: 0,
    ready: false,
    error: null,
  });

  /** Chụp khung hình hiện tại thành JPEG. */
  const grabFrame = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);

    return new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.82));
  }, []);

  /**
   * Lấy ảnh bằng chứng: ưu tiên khung đã chụp đúng lúc vi phạm, vì tới lúc máy
   * chủ xác nhận vi phạm thì thí sinh có thể đã ngồi lại ngay ngắn.
   */
  const takeEvidence = useCallback(async (): Promise<Blob | null> => {
    if (pendingFrame.current) {
      const frame = pendingFrame.current;
      pendingFrame.current = null;
      return frame;
    }
    return grabFrame();
  }, [grabFrame]);

  const markAnomaly = useCallback(async () => {
    if (pendingFrame.current) return; // giữ khung sớm nhất
    pendingFrame.current = await grabFrame();
  }, [grabFrame]);

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const absentLimit = thresholds?.faceAbsentMs ?? 10_000;

    const fail = (message: string, blocked: boolean) => {
      setState({ status: 'CAMERA_LOI', faceCount: 0, ready: false, error: message });
      if (blocked) {
        onEvent({ type: 'CAMERA_BLOCKED', occurredAt: new Date().toISOString() });
      }
    };

    (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        });
      } catch (e) {
        const name = (e as DOMException)?.name;
        fail(
          name === 'NotAllowedError'
            ? 'Bạn đã từ chối quyền camera. Ca thi từ xa bắt buộc bật camera.'
            : name === 'NotFoundError'
              ? 'Không tìm thấy camera trên thiết bị này.'
              : `Không mở được camera: ${(e as Error).message}`,
          true,
        );
        return;
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      // Camera bị tắt giữa chừng (rút webcam, tắt trong hệ điều hành)
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        fail('Camera đã bị ngắt giữa ca thi.', true);
      });

      let detector: FaceDetector;
      try {
        // Nạp WASM và model từ chính máy chủ của hệ thống, không qua CDN bên
        // ngoài — phòng thi mất mạng ra Internet vẫn phải thi được.
        const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
        detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/mediapipe/models/blaze_face_short_range.tflite',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.5,
        }).catch(async () =>
          // Máy không có GPU khả dụng thì lùi về CPU
          FaceDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: '/mediapipe/models/blaze_face_short_range.tflite',
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            minDetectionConfidence: 0.5,
          }),
        );
      } catch (e) {
        fail(`Không nạp được bộ nhận diện: ${(e as Error).message}`, false);
        return;
      }
      if (stopped) return detector.close();

      detectorRef.current = detector;
      setState((s) => ({ ...s, ready: true, status: 'HOP_LE', error: null }));

      timer = setInterval(() => {
        const video = videoRef.current;
        if (!video || video.readyState < 2) return;

        let faces;
        try {
          // Timestamp phải tăng nghiêm ngặt, nếu không MediaPipe sẽ ném lỗi
          lastTs.current = Math.max(lastTs.current + 1, Math.round(performance.now()));
          faces = detector.detectForVideo(video, lastTs.current).detections;
        } catch (e) {
          // Không nuốt lỗi: nhận diện chết âm thầm thì cả cơ chế giám sát
          // trở nên vô dụng mà không ai biết
          detectErrors.current++;
          if (detectErrors.current <= 3) {
            console.warn('[proctoring] detectForVideo lỗi:', (e as Error).message);
          }
          if (detectErrors.current === 10) {
            setState((s) => ({
              ...s,
              status: 'CAMERA_LOI',
              error: 'Bộ nhận diện khuôn mặt ngừng hoạt động.',
            }));
          }
          return;
        }
        detectErrors.current = 0;

        const now = Date.now();
        const count = faces.length;
        const k = streak.current;

        // --- Ước lượng hướng nhìn khi thấy đúng một khuôn mặt ---
        let turned = false;
        if (count === 1) {
          const kp = faces[0].keypoints;
          if (kp && kp.length >= 3) {
            const [rightEye, leftEye, nose] = kp;
            const eyeMidX = (rightEye.x + leftEye.x) / 2;
            const eyeDist = Math.abs(leftEye.x - rightEye.x);
            if (eyeDist > 0.01) {
              turned = Math.abs((nose.x - eyeMidX) / eyeDist) > YAW_RATIO_LIMIT;
            }
          }
        }

        // --- Cập nhật chuỗi khung liên tiếp ---
        k.absent = count === 0 ? k.absent + 1 : 0;
        k.present = count >= 1 ? k.present + 1 : 0;
        k.multiple = count >= 2 ? k.multiple + 1 : 0;
        k.away = count === 1 && turned ? k.away + 1 : 0;

        // --- Nhiều khuôn mặt ---
        // Đây là vi phạm mức nghiêm trọng nên phải xác nhận đủ khung mới báo,
        // một khung dương tính giả không được phép tạo ra cáo buộc.
        if (k.multiple >= CONFIRM_FRAMES) {
          absentSince.current = null;
          awaySince.current = null;
          setState((s) => ({ ...s, status: 'NHIEU_MAT', faceCount: count }));
          if (!multipleReported.current) {
            multipleReported.current = true;
            void markAnomaly();
            onEvent({
              type: 'FACE_MULTIPLE',
              occurredAt: new Date(now).toISOString(),
              payload: { faceCount: count },
            });
          }
          return;
        }
        if (k.multiple === 0) multipleReported.current = false;

        // --- Không thấy khuôn mặt ---
        // Bắt đầu đếm ngay từ khung đầu tiên, nhưng CHỈ dừng đếm khi đã thấy
        // mặt lại liên tục đủ số khung. Nhờ vậy một khung lọt lưới không xoá
        // được đồng hồ đã chạy.
        if (k.absent > 0) {
          if (absentSince.current === null) {
            absentSince.current = now;
            void markAnomaly();
          }
          awaySince.current = null;
          setState((s) => ({ ...s, status: 'KHONG_THAY_MAT', faceCount: 0 }));

          const elapsed = now - absentSince.current;
          if (elapsed >= absentLimit) {
            onEvent({
              type: 'FACE_ABSENT',
              occurredAt: new Date(absentSince.current).toISOString(),
              durationMs: elapsed,
            });
            absentSince.current = now; // đặt lại để không báo dồn dập
          }
          return;
        }

        // Thấy mặt nhưng chưa đủ khung xác nhận: giữ nguyên đồng hồ đang chạy
        if (absentSince.current !== null && k.present < CONFIRM_FRAMES) return;
        absentSince.current = null;

        // --- Quay mặt khỏi màn hình ---
        if (k.away >= CONFIRM_FRAMES) {
          if (awaySince.current === null) {
            awaySince.current = now;
            void markAnomaly();
          }
          setState((s) => ({ ...s, status: 'QUAY_MAT', faceCount: 1 }));

          const elapsed = now - awaySince.current;
          if (elapsed >= absentLimit) {
            onEvent({
              type: 'FACE_AWAY',
              occurredAt: new Date(awaySince.current).toISOString(),
              durationMs: elapsed,
            });
            awaySince.current = now;
          }
          return;
        }

        if (k.away === 0) awaySince.current = null;
        pendingFrame.current = null;
        setState((s) => ({ ...s, status: 'HOP_LE', faceCount: count }));
      }, DETECT_INTERVAL_MS);
    })();

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      detectorRef.current?.close();
      detectorRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [enabled, thresholds?.faceAbsentMs, onEvent, markAnomaly]);

  return { videoRef, canvasRef, state, takeEvidence };
}
