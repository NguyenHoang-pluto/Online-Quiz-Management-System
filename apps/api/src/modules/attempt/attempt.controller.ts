import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AttemptService } from './attempt.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { StartAttemptDto, SaveAnswerDto, SubmitAttemptDto } from './dto/attempt.dto';

@ApiTags('Làm bài thi - Module 4')
@ApiBearerAuth()
@Roles('STUDENT')
@Controller('attempts')
export class AttemptController {
  constructor(private readonly attempts: AttemptService) {}

  @Get('my-exams')
  @ApiOperation({ summary: 'Danh sách ca thi của tôi (chức năng 4.1)' })
  myExams(@CurrentUser('id') studentId: string) {
    return this.attempts.listMyExams(studentId);
  }

  @Get('exams/:examId/rules')
  @ApiOperation({ summary: 'Thể lệ thi, xác nhận trước khi vào (chức năng 4.2)' })
  rules(@Param('examId') examId: string, @CurrentUser('id') studentId: string) {
    return this.attempts.getRules(examId, studentId);
  }

  @Post('exams/:examId/start')
  @ApiOperation({ summary: 'Bắt đầu làm bài, sinh đề riêng (chức năng 4.3)' })
  start(
    @Param('examId') examId: string,
    @Body() dto: StartAttemptDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.attempts.start(examId, dto, user, req.ip);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy lại đề và đáp án đã lưu (chức năng 4.4, 4.5, 4.7)' })
  getPaper(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.attempts.getPaper(id, user);
  }

  @Post(':id/answers')
  @ApiOperation({ summary: 'Tự động lưu đáp án (chức năng 4.6)' })
  saveAnswer(
    @Param('id') id: string,
    @Body() dto: SaveAnswerDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attempts.saveAnswer(id, dto, user);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Nộp bài (chức năng 4.8)' })
  submit(
    @Param('id') id: string,
    @Body() dto: SubmitAttemptDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attempts.submit(id, dto, user);
  }
}
