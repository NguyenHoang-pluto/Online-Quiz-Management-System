import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class StartAttemptDto {
  @ApiProperty({ description: 'Đã đọc và đồng ý thể lệ thi (chức năng 4.2)' })
  @IsBoolean()
  acceptRules!: boolean;

  @ApiPropertyOptional({
    description: 'Đồng ý xử lý dữ liệu sinh trắc; bắt buộc khi thi từ xa',
  })
  @IsOptional()
  @IsBoolean()
  acceptBiometric?: boolean;

  @ApiPropertyOptional({ description: 'Mã máy trạm, dùng khi thi tại phòng máy' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  machineCode?: string;
}

export class SaveAnswerDto {
  @ApiProperty()
  @IsString()
  questionId!: string;

  @ApiProperty({ type: [String], description: 'Id phương án đã chọn; mảng rỗng = bỏ trống' })
  @IsArray()
  @IsString({ each: true })
  selectedOptionIds!: string[];

  @ApiPropertyOptional({ description: 'Đánh dấu xem lại (chức năng 4.5)' })
  @IsOptional()
  @IsBoolean()
  flagged?: boolean;
}

export class SubmitAttemptDto {
  @ApiPropertyOptional({
    description: 'Khóa chống nộp trùng khi mạng chập chờn; gửi lại cùng khóa là an toàn',
  })
  @IsOptional()
  @IsString()
  @Length(8, 64)
  idempotencyKey?: string;
}
