import { Module } from '@nestjs/common';
import { ResultController } from './result.controller';
import { ResultService } from './result.service';

/**
 * MODULE 6 — Kết quả và báo cáo
 * Phụ trách: Trương Gia Huy
 */
@Module({
  controllers: [ResultController],
  providers: [ResultService],
  exports: [ResultService],
})
export class ResultModule {}
