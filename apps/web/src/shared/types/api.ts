import type {
  Role,
  QuestionType,
  Difficulty,
  ExamStatus,
  ResultDisplay,
  ProctoringMode,
  AttemptStatus,
  SignalType,
  ExamPhase,
} from '@eduexam/shared';

// Cac enum dung chung duoc xuat lai o day de trang chi phai import mot cho
export type {
  Role, QuestionType, Difficulty, ExamStatus, ResultDisplay, ProctoringMode,
  AttemptStatus, SignalType, ExamPhase,
};

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ---------- Module 1 ----------

export interface User {
  id: string;
  code: string;
  email: string;
  fullName: string;
  role: Role;
  status: 'ACTIVE' | 'LOCKED';
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  credits: number;
  _count?: { chapters: number; questions: number };
}

export interface Chapter {
  id: string;
  subjectId: string;
  code: string;
  name: string;
  orderIndex: number;
  _count?: { questions: number };
}

export interface CourseClass {
  id: string;
  code: string;
  name: string;
  semester: string;
  capacity: number;
  status: string;
  subject: { code: string; name: string; credits: number };
  lecturer: { id: string; code: string; fullName: string; email: string };
  _count: { enrollments: number; exams: number };
}

export interface ExamRoom {
  id: string;
  code: string;
  name: string;
  building: string | null;
  seatCount: number;
  ipRules: { id: string; cidr: string; note: string | null }[];
}

export interface InventoryRow {
  chapterId: string;
  code: string;
  name: string;
  available: Record<Difficulty, number>;
  total: number;
}

// ---------- Module 2 ----------

export interface QuestionOption {
  id: string;
  label: string;
  content: string;
  isCorrect: boolean;
  orderIndex: number;
}

export interface Question {
  id: string;
  type: QuestionType;
  difficulty: Difficulty;
  status: 'ACTIVE' | 'DISABLED';
  content: string;
  imageUrl: string | null;
  explanation: string | null;
  defaultScore: number;
  createdAt: string;
  chapter: { id: string; code: string; name: string };
  subject: { id: string; code: string; name: string };
  createdBy: { id: string; fullName: string };
  options: QuestionOption[];
}

// ---------- Module 3 ----------

export interface ProctoringThresholds {
  blurMs: number;
  heartbeatTimeoutS: number;
  faceAbsentMs: number;
  maxViolations: number;
}

export interface ProctoringPolicy {
  id: string;
  name: string;
  mode: ProctoringMode;
  isSystem: boolean;
  signalsEnabled: Record<string, boolean>;
  thresholds: ProctoringThresholds;
  actionOnExceed: 'WARN' | 'FLAG' | 'AUTO_SUBMIT';
}

export interface Exam {
  id: string;
  title: string;
  durationMinutes: number;
  openAt: string;
  closeAt: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  resultDisplay: ResultDisplay;
  totalScore: number;
  strictMultipleChoice: boolean;
  status: ExamStatus;
  proctoringMode: ProctoringMode;
  roomId: string | null;
  subject: { code: string; name: string };
  courseClass: { code: string; name: string };
  room: ExamRoom | null;
  policy: ProctoringPolicy | null;
  matrixItems?: MatrixItem[];
  _count?: { attempts: number; matrixItems: number };
  /** Giai đoạn thực tế, tính từ giờ mở/đóng — không lưu trong CSDL */
  phase: ExamPhase;
  inProgressCount: number;
}

export interface MatrixItem {
  id: string;
  chapterId: string;
  difficulty: Difficulty;
  quantity: number;
  chapter: Chapter;
}

export interface MatrixAvailability {
  examId: string;
  totalQuestions: number;
  scorePerQuestion: number;
  canPublish: boolean;
  rows: {
    chapterId: string;
    chapterCode: string;
    chapterName: string;
    difficulty: Difficulty;
    required: number;
    available: number;
    status: 'DU' | 'SAT_NGUONG' | 'THIEU';
  }[];
  missing: unknown[];
}

// ---------- Module 4 ----------

export type ExamState =
  | 'SAP_DIEN_RA'
  | 'DANG_MO'
  | 'DANG_LAM'
  | 'DA_HOAN_THANH'
  | 'DA_DONG';

export interface MyExam {
  examId: string;
  title: string;
  subject: { code: string; name: string };
  courseClass: { code: string; name: string };
  room: { code: string; name: string } | null;
  durationMinutes: number;
  openAt: string;
  closeAt: string;
  proctoringMode: ProctoringMode;
  state: ExamState;
  attemptId: string | null;
  score: number | null;
}

export interface ExamRules {
  examId: string;
  title: string;
  /** Đang có bài làm dở — lần xác nhận này là để làm tiếp, không phải bắt đầu mới. */
  resuming: boolean;
  durationMinutes: number;
  totalQuestions: number;
  totalScore: number;
  openAt: string;
  closeAt: string;
  proctoringMode: ProctoringMode;
  room: { code: string; name: string } | null;
  requiresBiometricConsent: boolean;
  rules: string[];
}

export interface PaperQuestion {
  orderIndex: number;
  questionId: string;
  type: QuestionType;
  difficulty: Difficulty;
  content: string;
  imageUrl: string | null;
  score: number;
  options: { id: string; label: string; content: string }[];
  selectedOptionIds: string[];
  flagged: boolean;
  answered: boolean;
}

export interface Paper {
  attemptId: string;
  examId: string;
  title: string;
  status: AttemptStatus;
  proctoringMode: ProctoringMode;
  serverTime: string;
  startedAt: string;
  deadlineAt: string;
  remainingSeconds: number;
  totalScore: number;
  violationCount: number;
  proctoring: {
    signalsEnabled: Record<string, boolean> | null;
    thresholds: ProctoringThresholds | null;
    batchIntervalMs: number;
  };
  questions: PaperQuestion[];
}

// ---------- Module 5 ----------

export interface MonitorRow {
  attemptId: string;
  studentCode: string;
  studentName: string;
  machineCode: string | null;
  ipAddress: string | null;
  online: boolean;
  lastHeartbeatAt: string | null;
  progress: { answered: number; total: number };
  progressPercent: number;
  remainingSeconds: number;
  violationCount: number;
  maxViolations: number;
  recentViolations: { type: SignalType; note: string | null; at: string }[];
  status: AttemptStatus;
  state: 'BINH_THUONG' | 'NHAC_NHO' | 'DANH_DAU' | 'MAT_KET_NOI' | 'DA_NOP';
}

export interface LiveMonitor {
  examId: string;
  examTitle: string;
  subject: string;
  room: { code: string; name: string } | null;
  proctoringMode: ProctoringMode;
  thresholds: ProctoringThresholds;
  stats: {
    enrolled: number;
    started: number;
    online: number;
    clean: number;
    warned: number;
    flagged: number;
    disconnected: number;
    submitted: number;
  };
  rows: MonitorRow[];
}

export interface Timeline {
  attemptId: string;
  student: { code: string; fullName: string };
  examTitle: string;
  proctoringMode: ProctoringMode;
  startedAt: string;
  submittedAt: string | null;
  status: AttemptStatus;
  violationCount: number;
  violations: {
    sequenceNo: number;
    type: SignalType;
    severity: string;
    note: string | null;
    occurredAt: string;
    evidenceUrl: string | null;
    offsetSeconds: number;
  }[];
  events: {
    type: SignalType;
    occurredAt: string;
    durationMs: number | null;
    offsetSeconds: number;
  }[];
}

// ---------- Module 6 ----------

export interface ScoreSummary {
  average: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
  passRate: number;
}

export interface Gradebook {
  examId: string;
  examTitle: string;
  subject: string;
  totalScore: number;
  enrolled: number;
  submitted: number;
  summary: ScoreSummary;
  rows: {
    stt: number;
    studentId: string;
    code: string;
    fullName: string;
    status: string;
    correctCount: number | null;
    score: number | null;
    submittedAt: string | null;
    violationCount: number;
    attemptId: string | null;
  }[];
}

export interface Distribution {
  examId: string;
  examTitle: string;
  total: number;
  summary: ScoreSummary;
  buckets: { label: string; min: number; max: number; color: string; count: number; percent: number }[];
}

export interface ItemAnalysis {
  examId: string;
  totalAttempts: number;
  groupSize?: number;
  items: {
    questionId: string;
    content: string;
    declaredDifficulty: Difficulty;
    totalAnswers: number;
    correctAnswers: number;
    pValue: number;
    correctPercent: number;
    discriminationIndex: number;
    quality: 'RAT_TOT' | 'TOT' | 'TAM_DUOC' | 'CAN_RA_SOAT';
    distribution: { label: string; isCorrect: boolean; chosen: number; percent: number }[];
    suspicious: boolean;
    warning: string | null;
  }[];
}

export interface StudentResult {
  attemptId: string;
  examTitle: string;
  subject: string;
  status: AttemptStatus;
  submittedAt: string | null;
  totalQuestions: number;
  violationCount: number;
  durationUsedSeconds: number | null;
  resultDisplay: ResultDisplay;
  message?: string;
  score?: number | null;
  totalScore?: number;
  correctCount?: number | null;
  questions?: {
    orderIndex: number;
    chapter: { code: string; name: string };
    difficulty: Difficulty;
    content: string;
    explanation: string | null;
    isCorrect: boolean;
    earnedScore: number;
    options: { label: string; content: string; isCorrect: boolean; selected: boolean }[];
  }[];
}

export interface HistoryRow {
  attemptId: string;
  examTitle: string;
  subject: { code: string; name: string };
  submittedAt: string | null;
  status: AttemptStatus;
  score: number | null;
  totalScore: number;
  correctCount: number | null;
  violationCount: number;
}

// ---------- Giám sát toàn thể ----------

export interface LiveOverviewExam {
  examId: string;
  title: string;
  subject: { code: string; name: string };
  courseClass: {
    code: string;
    name: string;
    lecturer: { fullName: string };
    _count: { enrollments: number };
  };
  room: { code: string; name: string } | null;
  proctoringMode: ProctoringMode;
  phase: ExamPhase;
  openAt: string;
  closeAt: string;
  durationMinutes: number;
  maxViolations: number;
  needsAttention: boolean;
  stats: {
    enrolled: number;
    started: number;
    inProgress: number;
    online: number;
    disconnected: number;
    flagged: number;
    warned: number;
    submitted: number;
  };
}

export interface LiveOverview {
  generatedAt: string;
  totals: {
    runningExams: number;
    studentsInProgress: number;
    online: number;
    disconnected: number;
    flagged: number;
    warned: number;
  };
  exams: LiveOverviewExam[];
}
