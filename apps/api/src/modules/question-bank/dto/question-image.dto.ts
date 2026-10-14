import { ApiProperty } from '@nestjs/swagger';

/** Ket qua upload anh minh hoa cau hoi (chuc nang 2.5). */
export class UploadQuestionImageResponseDto {
  @ApiProperty({ description: 'URL public, dung thang trong <img>' })
  imageUrl!: string;

  @ApiProperty()
  width!: number;

  @ApiProperty()
  height!: number;

  @ApiProperty({ description: 'Dung luong file sau khi nen (KB)' })
  sizeKb!: number;
}
