import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ProctoringThresholds } from '@eduexam/shared';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { ExamService } from '../exam/exam.service';
import { ResultService } from '../result/result.service';
import { isIpAllowed } from '../../common/utils/ip';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type { StartAttemptDto, SaveAnswerDto, SubmitAttemptDto } from './dto/attempt.dto';

/**
 * MODULE 4 — Làm bài thi.
 * Phụ trách: La Vĩ Cường
 *
 * NGUYÊN TẮC SỐNG CÒN: mọi dữ liệu trả cho sinh viên đều đi qua hàm
 * toStudentView(). Không nơi nào trong module này được select isCorrect
 * rồi gửi thẳng ra ngoài.
 */
@Injectable()
export class AttemptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly exams: ExamService,
    private readonly results: ResultService,
  ) {}

  // ==================== DANH SÁCH CA THI ====================

  /** Chức năng 4.1 — danh sách ca thi của sinh viên. */
  async listMyExams(studentId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId },
      select: { courseClassId: true },
    });

    const exams = await this.prisma.exam.findMany({
      where: {
        courseClassId: { in: enrollments.map((e) => e.courseClassId) },
        status: { in: ['PUBLISHED', 'CLOSED'] },
      },
      include: {
        subject: { select: { code: true, name: true } },
        courseClass: { select: { code: true, name: true } },
        room: { select: { code: true, name: true } },
        attempts: { where: { studentId }, select: { id: true, status: true, score: true } },
      },
      orderBy: { openAt: 'desc' },
    });

    const now = new Date();
    return exams.map((e) => {
      const attempt = e.attempts[0];
      let state: 'SAP_DIEN_RA' | 'DANG_MO' | 'DANG_LAM' | 'DA_HOAN_THANH' | 'DA_DONG';

      if (attempt && attempt.status !== 'IN_PROGRESS') state = 'DA_HOAN_THANH';
      else if (attempt) state = 'DANG_LAM';
      else if (e.status === 'CLOSED' || now > e.closeAt) state = 'DA_DONG';
      else if (now < e.openAt) state = 'SAP_DIEN_RA';
      else state = 'DANG_MO';

      return {
        examId: e.id,
        title: e.title,
        subject: e.subject,
        courseClass: e.courseClass,
        room: e.room,
        durationMinutes: e.durationMinutes,
        openAt: e.openAt,
        closeAt: e.closeAt,
        proctoringMode: e.proctoringMode,
        state,
        attemptId: attempt?.id ?? null,
        // Chỉ lộ điểm khi đề cho phép
        score: e.resultDisplay === 'NONE' ? null : (attempt?.score ?? null),
      };
    });
  }

  /** Chức năng 4.2 — thể lệ thi, hiển thị trước khi bấm bắt đầu. */
  async getRules(examId: string, studentId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        policy: true,
        matrixItems: true,
        room: { select: { code: true, name: true } },
      },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');
    await this.mustBeEnrolled(exam.courseClassId, studentId);

    const thresholds = exam.policy?.thresholds as unknown as ProctoringThresholds | undefined;

    // Đang làm dở thì trang thể lệ đổi cách xưng hô: đây là lần xác nhận để
    // làm tiếp, không phải lần bắt đầu mới.
    const existing = await this.prisma.attempt.findUnique({
      where: { examId_studentId: { examId, studentId } },
      select: { status: true },
    });

    return {
      examId: exam.id,
      title: exam.title,
      resuming: existing?.status === 'IN_PROGRESS',
      durationMinutes: exam.durationMinutes,
      totalQuestions: exam.matrixItems.reduce((s, i) => s + i.quantity, 0),
      totalScore: Number(exam.totalScore),
      openAt: exam.openAt,
      closeAt: exam.closeAt,
      proctoringMode: exam.proctoringMode,
      room: exam.room,
      requiresBiometricConsent: exam.proctoringMode === 'REMOTE',
      rules: [
        'Bài thi chỉ được làm một lần duy nhất.',
        `Thời gian làm bài ${exam.durationMinutes} phút, tính từ lúc bấm bắt đầu.`,
        'Đáp án được lưu tự động sau mỗi lần chọn.',
        'Hết giờ hệ thống tự động nộp bài.',
        exam.proctoringMode === 'LAB'
          ? 'Chỉ được làm bài từ máy trong phòng thi đã đăng ký.'
          : 'Camera phải bật trong suốt ca thi. Video không rời khỏi máy của bạn; ' +
            'hệ thống chỉ lưu ảnh tại thời điểm phát hiện vi phạm.',
        `Rời khỏi màn hình thi quá ${(thresholds?.blurMs ?? 3000) / 1000} giây sẽ bị ghi nhận vi phạm.`,
        `Vượt quá ${thresholds?.maxViolations ?? 3} lần vi phạm sẽ bị xử lý theo quy chế.`,
      ],
    };
  }

  private async mustBeEnrolled(courseClassId: string, studentId: string) {
    const e = await this.prisma.enrollment.findUnique({
      where: { courseClassId_studentId: { courseClassId, studentId } },
    });
    if (!e) throw new ForbiddenException('Bạn không thuộc lớp học phần của ca thi này');
  }

  // ==================== BẮT ĐẦU LÀM BÀI ====================

  /**
   * Chức năng 4.3 — sinh đề riêng và lưu ảnh chụp thứ tự đã trộn.
   *
   * Gọi lại khi đang làm dở sẽ trả về đúng đề cũ, không sinh lại. Nếu sinh
   * lại thì sinh viên chỉ cần tải lại trang là đổi được sang đề dễ hơn.
   */
  async start(examId: string, dto: StartAttemptDto, user: AuthUser, ip?: string) {
    if (!dto.acceptRules) {
      throw new BadRequestException('Phải xác nhận đã đọc thể lệ thi');
    }

    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: { policy: true, room: { include: { ipRules: true } } },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');
    if (exam.status !== 'PUBLISHED') {
      throw new BadRequestException('Ca thi chưa mở hoặc đã đóng');
    }
    await this.mustBeEnrolled(exam.courseClassId, user.id);

    const now = new Date();
    if (now < exam.openAt) throw new BadRequestException('Chưa tới giờ mở phòng thi');
    if (now >= exam.closeAt) throw new BadRequestException('Phòng thi đã đóng');

    // Bài đang làm dở thì trả lại nguyên đề cũ
    const existing = await this.prisma.attempt.findUnique({
      where: { examId_studentId: { examId, studentId: user.id } },
    });
    if (existing) {
      if (existing.status !== 'IN_PROGRESS') {
        throw new BadRequestException('Bạn đã nộp bài thi này rồi');
      }
      await this.claimSession(existing.id, user.sessionId, existing.deadlineAt);
      return this.getPaper(existing.id, user);
    }

    const mode = exam.proctoringMode;

    // Chế độ phòng máy: chặn mở bài từ ngoài dải mạng phòng thi
    if (mode === 'LAB') {
      const cidrs = exam.room?.ipRules.map((r) => r.cidr) ?? [];
      if (!isIpAllowed(ip, cidrs)) {
        throw new ForbiddenException(
          `Địa chỉ ${ip ?? 'không xác định'} không thuộc dải mạng phòng thi. ` +
            'Vui lòng làm bài trên máy trong phòng.',
        );
      }
    }

    // Chế độ từ xa: bắt buộc đồng ý xử lý dữ liệu sinh trắc
    if (mode === 'REMOTE' && !dto.acceptBiometric) {
      throw new BadRequestException(
        'Thi từ xa yêu cầu đồng ý cho phép hệ thống nhận diện khuôn mặt qua camera',
      );
    }

    // Hết giờ làm bài hoặc hết giờ đóng phòng, lấy mốc nào tới trước
    const deadlineAt = new Date(
      Math.min(now.getTime() + exam.durationMinutes * 60_000, exam.closeAt.getTime()),
    );

    const paper = await this.exams.generatePaper(examId);

    const attempt = await this.prisma.$transaction(async (tx) => {
      const created = await tx.attempt.create({
        data: {
          examId,
          studentId: user.id,
          proctoringMode: mode,
          startedAt: now,
          deadlineAt,
          ipAddress: ip,
          machineCode: dto.machineCode,
          consentAt: now,
        },
      });
      await tx.attemptQuestion.createMany({
        data: paper.map((p) => ({
          attemptId: created.id,
          questionId: p.questionId,
          orderIndex: p.orderIndex,
          optionOrder: p.optionOrder as any,
        })),
      });
      return created;
    });

    await this.claimSession(attempt.id, user.sessionId, deadlineAt);
    const thresholds = exam.policy?.thresholds as unknown as ProctoringThresholds | undefined;
    await this.redis.touchHeartbeat(attempt.id, thresholds?.heartbeatTimeoutS ?? 60);

    return this.getPaper(attempt.id, user);
  }

  /**
   * Trao quyền làm bài cho phiên hiện tại.
   *
   * KHÔNG chặn sinh viên quay lại. Phiên đăng nhập sinh mới mỗi lần login, nên
   * chặn đồng nghĩa với việc ai đăng xuất rồi vào lại — hoặc chỉ hết hạn token
   * — sẽ mất quyền vào bài của chính mình cho tới hết ca thi.
   *
   * Thay vào đó, phiên mới chiếm quyền và hệ thống đếm số lần chuyển. Phiên cũ
   * mất quyền lưu đáp án ngay, nên vẫn chỉ một thiết bị làm bài tại một thời
   * điểm; còn số lần chuyển tăng bất thường chính là thứ giảng viên cần nhìn.
   */
  private async claimSession(attemptId: string, sessionId: string, deadlineAt: Date) {
    const ttl = Math.max(60, Math.ceil((deadlineAt.getTime() - Date.now()) / 1000));
    const { tookOver } = await this.redis.claimSession(attemptId, sessionId, ttl);

    await this.prisma.attempt.update({
      where: { id: attemptId },
      data: {
        sessionId,
        ...(tookOver ? { sessionTakeoverCount: { increment: 1 } } : {}),
      },
    });
  }

  /**
   * Phiên gửi yêu cầu có còn giữ quyền làm bài không.
   *
   * Chặn trường hợp hai thiết bị mở song song: thiết bị nào vào sau sẽ chiếm
   * quyền, thiết bị trước đó lập tức không lưu được nữa.
   */
  private async assertOwnsSession(attemptId: string, user: AuthUser) {
    if (await this.redis.ownsSession(attemptId, user.sessionId)) return;
    throw new ForbiddenException(
      'Bài thi đã được tiếp tục trên một thiết bị khác, phiên này không còn hiệu lực. ' +
        'Hãy tải lại trang trên thiết bị bạn đang dùng.',
    );
  }

  // ==================== LẤY ĐỀ ====================

  /**
   * Chức năng 4.7 — khôi phục bài thi khi tải lại trang hoặc rớt mạng.
   * Trả về đề theo đúng ảnh chụp đã lưu, kèm các đáp án đã chọn.
   */
  async getPaper(attemptId: string, user: AuthUser) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: { include: { policy: true } },
        questions: {
          orderBy: { orderIndex: 'asc' },
          include: {
            question: {
              select: {
                id: true,
                type: true,
                difficulty: true,
                content: true,
                imageUrl: true,
                defaultScore: true,
                // KHÔNG select isCorrect ở đây
                options: { select: { id: true, content: true } },
              },
            },
            answer: true,
          },
        },
      },
    });
    if (!attempt) throw new NotFoundException('Không tìm thấy lượt thi');
    if (attempt.studentId !== user.id) {
      throw new ForbiddenException('Đây không phải bài thi của bạn');
    }

    // Quá hạn mà vẫn còn IN_PROGRESS thì chốt luôn, không cho làm tiếp
    if (attempt.status === 'IN_PROGRESS' && new Date() >= attempt.deadlineAt) {
      await this.autoSubmit(attempt.id);
      throw new BadRequestException('Đã hết giờ làm bài, hệ thống đã tự động nộp');
    }

    /**
     * Chỉ phiên đã bấm xác nhận thể lệ mới được mở đề.
     *
     * Phiên đăng nhập giữ nguyên khi làm mới access token (AuthService.refresh
     * dùng lại sid cũ), nên tải lại trang hay rớt mạng giữa giờ thi vẫn vào
     * thẳng được — đúng tinh thần chức năng 4.7.
     *
     * Ngược lại, đăng xuất rồi đăng nhập lại sinh phiên MỚI. Trước đây phiên
     * mới chỉ cần mở lại đường dẫn /thi/lam-bai/:id — bằng nút Back của trình
     * duyệt hoặc tab được khôi phục — là vào thẳng bài, bỏ qua toàn bộ phần
     * tích cam kết thể lệ và đồng ý sinh trắc. Giờ phiên mới bị trả về trang
     * thể lệ để xác nhận lại, đúng như lúc vào thi lần đầu.
     */
    if (attempt.status === 'IN_PROGRESS' && attempt.sessionId !== user.sessionId) {
      throw new ForbiddenException({
        code: 'CHUA_XAC_NHAN_THE_LE',
        examId: attempt.examId,
        message:
          'Phiên đăng nhập này chưa xác nhận thể lệ thi. ' +
          'Vui lòng xác nhận lại để làm tiếp bài đang dở.',
      });
    }

    // Mo lai de cung dong nghia voi "toi dang lam bai o day" -> nhan lai quyen
    if (attempt.status === 'IN_PROGRESS') {
      await this.claimSession(attempt.id, user.sessionId, attempt.deadlineAt);
    }

    const thresholds = attempt.exam.policy?.thresholds as unknown as
      | ProctoringThresholds
      | undefined;

    return {
      attemptId: attempt.id,
      examId: attempt.examId,
      title: attempt.exam.title,
      status: attempt.status,
      proctoringMode: attempt.proctoringMode,
      // Đồng hồ do server quyết định; client chỉ hiển thị
      serverTime: new Date().toISOString(),
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      remainingSeconds: Math.max(
        0,
        Math.floor((attempt.deadlineAt.getTime() - Date.now()) / 1000),
      ),
      totalScore: Number(attempt.exam.totalScore),
      violationCount: attempt.violationCount,
      proctoring: {
        signalsEnabled: attempt.exam.policy?.signalsEnabled ?? null,
        thresholds: thresholds ?? null,
        batchIntervalMs: 5000,
      },
      questions: attempt.questions.map((aq) => {
        const optById = new Map(aq.question.options.map((o) => [o.id, o]));
        const order = aq.optionOrder as unknown as string[];
        const selected = (aq.answer?.selectedOptionIds as unknown as string[]) ?? [];

        return {
          orderIndex: aq.orderIndex,
          questionId: aq.question.id,
          type: aq.question.type,
          difficulty: aq.question.difficulty,
          content: aq.question.content,
          imageUrl: aq.question.imageUrl,
          score: Number(aq.question.defaultScore),
          // Nhãn A/B/C/D gán lại theo thứ tự đã trộn của riêng sinh viên này
          options: order.map((optId, i) => ({
            id: optId,
            label: String.fromCharCode(65 + i),
            content: optById.get(optId)?.content ?? '',
          })),
          selectedOptionIds: selected,
          flagged: aq.answer?.flagged ?? false,
          answered: selected.length > 0,
        };
      }),
    };
  }

  // ==================== LƯU ĐÁP ÁN ====================

  /** Chức năng 4.6 — tự động lưu sau mỗi thao tác chọn. */
  async saveAnswer(attemptId: string, dto: SaveAnswerDto, user: AuthUser) {
    const attempt = await this.mustBeMyActiveAttempt(attemptId, user);
    await this.assertOwnsSession(attemptId, user);

    const aq = await this.prisma.attemptQuestion.findUnique({
      where: { attemptId_questionId: { attemptId, questionId: dto.questionId } },
    });
    if (!aq) throw new BadRequestException('Câu hỏi không thuộc đề thi của bạn');

    // Chỉ chấp nhận phương án nằm trong đề đã sinh cho chính sinh viên này
    const allowed = new Set(aq.optionOrder as unknown as string[]);
    const invalid = dto.selectedOptionIds.filter((id) => !allowed.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException('Phương án được chọn không thuộc câu hỏi này');
    }

    const question = await this.prisma.question.findUniqueOrThrow({
      where: { id: dto.questionId },
      select: { type: true },
    });
    if (question.type !== 'MULTIPLE_CHOICE' && dto.selectedOptionIds.length > 1) {
      throw new BadRequestException('Câu hỏi này chỉ được chọn một phương án');
    }

    await this.prisma.attemptAnswer.upsert({
      where: { attemptQuestionId: aq.id },
      create: {
        attemptQuestionId: aq.id,
        selectedOptionIds: dto.selectedOptionIds as any,
        flagged: dto.flagged ?? false,
      },
      update: {
        selectedOptionIds: dto.selectedOptionIds as any,
        flagged: dto.flagged ?? undefined,
      },
    });

    const answered = await this.prisma.attemptAnswer.count({
      where: { attemptQuestion: { attemptId }, NOT: { selectedOptionIds: { equals: [] } } },
    });
    const total = await this.prisma.attemptQuestion.count({ where: { attemptId } });

    return {
      saved: true,
      savedAt: new Date().toISOString(),
      answered,
      total,
      remainingSeconds: Math.max(
        0,
        Math.floor((attempt.deadlineAt.getTime() - Date.now()) / 1000),
      ),
    };
  }

  private async mustBeMyActiveAttempt(attemptId: string, user: AuthUser) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException('Không tìm thấy lượt thi');
    if (attempt.studentId !== user.id) {
      throw new ForbiddenException('Đây không phải bài thi của bạn');
    }
    if (attempt.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Bài thi đã kết thúc');
    }
    if (new Date() >= attempt.deadlineAt) {
      await this.autoSubmit(attemptId);
      throw new BadRequestException('Đã hết giờ làm bài, hệ thống đã tự động nộp');
    }
    return attempt;
  }

  // ==================== NỘP BÀI ====================

  /** Chức năng 4.8 — nộp bài thủ công. */
  async submit(attemptId: string, dto: SubmitAttemptDto, user: AuthUser) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException('Không tìm thấy lượt thi');
    if (attempt.studentId !== user.id) {
      throw new ForbiddenException('Đây không phải bài thi của bạn');
    }

    // Nộp lại cùng một bài đã nộp thì trả kết quả cũ thay vì báo lỗi.
    // Mạng chập chờn rất hay khiến client gửi trùng yêu cầu nộp.
    if (attempt.status !== 'IN_PROGRESS') {
      return this.results.getStudentResult(attemptId, user.id);
    }

    await this.prisma.attempt.update({
      where: { id: attemptId },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });
    await this.results.gradeAttempt(attemptId);
    return this.results.getStudentResult(attemptId, user.id);
  }

  /** Tự động nộp khi hết giờ hoặc khi vượt ngưỡng vi phạm. */
  async autoSubmit(attemptId: string, reason: 'HET_GIO' | 'VI_PHAM' = 'HET_GIO') {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.status !== 'IN_PROGRESS') return;

    await this.prisma.attempt.update({
      where: { id: attemptId },
      data: {
        status: reason === 'VI_PHAM' ? 'TERMINATED' : 'AUTO_SUBMITTED',
        submittedAt: new Date(),
      },
    });
    await this.results.gradeAttempt(attemptId);
  }

  /**
   * Quét các bài đã quá hạn mà chưa nộp. Chạy định kỳ vì có trường hợp
   * sinh viên đóng máy đột ngột, không có request nào để kích hoạt việc chốt bài.
   */
  async sweepExpired(): Promise<number> {
    const expired = await this.prisma.attempt.findMany({
      where: { status: 'IN_PROGRESS', deadlineAt: { lte: new Date() } },
      select: { id: true },
    });
    for (const a of expired) await this.autoSubmit(a.id);
    return expired.length;
  }
}
