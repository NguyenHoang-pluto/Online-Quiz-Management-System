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

import { UsersService } from './users.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateUserDto, UpdateUserDto, ListUsersDto, ResetPasswordDto } from './dto/users.dto';

@ApiTags('Tài khoản - Module 1')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles('ADMIN', 'LECTURER')
  @ApiOperation({ summary: 'Danh sách tài khoản (chức năng 1.4)' })
  list(@Query() query: ListUsersDto) {
    return this.users.list(query, query);
  }

  @Get('student-template.xlsx')
  @Roles('ADMIN', 'LECTURER')
  @ApiOperation({ summary: 'Tải file Excel mẫu để import sinh viên' })
  async template(@Res() res: Response) {
    const buffer = await this.users.buildStudentTemplate();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="mau-danh-sach-sinh-vien.xlsx"',
    });
    res.send(buffer);
  }

  @Get(':id')
  @Roles('ADMIN', 'LECTURER')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Patch(':id/lock')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Khóa tài khoản và thu hồi mọi phiên đăng nhập' })
  lock(@Param('id') id: string) {
    return this.users.setStatus(id, 'LOCKED');
  }

  @Patch(':id/unlock')
  @Roles('ADMIN')
  unlock(@Param('id') id: string) {
    return this.users.setStatus(id, 'ACTIVE');
  }

  @Patch(':id/reset-password')
  @Roles('ADMIN')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(id, dto.newPassword);
  }

  @Post('import')
  @Roles('ADMIN', 'LECTURER')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: 'Import sinh viên từ Excel (chức năng 1.5)' })
  import(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') actorId: string,
  ) {
    if (!file) throw new BadRequestException('Chưa chọn file Excel');
    if (!/\.xlsx?$/i.test(file.originalname)) {
      throw new BadRequestException('Chỉ chấp nhận file .xlsx');
    }
    return this.users.importStudentsFromExcel(file.buffer, actorId);
  }
}
