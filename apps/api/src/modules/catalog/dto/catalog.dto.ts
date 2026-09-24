import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Min, Max } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateSubjectDto {
  @ApiProperty({ example: 'MATH102' })
  @IsString()
  @Length(2, 32)
  code!: string;

  @ApiProperty({ example: 'Giải tích 2' })
  @IsString()
  @Length(2, 200)
  name!: string;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  @Max(20)
  credits!: number;
}
export class UpdateSubjectDto extends PartialType(CreateSubjectDto) {}

export class CreateChapterDto {
  @ApiProperty({ example: 'CAL2-C03' })
  @IsString()
  @Length(1, 32)
  code!: string;

  @ApiProperty({ example: 'Tích phân bội' })
  @IsString()
  @Length(2, 200)
  name!: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;
}
export class UpdateChapterDto extends PartialType(CreateChapterDto) {}

export class CreateCourseClassDto {
  @ApiProperty({ example: 'MATH102.N04' })
  @IsString()
  @Length(2, 32)
  code!: string;

  @ApiProperty({ example: 'Giải tích 2 - Nhóm 04' })
  @IsString()
  @Length(2, 200)
  name!: string;

  @ApiProperty()
  @IsString()
  subjectId!: string;

  @ApiProperty()
  @IsString()
  lecturerId!: string;

  @ApiProperty({ example: 'HK2 2024-2025' })
  @IsString()
  @Length(2, 32)
  semester!: string;

  @ApiPropertyOptional({ example: 70 })
  @IsOptional()
  @IsInt()
  @Min(0)
  capacity?: number;
}
export class UpdateCourseClassDto extends PartialType(CreateCourseClassDto) {}

export class EnrollStudentsDto {
  @ApiProperty({ type: [String], description: 'Danh sách MSSV' })
  @IsString({ each: true })
  studentCodes!: string[];
}

export class CreateExamRoomDto {
  @ApiProperty({ example: 'D9-301' })
  @IsString()
  @Length(2, 32)
  code!: string;

  @ApiProperty({ example: 'Phòng máy D9-301' })
  @IsString()
  @Length(2, 160)
  name!: string;

  @ApiPropertyOptional({ example: 'D9' })
  @IsOptional()
  @IsString()
  building?: string;

  @ApiPropertyOptional({ example: 70 })
  @IsOptional()
  @IsInt()
  @Min(0)
  seatCount?: number;
}

export class CreateRoomIpRuleDto {
  @ApiProperty({ example: '10.20.30.0/24', description: 'Dải IP dạng CIDR' })
  @IsString()
  @Length(7, 64)
  cidr!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

/** Loc lop hoc phan. Ke thua PaginationDto vi ValidationPipe kiem tra toan bo query. */
export class ListCourseClassDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Chi lay lop cua mot giang vien' })
  @IsOptional()
  @IsString()
  lecturerId?: string;
}
