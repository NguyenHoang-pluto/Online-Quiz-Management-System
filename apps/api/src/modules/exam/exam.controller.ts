import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ExamService } from './exam.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateExamDto, UpdateExamDto, SetMatrixDto, UpdatePolicyDto } from './dto/exam.dto';

@ApiTags('Đề thi & Ma trận - Module 3')
@ApiBearerAuth()
@Roles('ADMIN', 'LECTURER')
@Controller('exams')
export class ExamController {
  constructor(private readonly exams: ExamService) {}

  @Get()
  list(@Query() pg: PaginationDto, @CurrentUser() user: AuthUser) {
    return this.exams.list(pg, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.exams.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo đề thi (chức năng 3.1)' })
  create(@Body() dto: CreateExamDto, @CurrentUser() user: AuthUser) {
    return this.exams.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Sửa cấu hình đề thi (chức năng 3.3, 3.4)' })
  update(@Param('id') id: string, @Body() dto: UpdateExamDto, @CurrentUser() user: AuthUser) {
    return this.exams.update(id, dto, user);
  }

  @Put(':id/matrix')
  @ApiOperation({ summary: 'Khai báo ma trận đề (chức năng 3.2)' })
  setMatrix(@Param('id') id: string, @Body() dto: SetMatrixDto, @CurrentUser() user: AuthUser) {
    return this.exams.setMatrix(id, dto, user);
  }

  @Get(':id/matrix/availability')
  @ApiOperation({ summary: 'Đối chiếu ma trận với số câu thực có trong ngân hàng' })
  availability(@Param('id') id: string) {
    return this.exams.checkMatrixAvailability(id);
  }

  @Get(':id/preview')
  @ApiOperation({ summary: 'Xem trước một đề mẫu sinh ngẫu nhiên (chức năng 3.7)' })
  preview(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.exams.previewPaper(id, user);
  }

  @Patch(':id/policy')
  @ApiOperation({ summary: 'Cấu hình chính sách giám sát hành vi (chức năng 3.5)' })
  updatePolicy(
    @Param('id') id: string,
    @Body() dto: UpdatePolicyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.exams.updatePolicy(id, dto, user);
  }

  @Patch(':id/publish')
  @ApiOperation({ summary: 'Phát hành đề thi (chức năng 3.6)' })
  publish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.exams.publish(id, user);
  }

  @Patch(':id/close')
  @ApiOperation({ summary: 'Đóng ca thi (chức năng 3.6)' })
  close(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.exams.close(id, user);
  }
}
