import { Module } from '@nestjs/common';

import { EvidenceStorageService } from './evidence-storage.service';
import { ObjectStorageService } from './object-storage.service';
import { QuestionImageService } from './question-image.service';

/** Ha tang luu tru MinIO/S3: cau hoi (public) + bang chung (private). */
@Module({
  providers: [ObjectStorageService, EvidenceStorageService, QuestionImageService],
  exports: [ObjectStorageService, EvidenceStorageService, QuestionImageService],
})
export class StorageModule {}
