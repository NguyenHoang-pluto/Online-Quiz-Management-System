import { ForbiddenException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';

import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

/**
 * MODULE 6 — Kết quả và báo cáo.
 * Phụ trách: Trương Gia Huy
 */
@Injectable()
export class ResultService {
  private readonly logger = new Logger(ResultService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== CHẤM ĐIỂM ====================

  /**
   * Chức năng 6.1 — chấm điểm tự động ngay khi nộp bài.
   *
   * Toàn bộ việc so đáp án diễn ra ở server. Đây là nơi DUY NHẤT trong hệ thống
   * đọc cờ isCorrect, và kết quả chỉ ghi vào CSDL chứ không trả ngược ra.
   */
  async gradeAttempt(attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: true,
        questions: {
          include: {
            answer: true,
            question: { include: { options: { select: { id: true, isCorrect: true } } } },
          },
        },
      },
    });
    if (!attempt) throw new NotFoundException('Không tìm thấy lượt thi');

    const total = attempt.questions.length;
    if (total === 0) return;

    const scorePerQuestion = Number(attempt.exam.totalScore) / total;
    let correctCount = 0;
    let earned = 0;

    const updates = attempt.questions.map((aq) => {
      const correctIds = new Set(
        aq.question.options.filter((o) => o.isCorrect).map((o) => o.id),
      );
      const selected: string[] = (aq.answer?.selectedOptionIds as unknown as string[]) ?? [];
      const selectedSet = new Set(selected);

      let ratio = 0;

      if (selected.length === 0) {
        ratio = 0;
      } else if (aq.question.type === 'MULTIPLE_CHOICE' && !attempt.exam.strictMultipleChoice) {
        // Điểm từng phần: mỗi đáp án đúng được cộng, mỗi đáp án sai bị trừ,
        // không cho điểm âm ở mức từng câu.
        const hit = selected.filter((id) => correctIds.has(id)).length;
        const miss = selected.filter((id) => !correctIds.has(id)).length;
        ratio = Math.max(0, (hit - miss) / correctIds.size);
      } else {
        // Đúng hết mới tính điểm
        const exact =
          selectedSet.size === correctIds.size &&
          [...selectedSet].every((id) => correctIds.has(id));
        ratio = exact ? 1 : 0;
      }

      const isCorrect = ratio === 1;
      if (isCorrect) correctCount++;
      const questionScore = scorePerQuestion * ratio;
      earned += questionScore;

      return { answerId: aq.answer?.id, isCorrect, earnedScore: questionScore };
    });

    await this.prisma.$transaction([
      ...updates
        .filter((u) => u.answerId)
        .map((u) =>
          this.prisma.attemptAnswer.update({
            where: { id: u.answerId! },
            data: {
              isCorrect: u.isCorrect,
              earnedScore: Number(u.earnedScore.toFixed(2)),
            },
          }),
        ),
      this.prisma.attempt.update({
        where: { id: attemptId },
        data: {
          // Làm tròn 2 chữ số thập phân, đúng như mockup Module 6 ghi
          score: Number(earned.toFixed(2)),
          correctCount,
          gradedAt: new Date(),
        },
      }),
    ]);

    this.logger.log(`Đã chấm bài ${attemptId}: ${correctCount}/${total} câu, ${earned.toFixed(2)} điểm`);
  }

  // ==================== KẾT QUẢ CỦA SINH VIÊN ====================

  /** Chức năng 6.2 — sinh viên xem điểm và xem lại đáp án. */
  async getStudentResult(attemptId: string, studentId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: { include: { subject: true, courseClass: true } },
        questions: {
          orderBy: { orderIndex: 'asc' },
          include: {
            answer: true,
            question: {
              include: { options: true, chapter: { select: { code: true, name: true } } },
            },
          },
        },
      },
    });
    if (!attempt) throw new NotFoundException('Không tìm thấy lượt thi');
    if (attempt.studentId !== studentId) {
      throw new ForbiddenException('Đây không phải bài thi của bạn');
    }

    const display = attempt.exam.resultDisplay;

    const base = {
      attemptId: attempt.id,
      examTitle: attempt.exam.title,
      subject: attempt.exam.subject.name,
      status: attempt.status,
      submittedAt: attempt.submittedAt,
      totalQuestions: attempt.questions.length,
      violationCount: attempt.violationCount,
      durationUsedSeconds: attempt.submittedAt
        ? Math.floor((attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000)
        : null,
    };

    // Chức năng 3.4 — giảng viên chọn mức hiển thị kết quả
    if (display === 'NONE') {
      return { ...base, resultDisplay: display, message: 'Ca thi không công bố điểm' };
    }

    const scored = {
      ...base,
      resultDisplay: display,
      score: attempt.score === null ? null : Number(attempt.score),
      totalScore: Number(attempt.exam.totalScore),
      correctCount: attempt.correctCount,
    };

    if (display === 'SCORE_ONLY') return scored;

    // WITH_ANSWERS — được xem lại từng câu kèm đáp án đúng
    return {
      ...scored,
      questions: attempt.questions.map((aq) => {
        const optById = new Map(aq.question.options.map((o) => [o.id, o]));
        const order = aq.optionOrder as unknown as string[];
        const selected = (aq.answer?.selectedOptionIds as unknown as string[]) ?? [];

        return {
          orderIndex: aq.orderIndex,
          chapter: aq.question.chapter,
          difficulty: aq.question.difficulty,
          content: aq.question.content,
          explanation: aq.question.explanation,
          isCorrect: aq.answer?.isCorrect ?? false,
          earnedScore: aq.answer?.earnedScore ? Number(aq.answer.earnedScore) : 0,
          options: order.map((id, i) => ({
            label: String.fromCharCode(65 + i),
            content: optById.get(id)?.content ?? '',
            isCorrect: optById.get(id)?.isCorrect ?? false,
            selected: selected.includes(id),
          })),
        };
      }),
    };
  }

  /** Chức năng 6.3 — lịch sử các ca thi của sinh viên. */
  async getStudentHistory(studentId: string) {
    const attempts = await this.prisma.attempt.findMany({
      where: { studentId, status: { not: 'IN_PROGRESS' } },
      include: {
        exam: { include: { subject: { select: { code: true, name: true } } } },
      },
      orderBy: { submittedAt: 'desc' },
    });

    return attempts.map((a) => ({
      attemptId: a.id,
      examTitle: a.exam.title,
      subject: a.exam.subject,
      submittedAt: a.submittedAt,
      status: a.status,
      score: a.exam.resultDisplay === 'NONE' ? null : a.score && Number(a.score),
      totalScore: Number(a.exam.totalScore),
      correctCount: a.exam.resultDisplay === 'NONE' ? null : a.correctCount,
      violationCount: a.violationCount,
    }));
  }

  // ==================== BÁO CÁO CHO GIẢNG VIÊN ====================

  private async mustOwnExam(examId: string, user: AuthUser) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: { courseClass: true, subject: true },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');
    if (user.role === 'LECTURER' && exam.courseClass.lecturerId !== user.id) {
      throw new ForbiddenException('Bạn không phụ trách lớp học phần này');
    }
    return exam;
  }

  /** Chức năng 6.4 — bảng điểm lớp. */
  async getGradebook(examId: string, user: AuthUser) {
    const exam = await this.mustOwnExam(examId, user);

    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseClassId: exam.courseClassId },
      include: { student: { select: { id: true, code: true, fullName: true } } },
      orderBy: { student: { code: 'asc' } },
    });

    const attempts = await this.prisma.attempt.findMany({
      where: { examId },
      include: { violations: { select: { id: true, type: true } } },
    });
    const byStudent = new Map(attempts.map((a) => [a.studentId, a]));

    const rows = enrollments.map((e, i) => {
      const a = byStudent.get(e.studentId);
      return {
        stt: i + 1,
        studentId: e.student.id,
        code: e.student.code,
        fullName: e.student.fullName,
        status: a?.status ?? 'CHUA_THI',
        correctCount: a?.correctCount ?? null,
        score: a?.score === null || a?.score === undefined ? null : Number(a.score),
        submittedAt: a?.submittedAt ?? null,
        violationCount: a?.violations.length ?? 0,
        attemptId: a?.id ?? null,
      };
    });

    const graded = rows.filter((r) => r.score !== null).map((r) => r.score!);
    return {
      examId,
      examTitle: exam.title,
      subject: exam.subject.name,
      totalScore: Number(exam.totalScore),
      enrolled: enrollments.length,
      submitted: graded.length,
      summary: this.summarize(graded),
      rows,
    };
  }

  private summarize(scores: number[]) {
    if (scores.length === 0) {
      return { average: 0, median: 0, min: 0, max: 0, stdDev: 0, passRate: 0 };
    }
    const sorted = [...scores].sort((a, b) => a - b);
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    const variance = scores.reduce((s, v) => s + (v - avg) ** 2, 0) / scores.length;
    const mid = Math.floor(sorted.length / 2);

    return {
      average: Number(avg.toFixed(2)),
      median: Number(
        (sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2).toFixed(2),
      ),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      stdDev: Number(Math.sqrt(variance).toFixed(2)),
      passRate: Number(
        ((scores.filter((s) => s >= 5).length / scores.length) * 100).toFixed(1),
      ),
    };
  }

  /** Chức năng 6.6 — phổ điểm để vẽ biểu đồ. */
  async getScoreDistribution(examId: string, user: AuthUser) {
    const exam = await this.mustOwnExam(examId, user);
    const attempts = await this.prisma.attempt.findMany({
      where: { examId, score: { not: null } },
      select: { score: true },
    });
    const scores = attempts.map((a) => Number(a.score));

    const buckets = [
      { label: 'Yếu', min: 0, max: 4, color: 'danger' },
      { label: 'T.Bình', min: 4, max: 5.5, color: 'warning' },
      { label: 'Khá', min: 5.5, max: 7, color: 'secondary' },
      { label: 'Giỏi', min: 7, max: 8.5, color: 'primary' },
      { label: 'X.Sắc', min: 8.5, max: 10.01, color: 'success' },
    ];

    return {
      examId,
      examTitle: exam.title,
      total: scores.length,
      summary: this.summarize(scores),
      buckets: buckets.map((b) => {
        const count = scores.filter((s) => s >= b.min && s < b.max).length;
        return {
          ...b,
          count,
          percent: scores.length ? Number(((count / scores.length) * 100).toFixed(1)) : 0,
        };
      }),
    };
  }

  /**
   * Chức năng 6.7 — phân tích từng câu hỏi.
   *
   * Độ khó (P-value) = tỉ lệ trả lời đúng.
   * Hệ số phân biệt (DI) tính theo phương pháp 27%: lấy nhóm 27% điểm cao nhất
   * và 27% điểm thấp nhất, DI = tỉ lệ đúng nhóm cao − tỉ lệ đúng nhóm thấp.
   * DI thấp hoặc âm nghĩa là câu hỏi không phân loại được thí sinh, cần rà lại.
   */
  async getItemAnalysis(examId: string, user: AuthUser) {
    await this.mustOwnExam(examId, user);

    const attempts = await this.prisma.attempt.findMany({
      where: { examId, gradedAt: { not: null } },
      include: {
        questions: {
          include: {
            answer: true,
            question: {
              select: { id: true, content: true, difficulty: true, options: true },
            },
          },
        },
      },
      orderBy: { score: 'desc' },
    });

    if (attempts.length === 0) {
      return { examId, totalAttempts: 0, items: [] };
    }

    const groupSize = Math.max(1, Math.round(attempts.length * 0.27));
    const upper = attempts.slice(0, groupSize);
    const lower = attempts.slice(-groupSize);

    const questionIds = [...new Set(attempts.flatMap((a) => a.questions.map((q) => q.questionId)))];

    const items = questionIds.map((qid) => {
      const rows = attempts.flatMap((a) => a.questions.filter((q) => q.questionId === qid));
      const question = rows[0].question;

      const totalAnswers = rows.length;
      const correctAnswers = rows.filter((r) => r.answer?.isCorrect).length;
      const pValue = totalAnswers ? correctAnswers / totalAnswers : 0;

      const rateIn = (group: typeof attempts) => {
        const g = group.flatMap((a) => a.questions.filter((q) => q.questionId === qid));
        return g.length ? g.filter((r) => r.answer?.isCorrect).length / g.length : 0;
      };
      const di = rateIn(upper) - rateIn(lower);

      // Tỉ lệ chọn từng phương án, để phát hiện đáp án gây nhiễu bất thường
      const distribution = question.options.map((o) => {
        const chosen = rows.filter((r) =>
          ((r.answer?.selectedOptionIds as unknown as string[]) ?? []).includes(o.id),
        ).length;
        return {
          optionId: o.id,
          label: o.label,
          isCorrect: o.isCorrect,
          chosen,
          percent: totalAnswers ? Number(((chosen / totalAnswers) * 100).toFixed(1)) : 0,
        };
      });

      // Một phương án SAI mà nhiều người chọn hơn đáp án đúng là dấu hiệu
      // đề bài viết nhầm hoặc gán sai đáp án
      const topDistractor = distribution
        .filter((d) => !d.isCorrect)
        .sort((a, b) => b.chosen - a.chosen)[0];
      const suspicious = !!topDistractor && topDistractor.percent > pValue * 100;

      return {
        questionId: qid,
        content: question.content.slice(0, 160),
        declaredDifficulty: question.difficulty,
        totalAnswers,
        correctAnswers,
        pValue: Number(pValue.toFixed(3)),
        correctPercent: Number((pValue * 100).toFixed(1)),
        discriminationIndex: Number(di.toFixed(3)),
        quality:
          di >= 0.4 ? 'RAT_TOT' : di >= 0.3 ? 'TOT' : di >= 0.2 ? 'TAM_DUOC' : 'CAN_RA_SOAT',
        distribution,
        suspicious,
        warning: suspicious
          ? `Phương án ${topDistractor.label} bị chọn ${topDistractor.percent}%, ` +
            `cao hơn tỉ lệ đúng ${(pValue * 100).toFixed(1)}%. Nghi ngờ gán sai đáp án.`
          : null,
      };
    });

    // Lưu lại để lần sau mở báo cáo không phải tính lại
    await this.prisma.$transaction(
      items.map((it) =>
        this.prisma.itemAnalysis.upsert({
          where: { examId_questionId: { examId, questionId: it.questionId } },
          create: {
            examId,
            questionId: it.questionId,
            pValue: it.pValue,
            discriminationIndex: it.discriminationIndex,
            totalAnswers: it.totalAnswers,
            correctAnswers: it.correctAnswers,
            optionDistribution: it.distribution as any,
          },
          update: {
            pValue: it.pValue,
            discriminationIndex: it.discriminationIndex,
            totalAnswers: it.totalAnswers,
            correctAnswers: it.correctAnswers,
            optionDistribution: it.distribution as any,
            computedAt: new Date(),
          },
        }),
      ),
    );

    return {
      examId,
      totalAttempts: attempts.length,
      groupSize,
      items: items.sort((a, b) => a.pValue - b.pValue),
    };
  }

  /** Chức năng 6.5 — xuất bảng điểm ra Excel. */
  async exportGradebook(examId: string, user: AuthUser): Promise<Buffer> {
    const book = await this.getGradebook(examId, user);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'EduExam Pro';
    const ws = wb.addWorksheet('Bảng điểm');

    ws.mergeCells('A1:H1');
    ws.getCell('A1').value = book.examTitle;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.mergeCells('A2:H2');
    ws.getCell('A2').value =
      `Môn: ${book.subject}  |  Sĩ số: ${book.enrolled}  |  Đã thi: ${book.submitted}  |  ` +
      `Điểm TB: ${book.summary.average}  |  Tỉ lệ đạt: ${book.summary.passRate}%`;
    ws.getCell('A2').alignment = { horizontal: 'center' };

    ws.addRow([]);
    const header = ws.addRow([
      'STT', 'MSSV', 'Họ và tên', 'Số câu đúng', 'Điểm', 'Trạng thái', 'Nộp lúc', 'Vi phạm',
    ]);
    header.font = { bold: true };
    header.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      c.border = { bottom: { style: 'thin' } };
    });

    const STATUS: Record<string, string> = {
      CHUA_THI: 'Chưa thi',
      IN_PROGRESS: 'Đang làm',
      SUBMITTED: 'Đã nộp',
      AUTO_SUBMITTED: 'Tự động nộp',
      TERMINATED: 'Bị hủy do vi phạm',
    };

    for (const r of book.rows) {
      const row = ws.addRow([
        r.stt,
        r.code,
        r.fullName,
        r.correctCount ?? '',
        r.score ?? '',
        STATUS[r.status] ?? r.status,
        r.submittedAt ? new Date(r.submittedAt).toLocaleString('vi-VN') : '',
        r.violationCount || '',
      ]);
      if (r.score !== null && r.score < 5) {
        row.getCell(5).font = { color: { argb: 'FFDC2626' }, bold: true };
      }
      if (r.violationCount > 0) {
        row.getCell(8).font = { color: { argb: 'FFD97706' }, bold: true };
      }
    }

    ws.columns = [
      { width: 6 }, { width: 14 }, { width: 28 }, { width: 12 },
      { width: 10 }, { width: 18 }, { width: 20 }, { width: 10 },
    ];
    // MSSV phải là chuỗi, nếu không Excel cắt mất số 0 ở đầu
    ws.getColumn(2).numFmt = '@';

    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
