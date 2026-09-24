import { Module } from '@nestjs/common';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';
import { ExamModule } from '../exam/exam.module';
import { ResultModule } from '../result/result.module';

/**
 * MODULE 4 — Làm bài thi
 * Phụ trách: La Vĩ Cường
 */
@Module({
  imports: [ExamModule, ResultModule],
  controllers: [AttemptController],
  providers: [AttemptService],
  exports: [AttemptService],
})
export class AttemptModule {}
