import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { ResultService } from './result.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Kết quả & Báo cáo - Module 6')
@ApiBearerAuth()
@Controller('results')
export class ResultController {
  constructor(private readonly results: ResultService) {}

  // ---------- Sinh viên ----------

  @Get('my-history')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Lịch sử các ca thi của tôi (chức năng 6.3)' })
  history(@CurrentUser('id') studentId: string) {
    return this.results.getStudentHistory(studentId);
  }

  @Get('attempts/:attemptId')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Xem điểm và xem lại đáp án (chức năng 6.2)' })
  myResult(@Param('attemptId') attemptId: string, @CurrentUser('id') studentId: string) {
    return this.results.getStudentResult(attemptId, studentId);
  }

  // ---------- Giảng viên ----------

  @Get('exams/:examId/gradebook')
  @Roles('ADMIN', 'LECTURER')
  @ApiOperation({ summary: 'Bảng điểm lớp (chức năng 6.4)' })
  gradebook(@Param('examId') examId: string, @CurrentUser() user: AuthUser) {
    return this.results.getGradebook(examId, user);
  }

  @Get('exams/:examId/distribution')
  @Roles('ADMIN', 'LECTURER')
  @ApiOperation({ summary: 'Phổ điểm để vẽ biểu đồ (chức năng 6.6)' })
  distribution(@Param('examId') examId: string, @CurrentUser() user: AuthUser) {
    return this.results.getScoreDistribution(examId, user);
  }

  @Get('exams/:examId/item-analysis')
  @Roles('ADMIN', 'LECTURER')
  @ApiOperation({ summary: 'Phân tích độ khó và độ phân biệt từng câu (chức năng 6.7)' })
  itemAnalysis(@Param('examId') examId: string, @CurrentUser() user: AuthUser) {
    return this.results.getItemAnalysis(examId, user);
  }

  @Get('exams/:examId/export.xlsx')
  @Roles('ADMIN', 'LECTURER')
  @ApiOperation({ summary: 'Xuất bảng điểm ra Excel (chức năng 6.5)' })
  async exportExcel(
    @Param('examId') examId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const buffer = await this.results.exportGradebook(examId, user);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="bang-diem-${examId}.xlsx"`,
    });
    res.send(buffer);
  }
}
