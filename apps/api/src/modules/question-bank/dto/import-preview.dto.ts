import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

import { CreateQuestionDto } from './question.dto';

export class PreviewOptionDto {
  @ApiProperty()
  @IsString()
  label!: string;

  @ApiProperty()
  @IsString()
  content!: string;

  @ApiProperty()
  isCorrect!: boolean;
}

/** Mot dong xem truoc: cau hoi nhu se duoc tao + loi cua dong do (neu co). */
export class PreviewQuestionDto extends CreateQuestionDto {
  @ApiProperty({ description: 'So dong trong file goc (tinh tu 1, ke ca dong tieu de)' })
  @IsInt()
  @Min(1)
  rowIndex!: number;

  @ApiProperty({ type: [String] })
  @IsArray()
  rowErrors!: string[];
}

export class PreviewRowErrorDto {
  @ApiProperty()
  @IsInt()
  row!: number;

  @ApiProperty()
  @IsString()
  message!: string;
}

export class ImportPreviewResponseDto {
  @ApiProperty({ type: [PreviewQuestionDto] })
  rows!: PreviewQuestionDto[];

  @ApiProperty({ type: [PreviewRowErrorDto] })
  errors!: PreviewRowErrorDto[];

  @ApiProperty()
  @IsString()
  subjectId!: string;

  @ApiProperty({ enum: ['EXCEL', 'WORD_PANDOC'] })
  @IsEnum(['EXCEL', 'WORD_PANDOC'])
  source!: 'EXCEL' | 'WORD_PANDOC';
}

/** Xac nhan import: chi gui cac dong sach da duoc duyet o buoc preview. */
export class ConfirmImportDto {
  @ApiProperty({ description: 'Môn học đích' })
  @IsString()
  subjectId!: string;

  @ApiPropertyOptional({ description: 'Chương chung cho import Word' })
  @IsOptional()
  @IsString()
  chapterId?: string;

  @ApiProperty({ type: [CreateQuestionDto] })
  @IsArray()
  @ArrayMaxSize(500, { message: 'Mỗi lần xác nhận tối đa 500 câu' })
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  items!: CreateQuestionDto[];
}

export class ImportJobDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  source!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  fileName!: string;

  @ApiProperty()
  totalRows!: number;

  @ApiProperty()
  successRows!: number;

  @ApiProperty()
  failedRows!: number;

  @ApiProperty()
  createdAt!: Date;
}
