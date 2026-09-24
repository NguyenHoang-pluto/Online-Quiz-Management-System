import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

const SIGNAL_TYPES = [
  'TAB_BLUR',
  'WINDOW_BLUR',
  'PASTE',
  'HEARTBEAT_LOST',
  'IP_OUT_OF_RANGE',
  'FACE_ABSENT',
  'FACE_MULTIPLE',
  'FACE_AWAY',
  'CAMERA_BLOCKED',
] as const;

export class ProctoringEventDto {
  @ApiProperty({ enum: SIGNAL_TYPES })
  @IsEnum(SIGNAL_TYPES, { message: 'Loại tín hiệu không hợp lệ' })
  type!: (typeof SIGNAL_TYPES)[number];

  @ApiProperty({ example: '2026-11-25T02:15:30.000Z' })
  @IsDateString()
  occurredAt!: string;

  @ApiPropertyOptional({ example: 4200, description: 'Thời lượng sự kiện, mili giây' })
  @IsOptional()
  @IsInt()
  @Min(0)
  durationMs?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class ProctoringBatchDto {
  @ApiProperty({ type: [ProctoringEventDto], description: 'Sự kiện gom trong 5 giây' })
  @IsArray()
  @ArrayMaxSize(200, { message: 'Mỗi lô tối đa 200 sự kiện' })
  @ValidateNested({ each: true })
  @Type(() => ProctoringEventDto)
  events!: ProctoringEventDto[];

  @ApiPropertyOptional({ description: 'Giờ máy client, chỉ để đối chiếu lệch giờ' })
  @IsOptional()
  @IsDateString()
  clientTime?: string;
}

export class BroadcastWarningDto {
  @ApiProperty({ example: 'Vui lòng giữ tiêu điểm trên tab thi' })
  @IsString()
  message!: string;

  @ApiPropertyOptional({ description: 'Bỏ trống = gửi cho toàn bộ thí sinh của ca thi' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attemptIds?: string[];
}
