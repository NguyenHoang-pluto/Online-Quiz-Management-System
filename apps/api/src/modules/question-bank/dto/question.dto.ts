import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class QuestionOptionDto {
  @ApiProperty({ example: 'A' })
  @IsString()
  @Length(1, 4)
  label!: string;

  @ApiProperty({ example: 'I = \\frac{1}{4}', description: 'Có thể chứa LaTeX' })
  @IsString()
  @Length(1, 5000)
  content!: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  isCorrect!: boolean;
}

export class CreateQuestionDto {
  @ApiProperty()
  @IsString()
  chapterId!: string;

  @ApiProperty({ enum: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'] })
  @IsEnum(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'])
  type!: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE';

  @ApiProperty({ enum: ['EASY', 'MEDIUM', 'HARD'] })
  @IsEnum(['EASY', 'MEDIUM', 'HARD'])
  difficulty!: 'EASY' | 'MEDIUM' | 'HARD';

  @ApiProperty({ example: 'Tính tích phân $\\int_0^1 x^2 dx$' })
  @IsString()
  @Length(1, 20000)
  content!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Lời giải; chỉ hiện khi đề cho phép xem đáp án' })
  @IsOptional()
  @IsString()
  explanation?: string;

  @ApiPropertyOptional({ example: 1.0 })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(100)
  defaultScore?: number;

  @ApiProperty({ type: [QuestionOptionDto] })
  @IsArray()
  @ArrayMinSize(2, { message: 'Câu hỏi phải có tối thiểu 2 phương án' })
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options!: QuestionOptionDto[];
}

export class UpdateQuestionDto extends PartialType(CreateQuestionDto) {}

/**
 * Ke thua PaginationDto: ValidationPipe co forbidNonWhitelisted nen moi @Query()
 * deu duoc kiem tra voi TOAN BO query string. Tach thanh hai DTO rieng se lam
 * tham so cua DTO nay bi coi la "thua" doi voi DTO kia.
 */
export class ListQuestionsDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chapterId?: string;

  @ApiPropertyOptional({ enum: ['EASY', 'MEDIUM', 'HARD'] })
  @IsOptional()
  @IsEnum(['EASY', 'MEDIUM', 'HARD'])
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';

  @ApiPropertyOptional({ enum: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'] })
  @IsOptional()
  @IsEnum(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'])
  type?: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE';

  @ApiPropertyOptional({ enum: ['ACTIVE', 'DISABLED'] })
  @IsOptional()
  @IsEnum(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';
}

export class ImportQuestionsDto {
  @ApiProperty({ description: 'Môn học đích' })
  @IsString()
  subjectId!: string;
}
