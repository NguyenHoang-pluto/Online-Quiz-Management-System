import { Module } from '@nestjs/common';
import { ExamController } from './exam.controller';
import { ExamService } from './exam.service';
import { ResultModule } from '../result/result.module';

/**
 * MODULE 3 — Đề thi và ma trận đề
 * Phụ trách: Nguyễn Huy Hoàng
 */
@Module({
  // Đóng ca thi phải chấm luôn các bài đang làm dở
  imports: [ResultModule],
  controllers: [ExamController],
  providers: [ExamService],
  exports: [ExamService],
})
export class ExamModule {}
