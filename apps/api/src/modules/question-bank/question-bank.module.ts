import { Module } from '@nestjs/common';
import { QuestionBankController } from './question-bank.controller';
import { QuestionBankService } from './question-bank.service';

/**
 * MODULE 2 — Ngân hàng câu hỏi
 * Phụ trách: Hứa Thế Dân
 */
@Module({
  controllers: [QuestionBankController],
  providers: [QuestionBankService],
  exports: [QuestionBankService],
})
export class QuestionBankModule {}
