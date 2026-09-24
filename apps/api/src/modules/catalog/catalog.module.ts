import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

/**
 * MODULE 1 — Danh mục môn học, lớp học phần, phòng máy
 * Phụ trách: Trương Gia Huy
 */
@Module({
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
