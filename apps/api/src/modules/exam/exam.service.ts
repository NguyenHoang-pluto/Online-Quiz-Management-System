import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_LAB_POLICY,
  DEFAULT_REMOTE_POLICY,
  ExamPhase,
  type ProctoringPolicyConfig,
} from '@eduexam/shared';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';
import { shuffle, sample } from '../../common/utils/shuffle';
import { isIpInCidr } from '../../common/utils/ip';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type { CreateExamDto, UpdateExamDto, SetMatrixDto, UpdatePolicyDto } from './dto/exam.dto';

/** Một câu trong đề đã sinh: câu nào, vị trí nào, thứ tự phương án ra sao. */
export interface GeneratedQuestion {
  questionId: string;
  orderIndex: number;
  optionOrder: string[];
}

/**
 * MODULE 3 — Đề thi và ma trận đề.
 * Phụ trách: Nguyễn Huy Hoàng
 */
@Injectable()
export class ExamService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Giai đoạn thực tế của đề thi, tính từ giờ mở/đóng.
   *
   * ExamStatus chỉ cho biết giảng viên đã bấm gì (nháp / phát hành / đóng).
   * Một đề PUBLISHED có thể đang là "chưa tới giờ", "đang diễn ra" hoặc
   * "hết giờ mà chưa chốt" — ba tình huống cần hiển thị hoàn toàn khác nhau.
   */
  static phaseOf(
    exam: { status: string; openAt: Date; closeAt: Date },
    now = new Date(),
  ): ExamPhase {
    if (exam.status === 'DRAFT') return ExamPhase.BAN_NHAP;
    if (exam.status === 'CLOSED') return ExamPhase.DA_DONG;
    if (now < exam.openAt) return ExamPhase.SAP_DIEN_RA;
    if (now >= exam.closeAt) return ExamPhase.HET_GIO;
    return ExamPhase.DANG_DIEN_RA;
  }

  // ==================== TRUY VẤN ====================

  async list(pg: PaginationDto, user: AuthUser) {
    const where: any = {};
    // Giảng viên chỉ thấy đề của lớp mình phụ trách
    if (user.role === 'LECTURER') where.courseClass = { lecturerId: user.id };
    if (pg.q) where.title = { contains: pg.q };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.exam.findMany({
        where,
        skip: pg.skip,
        take: pg.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          subject: { select: { code: true, name: true } },
          courseClass: { select: { code: true, name: true } },
          room: { select: { code: true, name: true } },
          _count: { select: { attempts: true, matrixItems: true } },
        },
      }),
      this.prisma.exam.count({ where }),
    ]);

    // Đếm số thí sinh đang làm bài cho tất cả đề trong một truy vấn,
    // thay vì mỗi đề một truy vấn
    const running = await this.prisma.attempt.groupBy({
      by: ['examId'],
      where: { examId: { in: items.map((e) => e.id) }, status: 'IN_PROGRESS' },
      _count: { _all: true },
    });
    const runningBy = new Map(running.map((r) => [r.examId, r._count._all]));

    const now = new Date();
    return paginate(
      items.map((e) => ({
        ...e,
        phase: ExamService.phaseOf(e, now),
        inProgressCount: runningBy.get(e.id) ?? 0,
      })),
      total,
      pg,
    );
  }

  async findOne(id: string, user?: AuthUser) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        subject: true,
        courseClass: { include: { lecturer: { select: { id: true, fullName: true } } } },
        room: { include: { ipRules: true } },
        policy: true,
        matrixItems: { include: { chapter: true } },
        _count: { select: { attempts: true } },
      },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');

    if (user?.role === 'LECTURER' && exam.courseClass.lecturerId !== user.id) {
      throw new ForbiddenException('Bạn không phụ trách lớp học phần này');
    }

    const inProgressCount = await this.prisma.attempt.count({
      where: { examId: id, status: 'IN_PROGRESS' },
    });
    return { ...exam, phase: ExamService.phaseOf(exam), inProgressCount };
  }

  private async mustBeDraft(id: string, user: AuthUser) {
    const exam = await this.findOne(id, user);
    if (exam.status !== 'DRAFT') {
      throw new BadRequestException(
        `Đề thi đang ở trạng thái ${exam.status}, chỉ sửa được khi còn là bản nháp`,
      );
    }
    return exam;
  }

  // ==================== TẠO VÀ SỬA ====================

  /** Chức năng 3.1 — tạo đề thi. */
  async create(dto: CreateExamDto, user: AuthUser) {
    const cc = await this.prisma.courseClass.findUnique({
      where: { id: dto.courseClassId },
      include: { subject: true },
    });
    if (!cc) throw new NotFoundException('Không tìm thấy lớp học phần');
    if (user.role === 'LECTURER' && cc.lecturerId !== user.id) {
      throw new ForbiddenException('Bạn không phụ trách lớp học phần này');
    }

    const openAt = new Date(dto.openAt);
    const closeAt = new Date(dto.closeAt);
    this.validateWindow(openAt, closeAt, dto.durationMinutes);

    const mode = dto.proctoringMode ?? 'LAB';
    if (mode === 'LAB' && !dto.roomId) {
      throw new BadRequestException('Thi tại phòng máy phải chọn phòng');
    }

    const policyId = dto.policyId ?? (await this.defaultPolicyId(mode));

    return this.prisma.exam.create({
      data: {
        title: dto.title,
        subjectId: cc.subjectId,
        courseClassId: cc.id,
        durationMinutes: dto.durationMinutes,
        openAt,
        closeAt,
        shuffleQuestions: dto.shuffleQuestions ?? true,
        shuffleOptions: dto.shuffleOptions ?? true,
        resultDisplay: dto.resultDisplay ?? 'SCORE_ONLY',
        totalScore: dto.totalScore ?? 10,
        strictMultipleChoice: dto.strictMultipleChoice ?? true,
        proctoringMode: mode,
        policyId,
        roomId: mode === 'LAB' ? dto.roomId : null,
        createdById: user.id,
      },
      include: { policy: true, room: true },
    });
  }

  /**
   * Khung giờ mở phòng thi phải đủ dài cho một lượt làm bài trọn vẹn,
   * nếu không sẽ có sinh viên vào muộn và bị cắt giờ oan.
   */
  private validateWindow(openAt: Date, closeAt: Date, durationMinutes: number) {
    if (closeAt <= openAt) {
      throw new BadRequestException('Thời điểm đóng phải sau thời điểm mở');
    }
    const windowMinutes = (closeAt.getTime() - openAt.getTime()) / 60000;
    if (windowMinutes < durationMinutes) {
      throw new BadRequestException(
        `Khung giờ mở phòng chỉ ${Math.round(windowMinutes)} phút, ` +
          `ngắn hơn thời lượng làm bài ${durationMinutes} phút`,
      );
    }
  }

  private async defaultPolicyId(mode: 'LAB' | 'REMOTE'): Promise<string> {
    const existing = await this.prisma.proctoringPolicy.findFirst({
      where: { mode, isSystem: true },
    });
    if (existing) return existing.id;

    const cfg: ProctoringPolicyConfig =
      mode === 'LAB' ? DEFAULT_LAB_POLICY : DEFAULT_REMOTE_POLICY;
    const created = await this.prisma.proctoringPolicy.create({
      data: {
        name: mode === 'LAB' ? 'Chuẩn phòng máy' : 'Chuẩn thi từ xa',
        mode,
        isSystem: true,
        signalsEnabled: cfg.signalsEnabled as any,
        thresholds: cfg.thresholds as any,
        actionOnExceed: cfg.actionOnExceed,
      },
    });
    return created.id;
  }

  async update(id: string, dto: UpdateExamDto, user: AuthUser) {
    const exam = await this.mustBeDraft(id, user);

    const openAt = dto.openAt ? new Date(dto.openAt) : exam.openAt;
    const closeAt = dto.closeAt ? new Date(dto.closeAt) : exam.closeAt;
    const duration = dto.durationMinutes ?? exam.durationMinutes;
    this.validateWindow(openAt, closeAt, duration);

    const mode = dto.proctoringMode ?? exam.proctoringMode;
    const roomId = dto.roomId ?? exam.roomId;
    if (mode === 'LAB' && !roomId) {
      throw new BadRequestException('Thi tại phòng máy phải chọn phòng');
    }

    return this.prisma.exam.update({
      where: { id },
      data: {
        title: dto.title,
        durationMinutes: dto.durationMinutes,
        openAt: dto.openAt ? openAt : undefined,
        closeAt: dto.closeAt ? closeAt : undefined,
        shuffleQuestions: dto.shuffleQuestions,
        shuffleOptions: dto.shuffleOptions,
        resultDisplay: dto.resultDisplay,
        totalScore: dto.totalScore,
        strictMultipleChoice: dto.strictMultipleChoice,
        proctoringMode: dto.proctoringMode,
        // Đổi hình thức thi thì phải đổi luôn hồ sơ ngưỡng tương ứng
        policyId: dto.proctoringMode ? await this.defaultPolicyId(mode) : dto.policyId,
        roomId: mode === 'LAB' ? roomId : null,
      },
      include: { policy: true, room: true },
    });
  }

  // ==================== MA TRẬN ĐỀ ====================

  /** Chức năng 3.2 — khai báo ma trận đề. */
  async setMatrix(id: string, dto: SetMatrixDto, user: AuthUser) {
    const exam = await this.mustBeDraft(id, user);

    const chapters = await this.prisma.chapter.findMany({
      where: { id: { in: dto.items.map((i) => i.chapterId) } },
    });
    const wrong = chapters.find((c) => c.subjectId !== exam.subjectId);
    if (wrong) {
      throw new BadRequestException(`Chương "${wrong.name}" không thuộc môn học của đề thi`);
    }
    if (chapters.length !== new Set(dto.items.map((i) => i.chapterId)).size) {
      throw new BadRequestException('Có chương không tồn tại trong ma trận');
    }

    await this.prisma.$transaction([
      this.prisma.examMatrixItem.deleteMany({ where: { examId: id } }),
      this.prisma.examMatrixItem.createMany({
        data: dto.items.map((i) => ({ examId: id, ...i })),
      }),
    ]);

    return this.checkMatrixAvailability(id);
  }

  /**
   * Chức năng 3.2 (phần sau) — đối chiếu ma trận với số câu thực có trong
   * ngân hàng. Đây chính là cảnh báo "Khó chỉ còn 4 câu (Sát ngưỡng)" ở mockup.
   */
  async checkMatrixAvailability(examId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: { matrixItems: { include: { chapter: true } } },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');

    const rows = await Promise.all(
      exam.matrixItems.map(async (item) => {
        const available = await this.prisma.question.count({
          where: {
            chapterId: item.chapterId,
            difficulty: item.difficulty,
            status: 'ACTIVE',
          },
        });
        const ratio = available === 0 ? 0 : item.quantity / available;
        return {
          chapterId: item.chapterId,
          chapterCode: item.chapter.code,
          chapterName: item.chapter.name,
          difficulty: item.difficulty,
          required: item.quantity,
          available,
          // Dùng gần hết kho thì mọi sinh viên sẽ nhận đề gần giống nhau
          status:
            available < item.quantity ? 'THIEU' : ratio >= 0.8 ? 'SAT_NGUONG' : 'DU',
        };
      }),
    );

    const totalQuestions = exam.matrixItems.reduce((s, i) => s + i.quantity, 0);
    const missing = rows.filter((r) => r.status === 'THIEU');

    return {
      examId,
      totalQuestions,
      scorePerQuestion:
        totalQuestions > 0 ? Number(exam.totalScore) / totalQuestions : 0,
      rows,
      canPublish: missing.length === 0 && totalQuestions > 0,
      missing,
    };
  }

  // ==================== SINH ĐỀ ====================

  /**
   * Sinh một đề riêng theo ma trận. Module 4 gọi hàm này khi sinh viên bắt đầu
   * làm bài, và lưu kết quả lại thành ảnh chụp bất biến.
   *
   * Bốc ngẫu nhiên bằng nguồn crypto chứ không dùng Math.random, vì thứ tự
   * đoán được thì việc trộn đề mất hết ý nghĩa.
   */
  async generatePaper(examId: string): Promise<GeneratedQuestion[]> {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: { matrixItems: true },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');
    if (exam.matrixItems.length === 0) {
      throw new BadRequestException('Đề thi chưa khai báo ma trận');
    }

    const picked: { id: string; options: { id: string }[] }[] = [];

    for (const item of exam.matrixItems) {
      const pool = await this.prisma.question.findMany({
        where: {
          chapterId: item.chapterId,
          difficulty: item.difficulty,
          status: 'ACTIVE',
        },
        select: { id: true, options: { select: { id: true }, orderBy: { orderIndex: 'asc' } } },
      });

      if (pool.length < item.quantity) {
        throw new BadRequestException(
          `Ngân hàng chỉ có ${pool.length} câu mức ${item.difficulty} ` +
            `trong khi ma trận cần ${item.quantity} câu`,
        );
      }
      picked.push(...sample(pool, item.quantity));
    }

    const ordered = exam.shuffleQuestions ? shuffle(picked) : picked;

    return ordered.map((q, index) => ({
      questionId: q.id,
      orderIndex: index,
      optionOrder: exam.shuffleOptions
        ? shuffle(q.options.map((o) => o.id))
        : q.options.map((o) => o.id),
    }));
  }

  /**
   * Chức năng 3.7 — xem trước một đề mẫu sinh ngẫu nhiên.
   * Giảng viên được xem cả đáp án đúng; endpoint này chặn vai trò STUDENT.
   */
  async previewPaper(examId: string, user: AuthUser) {
    await this.findOne(examId, user);
    const paper = await this.generatePaper(examId);

    const questions = await this.prisma.question.findMany({
      where: { id: { in: paper.map((p) => p.questionId) } },
      include: {
        options: true,
        chapter: { select: { code: true, name: true } },
      },
    });
    const byId = new Map(questions.map((q) => [q.id, q]));

    return paper.map((p) => {
      const q = byId.get(p.questionId)!;
      const optById = new Map(q.options.map((o) => [o.id, o]));
      return {
        orderIndex: p.orderIndex,
        questionId: q.id,
        chapter: q.chapter,
        difficulty: q.difficulty,
        type: q.type,
        content: q.content,
        options: p.optionOrder.map((optId, i) => {
          const o = optById.get(optId)!;
          return {
            id: o.id,
            label: String.fromCharCode(65 + i), // gán lại nhãn theo thứ tự đã trộn
            content: o.content,
            isCorrect: o.isCorrect,
          };
        }),
      };
    });
  }

  // ==================== VÒNG ĐỜI ====================

  /** Chức năng 3.6 — Nháp → Đã phát hành. */
  async publish(id: string, user: AuthUser) {
    const exam = await this.findOne(id, user);
    if (exam.status !== 'DRAFT') {
      throw new BadRequestException('Chỉ phát hành được đề đang ở trạng thái nháp');
    }

    const check = await this.checkMatrixAvailability(id);
    if (!check.canPublish) {
      throw new BadRequestException({
        message: 'Ngân hàng câu hỏi không đủ so với ma trận đề',
        missing: check.missing,
      });
    }

    const enrolled = await this.prisma.enrollment.count({
      where: { courseClassId: exam.courseClassId },
    });
    if (enrolled === 0) {
      throw new BadRequestException('Lớp học phần chưa có sinh viên nào');
    }

    // Sinh thử một đề để chắc chắn thuật toán chạy được trước khi mở phòng thi
    await this.generatePaper(id);

    return this.prisma.exam.update({
      where: { id },
      data: { status: 'PUBLISHED' },
      include: { policy: true, room: true },
    });
  }

  async close(id: string, user: AuthUser) {
    const exam = await this.findOne(id, user);
    if (exam.status !== 'PUBLISHED') {
      throw new BadRequestException('Chỉ đóng được đề đang phát hành');
    }

    // Bài nào còn dở mà hết giờ thì chốt luôn thành tự động nộp
    await this.prisma.attempt.updateMany({
      where: { examId: id, status: 'IN_PROGRESS' },
      data: { status: 'AUTO_SUBMITTED', submittedAt: new Date() },
    });

    return this.prisma.exam.update({ where: { id }, data: { status: 'CLOSED' } });
  }

  // ==================== CHÍNH SÁCH GIÁM SÁT ====================

  /** Chức năng 3.5 — cấu hình chính sách giám sát hành vi. */
  async updatePolicy(id: string, dto: UpdatePolicyDto, user: AuthUser) {
    const exam = await this.mustBeDraft(id, user);
    const mode = dto.proctoringMode ?? exam.proctoringMode;

    const base: ProctoringPolicyConfig =
      mode === 'LAB' ? DEFAULT_LAB_POLICY : DEFAULT_REMOTE_POLICY;

    // Ngưỡng riêng thì tạo hồ sơ riêng cho đề này, không sửa hồ sơ chuẩn
    const policy = await this.prisma.proctoringPolicy.create({
      data: {
        name: `${exam.title} — ${mode === 'LAB' ? 'phòng máy' : 'từ xa'}`,
        mode,
        isSystem: false,
        signalsEnabled: base.signalsEnabled as any,
        thresholds: { ...base.thresholds, ...(dto.thresholds ?? {}) } as any,
        actionOnExceed: dto.actionOnExceed ?? base.actionOnExceed,
      },
    });

    if (dto.allowedCidrs && exam.roomId) {
      for (const cidr of dto.allowedCidrs) {
        if (!isIpInCidr(cidr.split('/')[0], cidr)) {
          throw new BadRequestException(`Dải IP không hợp lệ: ${cidr}`);
        }
      }
      await this.prisma.$transaction([
        this.prisma.roomIpRule.deleteMany({ where: { roomId: exam.roomId } }),
        this.prisma.roomIpRule.createMany({
          data: dto.allowedCidrs.map((cidr) => ({ roomId: exam.roomId!, cidr })),
        }),
      ]);
    }

    return this.prisma.exam.update({
      where: { id },
      data: { proctoringMode: mode, policyId: policy.id },
      include: { policy: true, room: { include: { ipRules: true } } },
    });
  }
}
