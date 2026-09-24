import { Module } from '@nestjs/common';
import { ExamController } from './exam.controller';
import { ExamService } from './exam.service';

/**
 * MODULE 3 — Đề thi và ma trận đề
 * Phụ trách: Nguyễn Huy Hoàng
 */
@Module({
  controllers: [ExamController],
  providers: [ExamService],
  exports: [ExamService],
})
export class ExamModule {}
