import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

import { ObjectStorageService } from './object-storage.service';

/**
 * Anh bang chung vi pham (Module 5). Bucket private — chi API doc ra,
 * ke ca URL luu trong DB cung chi la key noi bo.
 *
 * Chu ky giu nguyen theo proctoring.service.ts dang goi.
 */
@Injectable()
export class EvidenceStorageService {
  constructor(private readonly storage: ObjectStorageService) {}

  private key(violationId: string) {
    return `evidence/${violationId}.jpg`;
  }

  /** Nen con 640px, tra ve key de luu vao Violation.evidenceUrl. */
  async save(violationId: string, file: Buffer): Promise<string> {
    const jpeg = await sharp(file).resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
    const key = this.key(violationId);
    await this.storage.put(this.storage.evidenceBucket, key, jpeg, 'image/jpeg');
    return key;
  }

  async read(violationId: string): Promise<Buffer | null> {
    return this.storage.get(this.storage.evidenceBucket, this.key(violationId));
  }

  async remove(violationId: string): Promise<void> {
    await this.storage.remove(this.storage.evidenceBucket, this.key(violationId));
  }
}
