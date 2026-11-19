import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProctoringService } from './proctoring.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { AttemptService } from '../attempt/attempt.service';
import { ProctoringGateway } from './proctoring.gateway';
import { EvidenceStorageService } from '../../infra/storage/evidence-storage.service';
import { ProctoringMode, ViolationAction } from '@eduexam/shared';

describe('ProctoringService (Module 5)', () => {
  let service: ProctoringService;
  let prisma: any;
  let redis: any;
  let attempts: any;
  let gateway: any;
  let storage: any;

  const mockAttempt = {
    id: 'attempt-1',
    studentId: 'student-1',
    status: 'IN_PROGRESS',
    proctoringMode: ProctoringMode.LAB,
    violationCount: 0,
    startedAt: new Date(Date.now() - 60000),
    examId: 'exam-1',
    exam: {
      id: 'exam-1',
      policy: {
        mode: ProctoringMode.LAB,
        actionOnExceed: ViolationAction.AUTO_SUBMIT,
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
      },
    },
  };

  const studentUser = {
    id: 'student-1',
    code: '3123410013',
    role: 'STUDENT' as const,
    sessionId: 'session-1',
    jti: 'jti-1',
  };

  beforeEach(async () => {
    prisma = {
      attempt: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      proctoringEvent: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      violation: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'viol-1', ...data })),
      },
    };

    redis = {
      touchHeartbeat: jest.fn().mockResolvedValue(undefined),
      isAlive: jest.fn().mockResolvedValue(true),
    };

    attempts = {
      autoSubmit: jest.fn().mockResolvedValue(undefined),
    };

    gateway = {
      warnStudent: jest.fn(),
      pushMonitorUpdate: jest.fn(),
      forceSubmit: jest.fn(),
    };

    storage = {
      save: jest.fn(),
      read: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProctoringService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: AttemptService, useValue: attempts },
        { provide: ProctoringGateway, useValue: gateway },
        { provide: EvidenceStorageService, useValue: storage },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'proctoring.evidenceRetentionDays') return 30;
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ProctoringService>(ProctoringService);
  });

  describe('5.1 & 5.2 — ingestBatch', () => {
    it('ghi nhận sự kiện và cập nhật heartbeat', async () => {
      prisma.attempt.findUnique.mockResolvedValue(mockAttempt);

      const res = await service.ingestBatch(
        'attempt-1',
        {
          events: [
            {
              type: 'TAB_BLUR',
              occurredAt: new Date().toISOString(),
              durationMs: 1500, // Dưới ngưỡng 3000ms
            },
          ],
        },
        studentUser,
      );

      expect(res.accepted).toBe(1);
      expect(res.violations).toBe(0);
      expect(redis.touchHeartbeat).toHaveBeenCalledWith('attempt-1', 30);
      expect(prisma.proctoringEvent.createMany).toHaveBeenCalled();
      expect(gateway.warnStudent).not.toHaveBeenCalled();
    });

    it('tính vi phạm khi rời tab >= 3000ms (chức năng 5.4)', async () => {
      prisma.attempt.findUnique.mockResolvedValue(mockAttempt);

      const res = await service.ingestBatch(
        'attempt-1',
        {
          events: [
            {
              type: 'TAB_BLUR',
              occurredAt: new Date().toISOString(),
              durationMs: 4000, // Vượt ngưỡng 3000ms
            },
          ],
        },
        studentUser,
      );

      expect(res.accepted).toBe(1);
      expect(res.violations).toBe(1);
      expect(res.violationCount).toBe(1);
      expect(prisma.violation.create).toHaveBeenCalled();
      expect(gateway.warnStudent).toHaveBeenCalled();
    });

    it('tính vi phạm ngay lập tức khi dán nội dung (PASTE)', async () => {
      prisma.attempt.findUnique.mockResolvedValue(mockAttempt);

      const res = await service.ingestBatch(
        'attempt-1',
        {
          events: [
            {
              type: 'PASTE',
              occurredAt: new Date().toISOString(),
            },
          ],
        },
        studentUser,
      );

      expect(res.violations).toBe(1);
      expect(res.violationCount).toBe(1);
    });

    it('tự động nộp bài khi vượt ngưỡng vi phạm (chức năng 5.6)', async () => {
      // Đã có sẵn 2 vi phạm, thêm 1 vi phạm nữa là chạm ngưỡng maxViolations = 3
      prisma.attempt.findUnique.mockResolvedValue({
        ...mockAttempt,
        violationCount: 2,
      });

      const res = await service.ingestBatch(
        'attempt-1',
        {
          events: [
            {
              type: 'PASTE',
              occurredAt: new Date().toISOString(),
            },
          ],
        },
        studentUser,
      );

      expect(res.violationCount).toBe(3);
      expect(res.action).toBe('AUTO_SUBMIT');
      expect(gateway.forceSubmit).toHaveBeenCalledWith(
        'attempt-1',
        'Vượt quá số lần vi phạm cho phép',
      );
      expect(attempts.autoSubmit).toHaveBeenCalledWith('attempt-1', 'VI_PHAM');
    });

    it('từ chối sinh viên khác can thiệp bài thi', async () => {
      prisma.attempt.findUnique.mockResolvedValue(mockAttempt);

      await expect(
        service.ingestBatch(
          'attempt-1',
          { events: [] },
          { ...studentUser, id: 'another-student' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
