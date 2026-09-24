import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: '3122410127', description: 'MSSV hoặc mã giảng viên' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập mã đăng nhập' })
  code!: string;

  @ApiProperty({ example: 'MatKhau@123' })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' })
  password!: string;
}
