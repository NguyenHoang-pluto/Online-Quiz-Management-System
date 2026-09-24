import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { ProctoringService } from './proctoring.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { ProctoringBatchDto, BroadcastWarningDto } from './dto/proctoring.dto';

@ApiTags('Giám sát hành vi - Module 5')
@ApiBearerAuth()
@Controller('proctoring')
export class ProctoringController {
  constructor(private readonly proctoring: ProctoringService) {}

  @Post('attempts/:attemptId/events')
  @Roles('STUDENT')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Nhận lô sự kiện gom mỗi 5 giây (chức năng 5.1, 5.2, 5.3)',
    description:
      'Client gom sự kiện rồi gửi định kỳ; khi đóng trình duyệt đột ngột thì ' +
      'gửi gói cuối bằng navigator.sendBeacon tới chính endpoint này.',
  })
  ingest(
    @Param('attemptId') attemptId: string,
    @Body() dto: ProctoringBatchDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.proctoring.ingestBatch(attemptId, dto, user);
  }

  @Post('violations/:violationId/evidence')
  @Roles('STUDENT')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({
    summary: 'Gửi ảnh bằng chứng tại thời điểm vi phạm (chức năng 5.10)',
    description:
      'Chỉ một khung hình duy nhất tại lúc phát hiện bất thường. Video không ' +
      'bao giờ rời khỏi máy thí sinh.',
  })
  uploadEvidence(
    @Param('violationId') violationId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('Thiếu tệp ảnh');
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Chỉ chấp nhận tệp ảnh');
    }
    return this.proctoring.attachEvidence(violationId, file.buffer, user);
  }

  @Get('violations/:violationId/evidence')
  @Roles('ADMIN', 'LECTURER')
  @ApiOperation({ summary: 'Xem ảnh bằng chứng (chức năng 5.11)' })
  async getEvidence(
    @Param('violationId') violationId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const buffer = await this.proctoring.readEvidence(violationId, user);
    res.set({
      'Content-Type': 'image/jpeg',
      // Dữ liệu sinh trắc: không cho proxy hay CDN nào giữ lại bản sao
      'Cache-Control': 'private, no-store',
    });
    res.send(buffer);
  }

  @Get('live')
  @Roles('ADMIN', 'LECTURER')
  @ApiOperation({
    summary: 'Giám sát toàn thể — tổng quan mọi ca thi',
    description:
      'Quản trị viên thấy toàn trường, giảng viên chỉ thấy lớp mình phụ trách. ' +
      'Ca đang diễn ra xếp lên đầu, ca có thí sinh vượt ngưỡng hoặc mất kết nối ' +
      'được đánh dấu cần chú ý.',
  })
  liveOverview(@CurrentUser() user: AuthUser) {
    return this.proctoring.getLiveOverview(user);
  }

  @Get('exams/:examId/monitor')
  @Roles('ADMIN', 'LECTURER')
  @ApiOperation({ summary: 'Màn hình theo dõi trực tiếp (chức năng 5.7)' })
  monitor(@Param('examId') examId: string, @CurrentUser() user: AuthUser) {
    return this.proctoring.getLiveMonitor(examId, user);
  }

  @Get('attempts/:attemptId/timeline')
  @Roles('ADMIN', 'LECTURER')
  @ApiOperation({ summary: 'Dòng thời gian vi phạm sau ca thi (chức năng 5.8)' })
  timeline(@Param('attemptId') attemptId: string, @CurrentUser() user: AuthUser) {
    return this.proctoring.getTimeline(attemptId, user);
  }

  @Post('exams/:examId/broadcast')
  @Roles('ADMIN', 'LECTURER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gửi cảnh báo chung tới thí sinh đang thi' })
  broadcast(
    @Param('examId') examId: string,
    @Body() dto: BroadcastWarningDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.proctoring.broadcastWarning(examId, dto, user);
  }
}
