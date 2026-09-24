import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CatalogService } from './catalog.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  CreateSubjectDto,
  UpdateSubjectDto,
  CreateChapterDto,
  UpdateChapterDto,
  CreateCourseClassDto,
  UpdateCourseClassDto,
  EnrollStudentsDto,
  CreateExamRoomDto,
  CreateRoomIpRuleDto,
  ListCourseClassDto,
} from './dto/catalog.dto';

@ApiTags('Danh mục - Module 1')
@ApiBearerAuth()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  // ---------- Môn học ----------

  @Get('subjects')
  @Roles('ADMIN', 'LECTURER')
  @ApiOperation({ summary: 'Danh sách môn học (chức năng 1.6)' })
  listSubjects(@Query() dto: PaginationDto) {
    return this.catalog.listSubjects(dto);
  }

  @Post('subjects')
  @Roles('ADMIN')
  createSubject(@Body() dto: CreateSubjectDto) {
    return this.catalog.createSubject(dto);
  }

  @Patch('subjects/:id')
  @Roles('ADMIN')
  updateSubject(@Param('id') id: string, @Body() dto: UpdateSubjectDto) {
    return this.catalog.updateSubject(id, dto);
  }

  @Delete('subjects/:id')
  @Roles('ADMIN')
  removeSubject(@Param('id') id: string) {
    return this.catalog.removeSubject(id);
  }

  // ---------- Chương ----------

  @Get('subjects/:subjectId/chapters')
  @Roles('ADMIN', 'LECTURER')
  listChapters(@Param('subjectId') subjectId: string) {
    return this.catalog.listChapters(subjectId);
  }

  @Post('subjects/:subjectId/chapters')
  @Roles('ADMIN', 'LECTURER')
  createChapter(@Param('subjectId') subjectId: string, @Body() dto: CreateChapterDto) {
    return this.catalog.createChapter(subjectId, dto);
  }

  @Patch('chapters/:id')
  @Roles('ADMIN', 'LECTURER')
  updateChapter(@Param('id') id: string, @Body() dto: UpdateChapterDto) {
    return this.catalog.updateChapter(id, dto);
  }

  @Get('subjects/:subjectId/inventory')
  @Roles('ADMIN', 'LECTURER')
  @ApiOperation({ summary: 'Số câu hỏi khả dụng theo chương và mức độ' })
  inventory(@Param('subjectId') subjectId: string) {
    return this.catalog.getQuestionInventory(subjectId);
  }

  // ---------- Lớp học phần ----------

  @Get('course-classes')
  @Roles('ADMIN', 'LECTURER')
  @ApiOperation({ summary: 'Danh sách lớp học phần (chức năng 1.7)' })
  listCourseClasses(@Query() query: ListCourseClassDto) {
    return this.catalog.listCourseClasses(query, query.lecturerId);
  }

  @Post('course-classes')
  @Roles('ADMIN')
  createCourseClass(@Body() dto: CreateCourseClassDto) {
    return this.catalog.createCourseClass(dto);
  }

  @Patch('course-classes/:id')
  @Roles('ADMIN')
  updateCourseClass(@Param('id') id: string, @Body() dto: UpdateCourseClassDto) {
    return this.catalog.updateCourseClass(id, dto);
  }

  // ---------- Gán sinh viên ----------

  @Post('course-classes/:id/enrollments')
  @Roles('ADMIN', 'LECTURER')
  @ApiOperation({ summary: 'Gán sinh viên vào lớp học phần (chức năng 1.8)' })
  enroll(@Param('id') id: string, @Body() dto: EnrollStudentsDto) {
    return this.catalog.enrollStudents(id, dto);
  }

  @Get('course-classes/:id/enrollments')
  @Roles('ADMIN', 'LECTURER')
  listEnrollments(@Param('id') id: string) {
    return this.catalog.listEnrollments(id);
  }

  @Delete('course-classes/:id/enrollments/:studentId')
  @Roles('ADMIN', 'LECTURER')
  removeEnrollment(@Param('id') id: string, @Param('studentId') studentId: string) {
    return this.catalog.removeEnrollment(id, studentId);
  }

  // ---------- Phòng máy ----------

  @Get('rooms')
  @Roles('ADMIN', 'LECTURER')
  listRooms() {
    return this.catalog.listRooms();
  }

  @Post('rooms')
  @Roles('ADMIN')
  createRoom(@Body() dto: CreateExamRoomDto) {
    return this.catalog.createRoom(dto);
  }

  @Post('rooms/:id/ip-rules')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Thêm dải IP cho phòng máy — chống thi hộ ở chế độ LAB' })
  addIpRule(@Param('id') id: string, @Body() dto: CreateRoomIpRuleDto) {
    return this.catalog.addIpRule(id, dto);
  }

  @Delete('ip-rules/:id')
  @Roles('ADMIN')
  removeIpRule(@Param('id') id: string) {
    return this.catalog.removeIpRule(id);
  }
}
