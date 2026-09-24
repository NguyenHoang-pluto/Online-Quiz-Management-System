import { Module } from '@nestjs/common';
import { ProctoringController } from './proctoring.controller';
import { ProctoringService } from './proctoring.service';
import { ProctoringGateway } from './proctoring.gateway';
import { AttemptModule } from '../attempt/attempt.module';
import { StorageModule } from '../../infra/storage/storage.module';
import { ExamModule } from '../exam/exam.module';

/**
 * MODULE 5 — Giám sát hành vi thi
 * Phụ trách: Ma Lý Hoàng Ân
 */
@Module({
  imports: [AttemptModule, StorageModule, ExamModule],
  controllers: [ProctoringController],
  providers: [ProctoringService, ProctoringGateway],
  exports: [ProctoringService, ProctoringGateway],
})
export class ProctoringModule {}
