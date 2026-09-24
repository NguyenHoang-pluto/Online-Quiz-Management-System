import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { QuestionBankService } from './question-bank.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateQuestionDto, UpdateQuestionDto, ListQuestionsDto } from './dto/question.dto';

@ApiTags('Ngân hàng câu hỏi - Module 2')
@ApiBearerAuth()
@Roles('ADMIN', 'LECTURER')
@Controller('questions')
export class QuestionBankController {
  constructor(private readonly questionBank: QuestionBankService) {}

  @Get('template.xlsx')
  @ApiOperation({ summary: 'Tải file Excel mẫu để nhập câu hỏi' })
  async template(@Res() res: Response) {
    const buffer = await this.questionBank.buildQuestionTemplate();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="mau-cau-hoi.xlsx"',
    });
    res.send(buffer);
  }

  @Get()
  @ApiOperation({ summary: 'Tìm kiếm và lọc câu hỏi (chức năng 2.8)' })
  list(@Query() query: ListQuestionsDto) {
    return this.questionBank.list(query, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.questionBank.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Soạn câu hỏi mới (chức năng 2.1, 2.2, 2.3)' })
  create(@Body() dto: CreateQuestionDto, @CurrentUser('id') authorId: string) {
    return this.questionBank.create(dto, authorId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateQuestionDto) {
    return this.questionBank.update(id, dto);
  }

  @Patch(':id/disable')
  @ApiOperation({ summary: 'Vô hiệu hóa câu hỏi (chức năng 2.9)' })
  disable(@Param('id') id: string) {
    return this.questionBank.setStatus(id, 'DISABLED');
  }

  @Patch(':id/enable')
  enable(@Param('id') id: string) {
    return this.questionBank.setStatus(id, 'ACTIVE');
  }

  @Post('import/excel')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        subjectId: { type: 'string' },
      },
    },
  })
  @ApiOperation({ summary: 'Import câu hỏi từ Excel (chức năng 2.7)' })
  importExcel(
    @UploadedFile() file: Express.Multer.File,
    @Body('subjectId') subjectId: string,
    @CurrentUser('id') authorId: string,
  ) {
    if (!file) throw new BadRequestException('Chưa chọn file');
    if (!subjectId) throw new BadRequestException('Thiếu subjectId');
    return this.questionBank.importFromExcel(file.buffer, subjectId, authorId);
  }

  @Post('import/word')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        subjectId: { type: 'string' },
        chapterId: { type: 'string' },
      },
    },
  })
  @ApiOperation({ summary: 'Import câu hỏi từ Word bằng Pandoc (chức năng 2.6)' })
  importWord(
    @UploadedFile() file: Express.Multer.File,
    @Body('subjectId') subjectId: string,
    @Body('chapterId') chapterId: string,
    @CurrentUser('id') authorId: string,
  ) {
    if (!file) throw new BadRequestException('Chưa chọn file');
    if (!subjectId || !chapterId) throw new BadRequestException('Thiếu subjectId hoặc chapterId');
    return this.questionBank.importFromWord(file.buffer, subjectId, chapterId, authorId);
  }
}
