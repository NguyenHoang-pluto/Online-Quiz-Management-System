import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ExamPhase } from '@eduexam/shared';

import { ExamService } from './exam.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

/**
 * Unit test Module 3 — Đề thi và ma trận đề.
 * Prisma được giả lập hoàn toàn, không cần MySQL để chạy.
 */

const HOUR = 3600_000;
const lecturer = { id: 'gv1', role: 'LECTURER' } as AuthUser;
const otherLecturer = { id: 'gv2', role: 'LECTURER' } as AuthUser;

function makeExam(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exam1',
    title: 'Thi giữa kỳ',
    subjectId: 'sub1',
    courseClassId: 'cc1',
    courseClass: { lecturerId: 'gv1' },
    durationMinutes: 60,
    openAt: new Date(Date.now() - HOUR),
    closeAt: new Date(Date.now() + 2 * HOUR),
    status: 'DRAFT',
    shuffleQuestions: true,
    shuffleOptions: true,
    totalScore: 10,
    proctoringMode: 'REMOTE',
    roomId: null,
    policyId: 'sys-remote',
    policy: {
      id: 'sys-remote',
      mode: 'REMOTE',
      isSystem: true,
      thresholds: { blurMs: 5000, heartbeatTimeoutS: 90, faceAbsentMs: 10000, maxViolations: 5 },
      actionOnExceed: 'FLAG',
    },
    matrixItems: [],
    _count: { attempts: 0 },
    ...overrides,
  };
}

function makePrisma() {
  const prisma: any = {
    exam: {
      findUnique: jest.fn(),
      update: jest.fn(async ({ data }) => ({ id: 'exam1', ...data })),
      create: jest.fn(),
      count: jest.fn(async () => 1),
      delete: jest.fn(),
    },
    attempt: {
      count: jest.fn(async () => 0),
      findMany: jest.fn(async () => []),
      updateMany: jest.fn(),
    },
    question: { count: jest.fn(), findMany: jest.fn() },
    enrollment: { count: jest.fn(async () => 30) },
    courseClass: { findUnique: jest.fn() },
    proctoringPolicy: {
      findFirst: jest.fn(async ({ where }) => ({ id: `sys-${where.mode.toLowerCase()}` })),
      findUnique: jest.fn(),
      create: jest.fn(async ({ data }) => ({ id: 'new-policy', ...data })),
      update: jest.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      delete: jest.fn(),
    },
    roomIpRule: { deleteMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn(async (ops) => ops),
  };
  return prisma;
}

function setup(exam = makeExam()) {
  const prisma = makePrisma();
  prisma.exam.findUnique.mockResolvedValue(exam);
  const results = { gradeAttempt: jest.fn() };
  const service = new ExamService(prisma, results as any);
  return { service, prisma, results };
}

/** Kho câu hỏi giả: mỗi câu 4 phương án theo thứ tự cố định. */
function pool(prefix: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    options: ['a', 'b', 'c', 'd'].map((o) => ({ id: `${prefix}${i}${o}` })),
  }));
}

describe('ExamService — Module 3', () => {
  describe('phaseOf — giai đoạn thực tế của đề', () => {
    const now = new Date('2026-11-25T02:00:00Z');
    const window = {
      openAt: new Date('2026-11-25T01:00:00Z'),
      closeAt: new Date('2026-11-25T04:00:00Z'),
    };

    it('phân biệt đủ 5 giai đoạn', () => {
      expect(ExamService.phaseOf({ status: 'DRAFT', ...window }, now)).toBe(ExamPhase.BAN_NHAP);
      expect(ExamService.phaseOf({ status: 'CLOSED', ...window }, now)).toBe(ExamPhase.DA_DONG);
      expect(ExamService.phaseOf({ status: 'PUBLISHED', ...window }, now)).toBe(
        ExamPhase.DANG_DIEN_RA,
      );
      expect(
        ExamService.phaseOf({ status: 'PUBLISHED', ...window }, new Date('2026-11-25T00:00:00Z')),
      ).toBe(ExamPhase.SAP_DIEN_RA);
      expect(
        ExamService.phaseOf({ status: 'PUBLISHED', ...window }, new Date('2026-11-25T05:00:00Z')),
      ).toBe(ExamPhase.HET_GIO);
    });
  });

  describe('3.1 — tạo đề thi', () => {
    it('từ chối khung giờ ngắn hơn thời lượng làm bài', async () => {
      const { service, prisma } = setup();
      prisma.courseClass.findUnique.mockResolvedValue({ id: 'cc1', lecturerId: 'gv1', subjectId: 'sub1' });
      const openAt = new Date();
      await expect(
        service.create(
          {
            title: 'Đề',
            courseClassId: 'cc1',
            durationMinutes: 60,
            openAt: openAt.toISOString(),
            closeAt: new Date(openAt.getTime() + 30 * 60_000).toISOString(),
            proctoringMode: 'REMOTE',
          },
          lecturer,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.exam.create).not.toHaveBeenCalled();
    });

    it('không cho giảng viên tạo đề cho lớp người khác', async () => {
      const { service, prisma } = setup();
      prisma.courseClass.findUnique.mockResolvedValue({ id: 'cc1', lecturerId: 'gv1', subjectId: 'sub1' });
      await expect(
        service.create(
          {
            title: 'Đề',
            courseClassId: 'cc1',
            durationMinutes: 60,
            openAt: new Date().toISOString(),
            closeAt: new Date(Date.now() + 2 * HOUR).toISOString(),
          },
          otherLecturer,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('xoá được bản nháp và dọn luôn hồ sơ ngưỡng riêng', async () => {
      const { service, prisma } = setup(
        makeExam({ policyId: 'own', policy: { id: 'own', mode: 'REMOTE', isSystem: false } }),
      );
      prisma.proctoringPolicy.findUnique.mockResolvedValue({
        id: 'own',
        isSystem: false,
        _count: { exams: 0 },
      });
      await service.remove('exam1', lecturer);
      expect(prisma.exam.delete).toHaveBeenCalledWith({ where: { id: 'exam1' } });
      expect(prisma.proctoringPolicy.delete).toHaveBeenCalledWith({ where: { id: 'own' } });
    });

    it('không xoá được đề đã phát hành', async () => {
      const { service, prisma } = setup(makeExam({ status: 'PUBLISHED' }));
      await expect(service.remove('exam1', lecturer)).rejects.toThrow(BadRequestException);
      expect(prisma.exam.delete).not.toHaveBeenCalled();
    });
  });

  describe('3.2 — ma trận đề', () => {
    it('đánh dấu đủ / sát ngưỡng / thiếu theo kho câu hỏi', async () => {
      const { service, prisma } = setup(
        makeExam({
          matrixItems: [
            { chapterId: 'c1', difficulty: 'EASY', quantity: 2, chapter: { code: 'C1', name: 'Chương 1' } },
            { chapterId: 'c1', difficulty: 'MEDIUM', quantity: 4, chapter: { code: 'C1', name: 'Chương 1' } },
            { chapterId: 'c2', difficulty: 'HARD', quantity: 3, chapter: { code: 'C2', name: 'Chương 2' } },
          ],
        }),
      );
      prisma.question.count
        .mockResolvedValueOnce(10) // dễ: dùng 20% kho
        .mockResolvedValueOnce(5) // trung bình: dùng 80% kho
        .mockResolvedValueOnce(2); // khó: thiếu 1 câu

      const check = await service.checkMatrixAvailability('exam1');

      expect(check.rows.map((r) => r.status)).toEqual(['DU', 'SAT_NGUONG', 'THIEU']);
      expect(check.totalQuestions).toBe(9);
      expect(check.scorePerQuestion).toBeCloseTo(10 / 9);
      expect(check.canPublish).toBe(false);
      expect(check.missing).toHaveLength(1);
    });

    it('giảng viên khác không xem được đối chiếu ma trận', async () => {
      const { service } = setup();
      await expect(service.availability('exam1', otherLecturer)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('3.3 + 3.7 — sinh đề theo ma trận', () => {
    it('bốc đúng số câu mỗi ô, không trùng câu', async () => {
      const { service, prisma } = setup(
        makeExam({
          matrixItems: [
            { chapterId: 'c1', difficulty: 'EASY', quantity: 3 },
            { chapterId: 'c2', difficulty: 'HARD', quantity: 2 },
          ],
        }),
      );
      prisma.question.findMany
        .mockResolvedValueOnce(pool('e', 8))
        .mockResolvedValueOnce(pool('h', 4));

      const paper = await service.generatePaper('exam1');

      expect(paper).toHaveLength(5);
      expect(new Set(paper.map((p) => p.questionId)).size).toBe(5);
      expect(paper.filter((p) => p.questionId.startsWith('e'))).toHaveLength(3);
      expect(paper.filter((p) => p.questionId.startsWith('h'))).toHaveLength(2);
      expect(paper.map((p) => p.orderIndex)).toEqual([0, 1, 2, 3, 4]);
      for (const p of paper) {
        expect([...p.optionOrder].sort()).toEqual(
          ['a', 'b', 'c', 'd'].map((o) => `${p.questionId}${o}`),
        );
      }
    });

    it('tắt trộn thì xếp theo chương rồi mức độ, giữ thứ tự phương án gốc', async () => {
      const { service, prisma } = setup(
        makeExam({
          shuffleQuestions: false,
          shuffleOptions: false,
          // CSDL trả về lộn xộn: chương 2 trước, trong chương 1 thì khó trước dễ
          matrixItems: [
            { chapterId: 'c2', difficulty: 'EASY', quantity: 1, chapter: { orderIndex: 2 } },
            { chapterId: 'c1', difficulty: 'HARD', quantity: 1, chapter: { orderIndex: 1 } },
            { chapterId: 'c1', difficulty: 'EASY', quantity: 2, chapter: { orderIndex: 1 } },
          ],
        }),
      );
      prisma.question.findMany.mockImplementation(async ({ where }: any) =>
        pool(`${where.chapterId}${where.difficulty[0]}-`, 2),
      );

      const paper = await service.generatePaper('exam1');

      expect(paper.map((p) => p.questionId.split('-')[0])).toEqual(['c1E', 'c1E', 'c1H', 'c2E']);
      for (const p of paper) {
        expect(p.optionOrder).toEqual(['a', 'b', 'c', 'd'].map((o) => `${p.questionId}${o}`));
      }
    });

    it('báo lỗi khi kho không đủ câu', async () => {
      const { service, prisma } = setup(
        makeExam({ matrixItems: [{ chapterId: 'c1', difficulty: 'HARD', quantity: 5 }] }),
      );
      prisma.question.findMany.mockResolvedValueOnce(pool('h', 3));
      await expect(service.generatePaper('exam1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('3.4 + 3.5 — cấu hình đề và chính sách giám sát', () => {
    it('sửa đề mà không đổi hình thức thi thì giữ hồ sơ ngưỡng riêng', async () => {
      const { service, prisma } = setup(makeExam({ policyId: 'own' }));
      await service.update(
        'exam1',
        { resultDisplay: 'WITH_ANSWERS', shuffleOptions: false, proctoringMode: 'REMOTE' },
        lecturer,
      );
      const data = prisma.exam.update.mock.calls[0][0].data;
      expect(data.resultDisplay).toBe('WITH_ANSWERS');
      expect(data.shuffleOptions).toBe(false);
      expect(data.policyId).toBeUndefined(); // không ghi đè policyId
    });

    it('đổi hình thức thi thì quay về hồ sơ chuẩn tương ứng', async () => {
      const { service, prisma } = setup();
      await service.update('exam1', { proctoringMode: 'LAB', roomId: 'room1' }, lecturer);
      const data = prisma.exam.update.mock.calls[0][0].data;
      expect(data.policyId).toBe('sys-lab');
      expect(data.roomId).toBe('room1');
    });

    it('lần đầu chỉnh ngưỡng thì tách hồ sơ riêng, không sửa hồ sơ hệ thống', async () => {
      const { service, prisma } = setup();
      await service.updatePolicy(
        'exam1',
        { thresholds: { blurMs: 4000, heartbeatTimeoutS: 60, faceAbsentMs: 8000, maxViolations: 4 } },
        lecturer,
      );
      expect(prisma.proctoringPolicy.update).not.toHaveBeenCalled();
      expect(prisma.proctoringPolicy.create).toHaveBeenCalledTimes(1);
      expect(prisma.proctoringPolicy.create.mock.calls[0][0].data.thresholds.maxViolations).toBe(4);
    });

    it('các lần sau sửa thẳng vào hồ sơ riêng thay vì tạo thêm', async () => {
      const { service, prisma } = setup(
        makeExam({
          policyId: 'own',
          policy: {
            id: 'own',
            mode: 'REMOTE',
            isSystem: false,
            thresholds: { blurMs: 4000, heartbeatTimeoutS: 60, faceAbsentMs: 8000, maxViolations: 4 },
            actionOnExceed: 'AUTO_SUBMIT',
          },
        }),
      );
      await service.updatePolicy('exam1', { actionOnExceed: 'WARN' }, lecturer);
      expect(prisma.proctoringPolicy.create).not.toHaveBeenCalled();
      const data = prisma.proctoringPolicy.update.mock.calls[0][0].data;
      expect(data.actionOnExceed).toBe('WARN');
      expect(data.thresholds.maxViolations).toBe(4); // giữ ngưỡng đã chỉnh trước đó
    });

    it('dải IP sai thì không ghi gì cả', async () => {
      const { service, prisma } = setup(makeExam({ proctoringMode: 'LAB', roomId: 'room1' }));
      await expect(
        service.updatePolicy('exam1', { allowedCidrs: ['10.0.0.0/24', '999.1.1.1/24'] }, lecturer),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.proctoringPolicy.create).not.toHaveBeenCalled();
      expect(prisma.roomIpRule.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('3.6 — chuyển trạng thái đề thi', () => {
    it('không phát hành được khi khung giờ đã qua', async () => {
      const { service, prisma } = setup(
        makeExam({ closeAt: new Date(Date.now() - 60_000) }),
      );
      await expect(service.publish('exam1', lecturer)).rejects.toThrow(BadRequestException);
      expect(prisma.exam.update).not.toHaveBeenCalled();
    });

    it('thu hồi về bản nháp khi chưa ai vào thi', async () => {
      const { service, prisma } = setup(makeExam({ status: 'PUBLISHED' }));
      await service.unpublish('exam1', lecturer);
      expect(prisma.exam.update.mock.calls[0][0].data).toEqual({ status: 'DRAFT' });
    });

    it('không thu hồi được khi đã có lượt làm bài', async () => {
      const { service } = setup(makeExam({ status: 'PUBLISHED', _count: { attempts: 2 } }));
      await expect(service.unpublish('exam1', lecturer)).rejects.toThrow(BadRequestException);
    });

    it('đóng ca thi thì chốt và CHẤM ĐIỂM các bài đang làm dở', async () => {
      const { service, prisma, results } = setup(makeExam({ status: 'PUBLISHED' }));
      prisma.attempt.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);

      const closed = await service.close('exam1', lecturer);

      expect(closed.status).toBe('CLOSED');
      expect(closed.autoSubmittedCount).toBe(2);
      expect(prisma.attempt.updateMany.mock.calls[0][0].data.status).toBe('AUTO_SUBMITTED');
      expect(results.gradeAttempt).toHaveBeenCalledWith('a1');
      expect(results.gradeAttempt).toHaveBeenCalledWith('a2');
    });
  });
});
