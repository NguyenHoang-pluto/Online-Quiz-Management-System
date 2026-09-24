import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  SIGNALS_BY_MODE,
  type ProctoringSignals,
  type ProctoringThresholds,
} from '@eduexam/shared';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { AttemptService } from '../attempt/attempt.service';
import { ExamService } from '../exam/exam.service';
import { ProctoringGateway } from './proctoring.gateway';
import { EvidenceStorageService } from '../../infra/storage/evidence-storage.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type { ProctoringBatchDto, BroadcastWarningDto } from './dto/proctoring.dto';

/** Tín hiệu nào bật/tắt qua cờ nào trong hồ sơ chính sách. */
const SIGNAL_FLAG: Record<string, keyof ProctoringSignals> = {
  TAB_BLUR: 'tabBlur',
  WINDOW_BLUR: 'windowBlur',
  PASTE: 'paste',
  HEARTBEAT_LOST: 'heartbeat',
  IP_OUT_OF_RANGE: 'ipFence',
  FACE_ABSENT: 'faceAbsent',
  FACE_MULTIPLE: 'faceMultiple',
  FACE_AWAY: 'faceAway',
  CAMERA_BLOCKED: 'faceAbsent',
};

/**
 * MODULE 5 — Giám sát hành vi thi.
 * Phụ trách: Ma Lý Hoàng Ân
 *
 * Nguyên tắc: client chỉ BÁO CÁO sự kiện thô. Việc kết luận có vi phạm hay
 * không hoàn toàn do server quyết định (chức năng 5.4), vì client nằm trong
 * tay thí sinh và có thể bị can thiệp.
 */
@Injectable()
export class ProctoringService {
  private readonly logger = new Logger(ProctoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly attempts: AttemptService,
    private readonly gateway: ProctoringGateway,
    private readonly storage: EvidenceStorageService,
    private readonly config: ConfigService,
  ) {}

  // ==================== NHẬN SỰ KIỆN ====================

  /**
   * Chức năng 5.2 và 5.3 — nhận lô sự kiện gom mỗi 5 giây, hoặc gói cuối cùng
   * gửi bằng sendBeacon khi trình duyệt đóng đột ngột.
   */
  async ingestBatch(attemptId: string, dto: ProctoringBatchDto, user: AuthUser) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { exam: { include: { policy: true } } },
    });
    if (!attempt) throw new NotFoundException('Không tìm thấy lượt thi');
    if (attempt.studentId !== user.id) {
      throw new ForbiddenException('Đây không phải bài thi của bạn');
    }
    if (attempt.status !== 'IN_PROGRESS') {
      return { accepted: 0, violations: 0, message: 'Bài thi đã kết thúc' };
    }

    const signals = attempt.exam.policy?.signalsEnabled as unknown as ProctoringSignals;
    const thresholds = attempt.exam.policy?.thresholds as unknown as ProctoringThresholds;
    if (!signals || !thresholds) {
      throw new BadRequestException('Đề thi chưa cấu hình chính sách giám sát');
    }

    // Nhận được lô nghĩa là client còn sống
    await this.redis.touchHeartbeat(attemptId, thresholds.heartbeatTimeoutS);
    await this.prisma.attempt.update({
      where: { id: attemptId },
      data: { lastHeartbeatAt: new Date() },
    });

    // Loại tín hiệu không thuộc hình thức thi này. Ví dụ ca thi tại phòng máy
    // mà client gửi FACE_ABSENT thì đó là dữ liệu rác hoặc bị giả mạo.
    const allowed = new Set<string>(SIGNALS_BY_MODE[attempt.proctoringMode]);

    const accepted = dto.events.filter(
      (e) => allowed.has(e.type) && signals[SIGNAL_FLAG[e.type]] === true,
    );

    if (accepted.length === 0) {
      return { accepted: 0, violations: 0, violationCount: attempt.violationCount };
    }

    await this.prisma.proctoringEvent.createMany({
      data: accepted.map((e) => ({
        attemptId,
        type: e.type,
        occurredAt: new Date(e.occurredAt),
        durationMs: e.durationMs,
        payload: e.payload as any,
      })),
    });

    // Chức năng 5.4 — đối chiếu ngưỡng ở server
    const newViolations = accepted.filter((e) => this.isViolation(e, thresholds));

    let violationCount = attempt.violationCount;
    const violationIds: string[] = [];
    for (const e of newViolations) {
      violationCount++;
      const created = await this.prisma.violation.create({
        data: {
          attemptId,
          type: e.type,
          severity: this.severityOf(e.type),
          occurredAt: new Date(e.occurredAt),
          sequenceNo: violationCount,
          note: this.describe(e.type, e.durationMs),
        },
      });
      violationIds.push(created.id);
    }

    if (newViolations.length > 0) {
      await this.prisma.attempt.update({
        where: { id: attemptId },
        data: { violationCount },
      });

      // Chức năng 5.5 — cảnh báo hiện ngay trên màn hình sinh viên
      this.gateway.warnStudent(attemptId, {
        count: violationCount,
        max: thresholds.maxViolations,
        message: this.describe(
          newViolations[0].type,
          newViolations[0].durationMs,
        ),
      });

      this.gateway.pushMonitorUpdate(attempt.examId, {
        attemptId,
        violationCount,
        lastViolation: newViolations[newViolations.length - 1].type,
        at: new Date().toISOString(),
      });
    }

    // Chức năng 5.6 — xử lý khi vượt ngưỡng
    let action: string | null = null;
    if (violationCount >= thresholds.maxViolations) {
      const onExceed = attempt.exam.policy!.actionOnExceed;
      action = onExceed;

      if (onExceed === 'AUTO_SUBMIT') {
        this.gateway.forceSubmit(attemptId, 'Vượt quá số lần vi phạm cho phép');
        await this.attempts.autoSubmit(attemptId, 'VI_PHAM');
        this.logger.warn(`Hủy bài ${attemptId} do vượt ngưỡng ${violationCount} vi phạm`);
      }
    }

    return {
      accepted: accepted.length,
      violations: newViolations.length,
      violationCount,
      maxViolations: thresholds.maxViolations,
      action,
      // Mô tả đúng loại vi phạm vừa xảy ra, để giao diện khuyên đúng việc cần làm
      message: newViolations.length
        ? this.describe(newViolations[0].type, newViolations[0].durationMs)
        : null,
      // Client dùng danh sách này để gửi kèm ảnh bằng chứng cho đúng vi phạm
      violationIds,
    };
  }

  // ==================== ẢNH BẰNG CHỨNG ====================

  /**
   * Chức năng 5.10 — đính ảnh bằng chứng vào một vi phạm.
   *
   * Chỉ chụp tại đúng thời điểm phát hiện bất thường, không quay hay tải video
   * lên liên tục. Ảnh có hạn lưu trữ, hết hạn sẽ bị tác vụ nền xoá.
   */
  async attachEvidence(violationId: string, file: Buffer, user: AuthUser) {
    const violation = await this.prisma.violation.findUnique({
      where: { id: violationId },
      include: { attempt: { include: { exam: true } } },
    });
    if (!violation) throw new NotFoundException('Không tìm thấy bản ghi vi phạm');
    if (violation.attempt.studentId !== user.id) {
      throw new ForbiddenException('Không phải vi phạm của bạn');
    }
    if (violation.attempt.proctoringMode !== 'REMOTE') {
      throw new BadRequestException('Chỉ ca thi từ xa mới lưu ảnh bằng chứng');
    }
    if (violation.evidenceUrl) {
      return { message: 'Vi phạm này đã có ảnh bằng chứng' };
    }

    const url = await this.storage.save(violationId, file);
    const days = this.config.get<number>('proctoring.evidenceRetentionDays') ?? 30;

    await this.prisma.violation.update({
      where: { id: violationId },
      data: {
        evidenceUrl: url,
        evidenceExpiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      },
    });
    return { saved: true, expiresInDays: days };
  }

  /** Đọc ảnh bằng chứng. Chỉ giảng viên phụ trách và quản trị viên được xem. */
  async readEvidence(violationId: string, user: AuthUser): Promise<Buffer> {
    const violation = await this.prisma.violation.findUnique({
      where: { id: violationId },
      include: { attempt: { include: { exam: { include: { courseClass: true } } } } },
    });
    if (!violation?.evidenceUrl) throw new NotFoundException('Không có ảnh bằng chứng');

    if (
      user.role === 'LECTURER' &&
      violation.attempt.exam.courseClass.lecturerId !== user.id
    ) {
      throw new ForbiddenException('Bạn không phụ trách lớp học phần này');
    }

    const buffer = await this.storage.read(violationId);
    if (!buffer) throw new NotFoundException('Ảnh đã bị xoá theo hạn lưu trữ');
    return buffer;
  }

  /**
   * Quy tắc kết luận vi phạm. Rời màn hình dưới ngưỡng thì chỉ ghi nhận sự kiện
   * chứ không tính vi phạm — người dùng lỡ tay chuyển cửa sổ nửa giây là chuyện
   * bình thường, tính vi phạm sẽ tạo ra hàng loạt báo động giả.
   */
  private isViolation(
    e: { type: string; durationMs?: number },
    t: ProctoringThresholds,
  ): boolean {
    switch (e.type) {
      case 'TAB_BLUR':
      case 'WINDOW_BLUR':
        return (e.durationMs ?? 0) >= t.blurMs;
      case 'FACE_ABSENT':
        return (e.durationMs ?? 0) >= t.faceAbsentMs;
      case 'FACE_AWAY':
        return (e.durationMs ?? 0) >= t.faceAbsentMs;
      // Các tín hiệu này vi phạm ngay từ lần đầu
      case 'PASTE':
      case 'FACE_MULTIPLE':
      case 'CAMERA_BLOCKED':
      case 'IP_OUT_OF_RANGE':
      case 'HEARTBEAT_LOST':
        return true;
      default:
        return false;
    }
  }

  private severityOf(type: string): 'INFO' | 'WARNING' | 'CRITICAL' {
    if (['FACE_MULTIPLE', 'IP_OUT_OF_RANGE', 'CAMERA_BLOCKED'].includes(type)) return 'CRITICAL';
    if (['PASTE', 'HEARTBEAT_LOST'].includes(type)) return 'WARNING';
    return 'WARNING';
  }

  private describe(type: string, durationMs?: number): string {
    const s = durationMs ? ` (${(durationMs / 1000).toFixed(1)}s)` : '';
    const map: Record<string, string> = {
      TAB_BLUR: `Rời khỏi tab thi${s}`,
      WINDOW_BLUR: `Mất tiêu điểm cửa sổ${s}`,
      PASTE: 'Dán nội dung vào bài làm',
      HEARTBEAT_LOST: 'Mất kết nối với máy chủ',
      IP_OUT_OF_RANGE: 'Truy cập từ ngoài dải mạng phòng thi',
      FACE_ABSENT: `Không phát hiện khuôn mặt${s}`,
      FACE_MULTIPLE: 'Phát hiện nhiều hơn một khuôn mặt',
      FACE_AWAY: `Quay mặt khỏi màn hình${s}`,
      CAMERA_BLOCKED: 'Camera bị tắt hoặc che',
    };
    return map[type] ?? type;
  }

  // ==================== MÀN HÌNH GIÁM SÁT ====================

  /**
   * Màn hình giám sát TOÀN THỂ — tổng quan mọi ca thi giảng viên phụ trách.
   *
   * Màn giám sát chi tiết chỉ xem được một ca thi. Nhưng một giảng viên có thể
   * có nhiều lớp thi cùng buổi, và điều họ cần trước tiên là "ca nào đang chạy,
   * ca nào có vấn đề" rồi mới bấm vào ca đó.
   *
   * Quản trị viên thấy toàn trường, giảng viên chỉ thấy lớp mình.
   */
  async getLiveOverview(user: AuthUser) {
    const where: any = { status: { in: ['PUBLISHED', 'CLOSED'] } };
    if (user.role === 'LECTURER') where.courseClass = { lecturerId: user.id };

    const exams = await this.prisma.exam.findMany({
      where,
      include: {
        subject: { select: { code: true, name: true } },
        courseClass: {
          select: {
            code: true,
            name: true,
            lecturer: { select: { fullName: true } },
            _count: { select: { enrollments: true } },
          },
        },
        room: { select: { code: true, name: true } },
        policy: true,
      },
      orderBy: { openAt: 'desc' },
      take: 50,
    });
    if (exams.length === 0) {
      return { generatedAt: new Date().toISOString(), totals: this.emptyTotals(), exams: [] };
    }

    // Gom toàn bộ lượt thi của mọi ca trong MỘT truy vấn, tránh N+1
    const attempts = await this.prisma.attempt.findMany({
      where: { examId: { in: exams.map((e) => e.id) } },
      select: {
        id: true,
        examId: true,
        status: true,
        violationCount: true,
        deadlineAt: true,
      },
    });

    // Chỉ hỏi Redis cho những lượt đang làm bài
    const liveIds = attempts.filter((a) => a.status === 'IN_PROGRESS').map((a) => a.id);
    const aliveSet = new Set<string>();
    for (const id of liveIds) {
      if (await this.redis.isAlive(id)) aliveSet.add(id);
    }

    const now = new Date();
    const rows = exams.map((exam) => {
      const mine = attempts.filter((a) => a.examId === exam.id);
      const maxViolations =
        (exam.policy?.thresholds as unknown as ProctoringThresholds)?.maxViolations ?? 3;

      const inProgress = mine.filter((a) => a.status === 'IN_PROGRESS');
      const stats = {
        enrolled: exam.courseClass._count.enrollments,
        started: mine.length,
        inProgress: inProgress.length,
        online: inProgress.filter((a) => aliveSet.has(a.id)).length,
        disconnected: inProgress.filter((a) => !aliveSet.has(a.id)).length,
        flagged: mine.filter((a) => a.violationCount >= maxViolations).length,
        warned: mine.filter(
          (a) => a.violationCount > 0 && a.violationCount < maxViolations,
        ).length,
        submitted: mine.filter((a) => a.status !== 'IN_PROGRESS').length,
      };

      return {
        examId: exam.id,
        title: exam.title,
        subject: exam.subject,
        courseClass: exam.courseClass,
        room: exam.room,
        proctoringMode: exam.proctoringMode,
        phase: ExamService.phaseOf(exam, now),
        openAt: exam.openAt,
        closeAt: exam.closeAt,
        durationMinutes: exam.durationMinutes,
        maxViolations,
        stats,
        // Ca thi cần chú ý: có người vượt ngưỡng hoặc mất kết nối
        needsAttention: stats.flagged > 0 || stats.disconnected > 0,
      };
    });

    // Ca đang diễn ra lên đầu, trong đó ca có vấn đề lên trước
    const order: Record<string, number> = {
      DANG_DIEN_RA: 0,
      HET_GIO: 1,
      SAP_DIEN_RA: 2,
      DA_DONG: 3,
      BAN_NHAP: 4,
    };
    rows.sort(
      (a, b) =>
        order[a.phase] - order[b.phase] ||
        Number(b.needsAttention) - Number(a.needsAttention) ||
        b.openAt.getTime() - a.openAt.getTime(),
    );

    const live = rows.filter((r) => r.phase === 'DANG_DIEN_RA');
    return {
      generatedAt: new Date().toISOString(),
      totals: {
        runningExams: live.length,
        studentsInProgress: live.reduce((s, r) => s + r.stats.inProgress, 0),
        online: live.reduce((s, r) => s + r.stats.online, 0),
        disconnected: live.reduce((s, r) => s + r.stats.disconnected, 0),
        flagged: live.reduce((s, r) => s + r.stats.flagged, 0),
        warned: live.reduce((s, r) => s + r.stats.warned, 0),
      },
      exams: rows,
    };
  }

  private emptyTotals() {
    return {
      runningExams: 0,
      studentsInProgress: 0,
      online: 0,
      disconnected: 0,
      flagged: 0,
      warned: 0,
    };
  }

  /** Chức năng 5.7 — bảng theo dõi trực tiếp cho giảng viên. */
  async getLiveMonitor(examId: string, user: AuthUser) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: { courseClass: true, policy: true, room: true, subject: true },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');
    if (user.role === 'LECTURER' && exam.courseClass.lecturerId !== user.id) {
      throw new ForbiddenException('Bạn không phụ trách lớp học phần này');
    }

    const thresholds = exam.policy?.thresholds as unknown as ProctoringThresholds;
    const attempts = await this.prisma.attempt.findMany({
      where: { examId },
      include: {
        student: { select: { code: true, fullName: true } },
        violations: { orderBy: { occurredAt: 'desc' }, take: 3 },
        _count: { select: { questions: true } },
      },
      orderBy: { violationCount: 'desc' },
    });

    const enrolled = await this.prisma.enrollment.count({
      where: { courseClassId: exam.courseClassId },
    });

    const rows = await Promise.all(
      attempts.map(async (a) => {
        const alive = await this.redis.isAlive(a.id);
        const answered = await this.prisma.attemptAnswer.count({
          where: {
            attemptQuestion: { attemptId: a.id },
            NOT: { selectedOptionIds: { equals: [] } },
          },
        });

        let state: 'BINH_THUONG' | 'NHAC_NHO' | 'DANH_DAU' | 'MAT_KET_NOI' | 'DA_NOP';
        if (a.status !== 'IN_PROGRESS') state = 'DA_NOP';
        else if (!alive) state = 'MAT_KET_NOI';
        else if (a.violationCount >= thresholds.maxViolations) state = 'DANH_DAU';
        else if (a.violationCount > 0) state = 'NHAC_NHO';
        else state = 'BINH_THUONG';

        return {
          attemptId: a.id,
          studentCode: a.student.code,
          studentName: a.student.fullName,
          machineCode: a.machineCode,
          ipAddress: a.ipAddress,
          sessionTakeoverCount: a.sessionTakeoverCount,
          online: alive,
          lastHeartbeatAt: a.lastHeartbeatAt,
          progress: { answered, total: a._count.questions },
          progressPercent: a._count.questions
            ? Math.round((answered / a._count.questions) * 100)
            : 0,
          remainingSeconds: Math.max(
            0,
            Math.floor((a.deadlineAt.getTime() - Date.now()) / 1000),
          ),
          violationCount: a.violationCount,
          maxViolations: thresholds.maxViolations,
          recentViolations: a.violations.map((v) => ({
            type: v.type,
            note: v.note,
            at: v.occurredAt,
          })),
          status: a.status,
          state,
        };
      }),
    );

    return {
      examId,
      examTitle: exam.title,
      subject: exam.subject.name,
      room: exam.room,
      proctoringMode: exam.proctoringMode,
      thresholds,
      stats: {
        enrolled,
        started: rows.length,
        online: rows.filter((r) => r.online && r.status === 'IN_PROGRESS').length,
        clean: rows.filter((r) => r.state === 'BINH_THUONG').length,
        warned: rows.filter((r) => r.state === 'NHAC_NHO').length,
        flagged: rows.filter((r) => r.state === 'DANH_DAU').length,
        disconnected: rows.filter((r) => r.state === 'MAT_KET_NOI').length,
        submitted: rows.filter((r) => r.state === 'DA_NOP').length,
      },
      rows,
    };
  }

  /** Chức năng 5.8 — dòng thời gian vi phạm của một thí sinh sau ca thi. */
  async getTimeline(attemptId: string, user: AuthUser) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        student: { select: { code: true, fullName: true } },
        exam: { include: { courseClass: true } },
        violations: { orderBy: { occurredAt: 'asc' } },
        events: { orderBy: { occurredAt: 'asc' }, take: 500 },
      },
    });
    if (!attempt) throw new NotFoundException('Không tìm thấy lượt thi');
    if (user.role === 'LECTURER' && attempt.exam.courseClass.lecturerId !== user.id) {
      throw new ForbiddenException('Bạn không phụ trách lớp học phần này');
    }

    return {
      attemptId,
      student: attempt.student,
      examTitle: attempt.exam.title,
      proctoringMode: attempt.proctoringMode,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      status: attempt.status,
      violationCount: attempt.violationCount,
      violations: attempt.violations.map((v) => ({
        sequenceNo: v.sequenceNo,
        type: v.type,
        severity: v.severity,
        note: v.note,
        occurredAt: v.occurredAt,
        evidenceUrl: v.evidenceUrl,
        offsetSeconds: Math.floor(
          (v.occurredAt.getTime() - attempt.startedAt.getTime()) / 1000,
        ),
      })),
      events: attempt.events.map((e) => ({
        type: e.type,
        occurredAt: e.occurredAt,
        durationMs: e.durationMs,
        offsetSeconds: Math.floor(
          (e.occurredAt.getTime() - attempt.startedAt.getTime()) / 1000,
        ),
      })),
    };
  }

  /** Gửi cảnh báo chung tới thí sinh đang thi. */
  async broadcastWarning(examId: string, dto: BroadcastWarningDto, user: AuthUser) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: { courseClass: true },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');
    if (user.role === 'LECTURER' && exam.courseClass.lecturerId !== user.id) {
      throw new ForbiddenException('Bạn không phụ trách lớp học phần này');
    }

    const targets = dto.attemptIds?.length
      ? dto.attemptIds
      : (
          await this.prisma.attempt.findMany({
            where: { examId, status: 'IN_PROGRESS' },
            select: { id: true },
          })
        ).map((a) => a.id);

    for (const id of targets) {
      this.gateway.warnStudent(id, { message: dto.message, fromProctor: true });
    }
    return { sent: targets.length };
  }

  // ==================== TÁC VỤ ĐỊNH KỲ ====================

  /**
   * Phát hiện mất tín hiệu heartbeat (chức năng 5.1, tín hiệu thứ 4).
   *
   * Không thể chờ client báo, vì trường hợp cần bắt chính là lúc client
   * biến mất: rút mạng, tắt máy đột ngột, đóng trình duyệt.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async detectLostHeartbeats() {
    const running = await this.prisma.attempt.findMany({
      where: { status: 'IN_PROGRESS' },
      include: { exam: { include: { policy: true } } },
    });

    for (const a of running) {
      const thresholds = a.exam.policy?.thresholds as unknown as ProctoringThresholds;
      if (!thresholds) continue;

      const signals = a.exam.policy?.signalsEnabled as unknown as ProctoringSignals;
      if (!signals?.heartbeat) continue;

      if (await this.redis.isAlive(a.id)) continue;

      // Chưa từng nhận heartbeat nào thì bỏ qua, sinh viên vừa mới bắt đầu
      if (!a.lastHeartbeatAt) continue;

      const silentSeconds = (Date.now() - a.lastHeartbeatAt.getTime()) / 1000;
      if (silentSeconds < thresholds.heartbeatTimeoutS) continue;

      // Chỉ ghi một lần cho mỗi lần mất kết nối, tránh spam mỗi 30 giây
      const already = await this.prisma.violation.findFirst({
        where: {
          attemptId: a.id,
          type: 'HEARTBEAT_LOST',
          occurredAt: { gte: a.lastHeartbeatAt },
        },
      });
      if (already) continue;

      const count = a.violationCount + 1;
      await this.prisma.$transaction([
        this.prisma.violation.create({
          data: {
            attemptId: a.id,
            type: 'HEARTBEAT_LOST',
            severity: 'WARNING',
            occurredAt: new Date(),
            sequenceNo: count,
            note: `Mất kết nối ${Math.round(silentSeconds)} giây`,
          },
        }),
        this.prisma.attempt.update({
          where: { id: a.id },
          data: { violationCount: count },
        }),
      ]);

      this.gateway.pushMonitorUpdate(a.examId, {
        attemptId: a.id,
        violationCount: count,
        lastViolation: 'HEARTBEAT_LOST',
        at: new Date().toISOString(),
      });
      this.logger.warn(`Lượt thi ${a.id} mất tín hiệu ${Math.round(silentSeconds)} giây`);
    }
  }

  /** Chốt các bài quá hạn mà chưa nộp (chức năng 4.8). */
  @Cron(CronExpression.EVERY_MINUTE)
  async sweepExpiredAttempts() {
    const n = await this.attempts.sweepExpired();
    if (n > 0) this.logger.log(`Đã tự động nộp ${n} bài quá hạn`);
  }

  /**
   * Xóa ảnh bằng chứng quá hạn lưu trữ.
   * Nghị định 13/2023 yêu cầu không giữ dữ liệu cá nhân lâu hơn mục đích đã nêu.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredEvidence() {
    const expired = await this.prisma.violation.findMany({
      where: { evidenceExpiresAt: { lte: new Date() }, evidenceUrl: { not: null } },
      select: { id: true },
    });
    if (expired.length === 0) return;

    // Phải xoá cả tệp trên đĩa, không chỉ xoá đường dẫn trong CSDL —
    // nếu không, ảnh sinh trắc vẫn nằm lại máy chủ sau khi hết hạn lưu trữ.
    for (const v of expired) await this.storage.remove(v.id);

    await this.prisma.violation.updateMany({
      where: { id: { in: expired.map((v) => v.id) } },
      data: { evidenceUrl: null, evidenceExpiresAt: null },
    });
    this.logger.log(`Đã xoá ${expired.length} ảnh bằng chứng hết hạn lưu trữ`);
  }
}
