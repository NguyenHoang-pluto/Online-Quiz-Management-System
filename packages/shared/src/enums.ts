/**
 * Enum dùng chung giữa API và Web.
 * Giá trị phải trùng khít với enum trong prisma/schema.prisma.
 */

export const Role = {
  ADMIN: 'ADMIN',
  LECTURER: 'LECTURER',
  STUDENT: 'STUDENT',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const QuestionType = {
  SINGLE_CHOICE: 'SINGLE_CHOICE',
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
  TRUE_FALSE: 'TRUE_FALSE',
} as const;
export type QuestionType = (typeof QuestionType)[keyof typeof QuestionType];

export const Difficulty = {
  EASY: 'EASY',
  MEDIUM: 'MEDIUM',
  HARD: 'HARD',
} as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

export const ExamStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  CLOSED: 'CLOSED',
} as const;
export type ExamStatus = (typeof ExamStatus)[keyof typeof ExamStatus];

/**
 * Giai đoạn thực tế của một đề thi.
 *
 * Khác với ExamStatus — thứ do giảng viên bấm nút để đổi — giai đoạn được TÍNH
 * từ giờ mở/đóng so với thời điểm hiện tại. Cố ý không lưu thành cột: trạng
 * thái lưu sẵn cần một tác vụ nền để cập nhật, mà tác vụ đó trễ một nhịp là
 * giao diện báo sai ngay giữa ca thi.
 */
export const ExamPhase = {
  /** Còn bản nháp, chưa phát hành */
  BAN_NHAP: 'BAN_NHAP',
  /** Đã phát hành nhưng chưa tới giờ mở phòng */
  SAP_DIEN_RA: 'SAP_DIEN_RA',
  /** Đang trong khung giờ thi */
  DANG_DIEN_RA: 'DANG_DIEN_RA',
  /** Hết giờ đóng phòng nhưng giảng viên chưa chốt ca thi */
  HET_GIO: 'HET_GIO',
  /** Đã chốt */
  DA_DONG: 'DA_DONG',
} as const;
export type ExamPhase = (typeof ExamPhase)[keyof typeof ExamPhase];

export const ResultDisplay = {
  NONE: 'NONE',
  SCORE_ONLY: 'SCORE_ONLY',
  WITH_ANSWERS: 'WITH_ANSWERS',
} as const;
export type ResultDisplay = (typeof ResultDisplay)[keyof typeof ResultDisplay];

/** Hình thức thi — quyết định tín hiệu giám sát nào được bật. */
export const ProctoringMode = {
  LAB: 'LAB',
  REMOTE: 'REMOTE',
} as const;
export type ProctoringMode = (typeof ProctoringMode)[keyof typeof ProctoringMode];

export const AttemptStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  AUTO_SUBMITTED: 'AUTO_SUBMITTED',
  TERMINATED: 'TERMINATED',
} as const;
export type AttemptStatus = (typeof AttemptStatus)[keyof typeof AttemptStatus];

export const SignalType = {
  // 4 tín hiệu nền — áp dụng cả hai chế độ
  TAB_BLUR: 'TAB_BLUR',
  WINDOW_BLUR: 'WINDOW_BLUR',
  PASTE: 'PASTE',
  HEARTBEAT_LOST: 'HEARTBEAT_LOST',
  // Chỉ chế độ LAB
  IP_OUT_OF_RANGE: 'IP_OUT_OF_RANGE',
  // Chỉ chế độ REMOTE
  FACE_ABSENT: 'FACE_ABSENT',
  FACE_MULTIPLE: 'FACE_MULTIPLE',
  FACE_AWAY: 'FACE_AWAY',
  CAMERA_BLOCKED: 'CAMERA_BLOCKED',
} as const;
export type SignalType = (typeof SignalType)[keyof typeof SignalType];

export const Severity = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
} as const;
export type Severity = (typeof Severity)[keyof typeof Severity];

export const ViolationAction = {
  WARN: 'WARN',
  FLAG: 'FLAG',
  AUTO_SUBMIT: 'AUTO_SUBMIT',
} as const;
export type ViolationAction = (typeof ViolationAction)[keyof typeof ViolationAction];
