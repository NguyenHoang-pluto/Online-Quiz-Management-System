import { ProctoringMode, SignalType, ViolationAction } from './enums.js';

/** Tín hiệu nào được bật. Lưu dưới dạng JSON trong ProctoringPolicy.signalsEnabled */
export interface ProctoringSignals {
  tabBlur: boolean;
  windowBlur: boolean;
  paste: boolean;
  heartbeat: boolean;
  /** Chỉ có nghĩa ở chế độ LAB */
  ipFence: boolean;
  /** Chỉ có nghĩa ở chế độ REMOTE */
  faceAbsent: boolean;
  faceMultiple: boolean;
  faceAway: boolean;
}

/** Ngưỡng. Lưu dưới dạng JSON trong ProctoringPolicy.thresholds */
export interface ProctoringThresholds {
  /** Rời màn hình bao lâu thì tính là vi phạm (ms) */
  blurMs: number;
  /** Mất heartbeat bao lâu thì coi là mất kết nối (giây) */
  heartbeatTimeoutS: number;
  /** Vắng mặt trước camera bao lâu thì tính vi phạm (ms) */
  faceAbsentMs: number;
  /** Bao nhiêu lần vi phạm thì kích hoạt actionOnExceed */
  maxViolations: number;
}

export interface ProctoringPolicyConfig {
  mode: ProctoringMode;
  signalsEnabled: ProctoringSignals;
  thresholds: ProctoringThresholds;
  actionOnExceed: ViolationAction;
}

/**
 * Hồ sơ chuẩn cho thi TẠI PHÒNG MÁY.
 * Ngưỡng chặt vì đã có giám thị xử lý tại chỗ, và mạng phòng lab ổn định.
 * Không bật camera: phòng máy thường không có webcam và đã có người coi thi.
 */
export const DEFAULT_LAB_POLICY: ProctoringPolicyConfig = {
  mode: ProctoringMode.LAB,
  signalsEnabled: {
    tabBlur: true,
    windowBlur: true,
    paste: true,
    heartbeat: true,
    ipFence: true,
    faceAbsent: false,
    faceMultiple: false,
    faceAway: false,
  },
  thresholds: {
    blurMs: 3000,
    heartbeatTimeoutS: 30,
    faceAbsentMs: 0,
    maxViolations: 3,
  },
  actionOnExceed: ViolationAction.FLAG,
};

/**
 * Hồ sơ chuẩn cho thi TỪ XA.
 * Ngưỡng rộng hơn vì mạng tại nhà chập chờn là bình thường — dùng ngưỡng
 * phòng lab sẽ tạo hàng loạt báo động giả và giảng viên sẽ tắt luôn tính năng.
 */
export const DEFAULT_REMOTE_POLICY: ProctoringPolicyConfig = {
  mode: ProctoringMode.REMOTE,
  signalsEnabled: {
    tabBlur: true,
    windowBlur: true,
    paste: true,
    heartbeat: true,
    ipFence: false,
    faceAbsent: true,
    faceMultiple: true,
    faceAway: true,
  },
  thresholds: {
    blurMs: 5000,
    heartbeatTimeoutS: 90,
    faceAbsentMs: 10000,
    maxViolations: 5,
  },
  actionOnExceed: ViolationAction.FLAG,
};

/** Tín hiệu nào chỉ dùng được ở chế độ nào — server dùng để loại bỏ tín hiệu rác. */
export const SIGNALS_BY_MODE: Record<ProctoringMode, SignalType[]> = {
  [ProctoringMode.LAB]: [
    SignalType.TAB_BLUR,
    SignalType.WINDOW_BLUR,
    SignalType.PASTE,
    SignalType.HEARTBEAT_LOST,
    SignalType.IP_OUT_OF_RANGE,
  ],
  [ProctoringMode.REMOTE]: [
    SignalType.TAB_BLUR,
    SignalType.WINDOW_BLUR,
    SignalType.PASTE,
    SignalType.HEARTBEAT_LOST,
    SignalType.FACE_ABSENT,
    SignalType.FACE_MULTIPLE,
    SignalType.FACE_AWAY,
    SignalType.CAMERA_BLOCKED,
  ],
};

/** Một sự kiện thô do client gom theo lô rồi gửi lên. */
export interface ProctoringEventInput {
  type: SignalType;
  occurredAt: string;
  durationMs?: number;
  payload?: Record<string, unknown>;
}

/** Gói client gửi mỗi 5 giây (hoặc qua sendBeacon khi đóng trình duyệt đột ngột). */
export interface ProctoringBatchInput {
  attemptId: string;
  events: ProctoringEventInput[];
  clientTime: string;
}
