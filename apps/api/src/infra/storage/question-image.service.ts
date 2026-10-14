import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

import { ObjectStorageService } from './object-storage.service';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Map([
  ['png', 'image/png'],
  ['jpeg', 'image/jpeg'],
  ['jpg', 'image/jpeg'],
  ['webp', 'image/webp'],
]);

/**
 * Anh minh hoa cau hoi (chuc nang 2.5). Bucket public-read nen DB luu
 * full URL, frontend dung thang trong <img> khong can sua gi them.
 */
@Injectable()
export class QuestionImageService {
  constructor(private readonly storage: ObjectStorageService) {}

  async upload(
    questionId: string,
    buffer: Buffer,
    mimetype: string,
  ): Promise<{ imageUrl: string; width: number; height: number; sizeKb: number }> {
    if (buffer.length > MAX_BYTES) {
      throw new BadRequestException('Ảnh vượt quá 5MB');
    }

    // Sniff dinh dang that bang sharp, khong tin mimetype/extension client gui.
    let meta: sharp.Metadata;
    try {
      meta = await sharp(buffer).metadata();
    } catch {
      throw new BadRequestException('File không phải ảnh hợp lệ');
    }
    const format = (meta.format ?? '').toLowerCase();
    const contentType = ALLOWED.get(format);
    if (!contentType || !meta.width || !meta.height) {
      throw new BadRequestException('Chỉ chấp nhận ảnh PNG, JPEG hoặc WebP');
    }
    void mimetype;

    // Resize canh dai <= 1600px, strip EXIF (re-encode mac dinh loai metadata).
    const resized = sharp(buffer).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true });
    const out = await (format === 'png'
      ? resized.png().toBuffer()
      : format === 'webp'
        ? resized.webp({ quality: 85 }).toBuffer()
        : resized.jpeg({ quality: 85 }).toBuffer());

    const ext = format === 'jpeg' ? 'jpg' : format;
    const key = `questions/${questionId}/${randomUUID()}.${ext}`;
    await this.storage.put(this.storage.questionBucket, key, out, contentType);

    const final = await sharp(out).metadata();
    return {
      imageUrl: this.storage.publicUrl(this.storage.questionBucket, key),
      width: final.width ?? meta.width,
      height: final.height ?? meta.height,
      sizeKb: Math.round(out.length / 1024),
    };
  }

  /** Xoa object khi thay anh hoac xoa cau hoi. URL la tra ve tu upload(). */
  async removeByUrl(imageUrl: string): Promise<void> {
    const marker = `/${this.storage.questionBucket}/`;
    const i = imageUrl.indexOf(marker);
    if (i === -1) return;
    await this.storage.remove(this.storage.questionBucket, imageUrl.slice(i + marker.length));
  }
}
