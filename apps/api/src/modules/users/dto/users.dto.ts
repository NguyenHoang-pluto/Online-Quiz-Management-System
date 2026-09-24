import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateUserDto {
  @ApiProperty({ example: '3122410127', description: 'MSSV hoặc mã giảng viên' })
  @IsString()
  @Length(2, 32)
  code!: string;

  @ApiProperty({ example: 'hoang.nh@edu.vn' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email!: string;

  @ApiProperty({ example: 'Nguyễn Huy Hoàng' })
  @IsString()
  @Length(2, 160)
  fullName!: string;

  @ApiProperty({ enum: ['ADMIN', 'LECTURER', 'STUDENT'] })
  @IsEnum(['ADMIN', 'LECTURER', 'STUDENT'], { message: 'Vai trò không hợp lệ' })
  role!: 'ADMIN' | 'LECTURER' | 'STUDENT';

  @ApiPropertyOptional({ description: 'Bỏ trống sẽ dùng mật khẩu mặc định EduExam@123' })
  @IsOptional()
  @IsString()
  @Length(8, 72)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Mật khẩu phải có chữ hoa, chữ thường và số',
  })
  password?: string;
}

export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['password'] as const)) {}

export class ListUsersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['ADMIN', 'LECTURER', 'STUDENT'] })
  @IsOptional()
  @IsEnum(['ADMIN', 'LECTURER', 'STUDENT'])
  role?: 'ADMIN' | 'LECTURER' | 'STUDENT';

  @ApiPropertyOptional({ enum: ['ACTIVE', 'LOCKED'] })
  @IsOptional()
  @IsEnum(['ACTIVE', 'LOCKED'])
  status?: 'ACTIVE' | 'LOCKED';
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @Length(8, 72)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Mật khẩu phải có chữ hoa, chữ thường và số',
  })
  newPassword!: string;
}
