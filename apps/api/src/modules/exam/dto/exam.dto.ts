import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';

export class MatrixItemDto {
  @ApiProperty()
  @IsString()
  chapterId!: string;

  @ApiProperty({ enum: ['EASY', 'MEDIUM', 'HARD'] })
  @IsEnum(['EASY', 'MEDIUM', 'HARD'])
  difficulty!: 'EASY' | 'MEDIUM' | 'HARD';

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  @Max(200)
  quantity!: number;
}

export class CreateExamDto {
  @ApiProperty({ example: 'Thi giữa kỳ Giải tích 2 - Nhóm 04' })
  @IsString()
  @Length(3, 255)
  title!: string;

  @ApiProperty()
  @IsString()
  courseClassId!: string;

  @ApiProperty({ example: 60, description: 'Thời lượng làm bài, phút' })
  @IsInt()
  @Min(1)
  @Max(600)
  durationMinutes!: number;

  @ApiProperty({ example: '2026-11-25T01:00:00.000Z' })
  @IsDateString()
  openAt!: string;

  @ApiProperty({ example: '2026-11-25T04:30:00.000Z' })
  @IsDateString()
  closeAt!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  shuffleQuestions?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  shuffleOptions?: boolean;

  @ApiPropertyOptional({ enum: ['NONE', 'SCORE_ONLY', 'WITH_ANSWERS'], default: 'SCORE_ONLY' })
  @IsOptional()
  @IsEnum(['NONE', 'SCORE_ONLY', 'WITH_ANSWERS'])
  resultDisplay?: 'NONE' | 'SCORE_ONLY' | 'WITH_ANSWERS';

  @ApiPropertyOptional({ example: 10, description: 'Tổng điểm quy đổi' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  totalScore?: number;

  @ApiPropertyOptional({
    default: true,
    description: 'Câu nhiều đáp án: true = đúng hết mới có điểm, false = tính điểm từng phần',
  })
  @IsOptional()
  @IsBoolean()
  strictMultipleChoice?: boolean;

  @ApiPropertyOptional({ enum: ['LAB', 'REMOTE'], default: 'LAB' })
  @IsOptional()
  @IsEnum(['LAB', 'REMOTE'])
  proctoringMode?: 'LAB' | 'REMOTE';

  @ApiPropertyOptional({ description: 'Bỏ trống sẽ dùng hồ sơ chuẩn theo hình thức thi' })
  @IsOptional()
  @IsString()
  policyId?: string;

  @ApiPropertyOptional({ description: 'Bắt buộc khi thi tại phòng máy' })
  @IsOptional()
  @IsString()
  roomId?: string;
}

export class UpdateExamDto extends PartialType(CreateExamDto) {}

export class SetMatrixDto {
  @ApiProperty({ type: [MatrixItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Ma trận đề phải có ít nhất 1 dòng' })
  @ValidateNested({ each: true })
  @Type(() => MatrixItemDto)
  items!: MatrixItemDto[];
}

export class ProctoringThresholdsDto {
  @ApiProperty({ example: 3000 })
  @IsInt()
  @Min(0)
  blurMs!: number;

  @ApiProperty({ example: 30 })
  @IsInt()
  @Min(5)
  heartbeatTimeoutS!: number;

  @ApiProperty({ example: 10000 })
  @IsInt()
  @Min(0)
  faceAbsentMs!: number;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  @Max(50)
  maxViolations!: number;
}

export class UpdatePolicyDto {
  @ApiPropertyOptional({ enum: ['LAB', 'REMOTE'] })
  @IsOptional()
  @IsEnum(['LAB', 'REMOTE'])
  proctoringMode?: 'LAB' | 'REMOTE';

  @ApiPropertyOptional({ type: ProctoringThresholdsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProctoringThresholdsDto)
  thresholds?: ProctoringThresholdsDto;

  @ApiPropertyOptional({ enum: ['WARN', 'FLAG', 'AUTO_SUBMIT'] })
  @IsOptional()
  @IsEnum(['WARN', 'FLAG', 'AUTO_SUBMIT'])
  actionOnExceed?: 'WARN' | 'FLAG' | 'AUTO_SUBMIT';

  @ApiPropertyOptional({ type: [String], description: 'Dải IP cho phép, chỉ dùng ở chế độ LAB' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedCidrs?: string[];
}
