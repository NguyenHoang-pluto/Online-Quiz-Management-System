import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ExcelJS from 'exceljs';
import sanitizeHtml from 'sanitize-html';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { QuestionImageService } from '../../infra/storage/question-image.service';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';
import type {
  CreateQuestionDto,
  UpdateQuestionDto,
  ListQuestionsDto,
  QuestionOptionDto,
} from './dto/question.dto';
import type { ConfirmImportDto, ImportPreviewResponseDto } from './dto/import-preview.dto';
import { parseQuestionWorkbook } from './importers/excel-parser';
import { parseQuestionMarkdown } from './importers/question-text-parser';
import { convertDocxToMarkdown } from './importers/word-converter';

/** Hình dạng dữ liệu trả cho giảng viên — CÓ isCorrect. */
const LECTURER_VIEW = {
  id: true,
  type: true,
  difficulty: true,
  status: true,
  content: true,
  imageUrl: true,
  explanation: true,
  defaultScore: true,
  createdAt: true,
  chapter: { select: { id: true, code: true, name: true } },
  subject: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, fullName: true } },
  options: {
    select: { id: true, label: true, content: true, isCorrect: true, orderIndex: true },
    orderBy: { orderIndex: 'asc' as const },
  },
} as const;

/**
 * MODULE 2 — Ngân hàng câu hỏi.
 * Phụ trách: Hứa Thế Dân
 */
@Injectable()
export class QuestionBankService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly images: QuestionImageService,
  ) {}

  /**
   * Nội dung câu hỏi do giảng viên nhập hoặc nhập từ Word sẽ được hiển thị cho
   * toàn bộ thí sinh. Không làm sạch thì một câu hỏi chứa thẻ script sẽ chạy
   * trên máy của cả phòng thi.
   *
   * Giữ lại ký hiệu LaTeX vì KaTeX xử lý riêng ở phía trình duyệt.
   */
  private clean(input: string): string {
    return sanitizeHtml(input, {
      allowedTags: ['b', 'i', 'em', 'strong', 'sub', 'sup', 'br', 'p', 'u'],
      allowedAttributes: {},
      disallowedTagsMode: 'escape',
    }).trim();
  }

  /**
   * Quy tắc số đáp án đúng theo từng loại câu hỏi.
   * Kiểm tra ở server, không tin vào validate phía trình duyệt.
   */
  private validateOptions(type: string, options: QuestionOptionDto[]) {
    const correct = options.filter((o) => o.isCorrect).length;

    if (options.length < 2) {
      throw new BadRequestException('Câu hỏi phải có tối thiểu 2 phương án');
    }
    if (correct === 0) {
      throw new BadRequestException('Phải chọn ít nhất 1 đáp án đúng');
    }

    if (type === 'SINGLE_CHOICE' && correct !== 1) {
      throw new BadRequestException('Câu 1 đáp án chỉ được có đúng 1 phương án đúng');
    }
    if (type === 'TRUE_FALSE') {
      if (options.length !== 2) {
        throw new BadRequestException('Câu đúng/sai phải có đúng 2 phương án');
      }
      if (correct !== 1) {
        throw new BadRequestException('Câu đúng/sai chỉ được có đúng 1 phương án đúng');
      }
    }
    if (type === 'MULTIPLE_CHOICE' && correct === options.length) {
      throw new BadRequestException('Câu nhiều đáp án không thể có tất cả phương án đều đúng');
    }
  }

  // ==================== CRUD ====================

  async list(pg: PaginationDto, filter: ListQuestionsDto) {
    const where: any = { status: filter.status ?? 'ACTIVE' };
    if (filter.subjectId) where.subjectId = filter.subjectId;
    if (filter.chapterId) where.chapterId = filter.chapterId;
    if (filter.difficulty) where.difficulty = filter.difficulty;
    if (filter.type) where.type = filter.type;
    // Chức năng 2.8 — tìm theo nội dung, kể cả chuỗi LaTeX
    if (pg.q) where.content = { contains: pg.q };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.question.findMany({
        where,
        select: LECTURER_VIEW,
        skip: pg.skip,
        take: pg.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.question.count({ where }),
    ]);
    return paginate(items, total, pg);
  }

  async findOne(id: string) {
    const q = await this.prisma.question.findUnique({ where: { id }, select: LECTURER_VIEW });
    if (!q) throw new NotFoundException('Không tìm thấy câu hỏi');
    return q;
  }

  async create(dto: CreateQuestionDto, authorId: string) {
    this.validateOptions(dto.type, dto.options);

    const chapter = await this.prisma.chapter.findUnique({ where: { id: dto.chapterId } });
    if (!chapter) throw new NotFoundException('Không tìm thấy chương');

    return this.prisma.question.create({
      data: {
        subjectId: chapter.subjectId,
        chapterId: chapter.id,
        type: dto.type,
        difficulty: dto.difficulty,
        content: this.clean(dto.content),
        imageUrl: dto.imageUrl,
        explanation: dto.explanation ? this.clean(dto.explanation) : undefined,
        defaultScore: dto.defaultScore ?? 1.0,
        createdById: authorId,
        options: {
          create: dto.options.map((o, i) => ({
            label: o.label,
            content: this.clean(o.content),
            isCorrect: o.isCorrect,
            orderIndex: i,
          })),
        },
      },
      select: LECTURER_VIEW,
    });
  }

  async update(id: string, dto: UpdateQuestionDto) {
    const existing = await this.prisma.question.findUnique({
      where: { id },
      include: { options: true, attemptQuestions: { take: 1 } },
    });
    if (!existing) throw new NotFoundException('Không tìm thấy câu hỏi');

    // Câu hỏi đã từng ra đề thì sửa sẽ làm sai lệch điểm đã chấm
    if (existing.attemptQuestions.length > 0) {
      throw new BadRequestException(
        'Câu hỏi đã được dùng trong bài thi nên không sửa được. ' +
          'Hãy vô hiệu hóa và soạn câu mới.',
      );
    }

    const type = dto.type ?? existing.type;
    if (dto.options) this.validateOptions(type, dto.options);

    return this.prisma.$transaction(async (tx) => {
      if (dto.options) {
        await tx.questionOption.deleteMany({ where: { questionId: id } });
      }
      return tx.question.update({
        where: { id },
        data: {
          type: dto.type,
          difficulty: dto.difficulty,
          chapterId: dto.chapterId,
          content: dto.content ? this.clean(dto.content) : undefined,
          imageUrl: dto.imageUrl,
          explanation: dto.explanation ? this.clean(dto.explanation) : undefined,
          defaultScore: dto.defaultScore,
          options: dto.options
            ? {
                create: dto.options.map((o, i) => ({
                  label: o.label,
                  content: this.clean(o.content),
                  isCorrect: o.isCorrect,
                  orderIndex: i,
                })),
              }
            : undefined,
        },
        select: LECTURER_VIEW,
      });
    });
  }

  /** Chức năng 2.9 — vô hiệu hóa thay vì xóa, để giữ lịch sử thi. */
  async setStatus(id: string, status: 'ACTIVE' | 'DISABLED') {
    await this.findOne(id);
    return this.prisma.question.update({
      where: { id },
      data: { status },
      select: LECTURER_VIEW,
    });
  }

  // ==================== ẢNH MINH HỌA (2.5) ====================

  async uploadImage(questionId: string, buffer: Buffer, mimetype: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: { id: true, imageUrl: true },
    });
    if (!question) throw new NotFoundException('Không tìm thấy câu hỏi');

    // Upload trước, xóa ảnh cũ sau: upload lỗi thì câu hỏi vẫn giữ ảnh cũ.
    const uploaded = await this.images.upload(questionId, buffer, mimetype);
    if (question.imageUrl) await this.images.removeByUrl(question.imageUrl);

    await this.prisma.question.update({
      where: { id: questionId },
      data: { imageUrl: uploaded.imageUrl },
    });
    return uploaded;
  }

  async removeImage(questionId: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: { id: true, imageUrl: true },
    });
    if (!question) throw new NotFoundException('Không tìm thấy câu hỏi');

    if (question.imageUrl) await this.images.removeByUrl(question.imageUrl);
    await this.prisma.question.update({
      where: { id: questionId },
      data: { imageUrl: null },
    });
  }

  // ==================== IMPORT ====================

  /**
   * Bước 1 của wizard import: đọc file, trả về từng dòng kèm lỗi của dòng đó.
   * Không ghi gì vào CSDL — giảng viên sửa/xác nhận ở bước sau.
   */
  async previewExcel(buffer: Buffer, subjectId: string): Promise<ImportPreviewResponseDto> {
    const chapters = await this.prisma.chapter.findMany({ where: { subjectId } });
    if (chapters.length === 0) {
      throw new BadRequestException('Môn học chưa khai báo chương nào');
    }

    const chapterByCode = new Map(chapters.map((c) => [c.code.toUpperCase(), c]));
    const { rows, errors } = await parseQuestionWorkbook(buffer, chapterByCode);

    return {
      source: 'EXCEL',
      subjectId,
      rows: rows.map((r) => ({ ...r, rowErrors: [] })),
      errors,
    };
  }

  /** Bước 1 của wizard import Word. Chương do người dùng chọn, áp cho cả file. */
  async previewWord(
    buffer: Buffer,
    subjectId: string,
    chapterId: string,
  ): Promise<ImportPreviewResponseDto> {
    const chapter = await this.prisma.chapter.findFirst({ where: { id: chapterId, subjectId } });
    if (!chapter) throw new NotFoundException('Chương không thuộc môn học này');

    const markdown = await convertDocxToMarkdown(
      buffer,
      this.config.getOrThrow<string>('pandoc.bin'),
      this.config.getOrThrow<number>('pandoc.timeoutMs'),
    );
    const { questions, errors } = parseQuestionMarkdown(markdown);

    return {
      source: 'WORD_PANDOC',
      subjectId,
      rows: questions.map((q) => ({
        rowIndex: q.line,
        rowErrors: [],
        chapterId,
        type: q.type,
        difficulty: q.difficulty,
        content: q.content,
        options: q.options,
      })),
      errors,
    };
  }

  /**
   * Bước 2: ghi các dòng giảng viên đã tick. Một dòng lỗi không làm hỏng cả lô —
   * đếm vào `failed` để người dùng biết còn thiếu câu nào.
   */
  async confirmImport(dto: ConfirmImportDto, authorId: string) {
    return this.persistRows(dto.items, authorId);
  }

  /**
   * Chức năng 2.7 — Import câu hỏi từ Excel.
   *
   * Cột: Mã chương | Mức độ | Loại | Nội dung | A | B | C | D | Đáp án đúng
   * Mức độ: DE / TB / KHO      Loại: 1DA / NDA / DS
   * Đáp án đúng: "B" hoặc "A,C" với câu nhiều đáp án
   */
  async importFromExcel(buffer: Buffer, subjectId: string, authorId: string) {
    const preview = await this.previewExcel(buffer, subjectId);
    const result = await this.persistRows(preview.rows, authorId);
    return this.finishImport('EXCEL', 'import-cau-hoi.xlsx', preview.errors, result, authorId);
  }

  /**
   * Chức năng 2.6 (mức "Nên có") — Import câu hỏi từ file Word qua Pandoc.
   *
   * Pandoc chuyển .docx sang Markdown kèm công thức LaTeX, sau đó phân tích
   * theo định dạng quy ước:
   *
   *     [DE] Nội dung câu hỏi có thể chứa $x^2$
   *     A. phương án 1
   *     *B. phương án đúng (dấu sao đứng trước)
   *     C. phương án 3
   *
   * Pandoc chạy với thời gian chờ giới hạn: file Word hỏng có thể làm
   * tiến trình treo vô hạn và chiếm hết tài nguyên máy chủ.
   */
  async importFromWord(buffer: Buffer, subjectId: string, chapterId: string, authorId: string) {
    const preview = await this.previewWord(buffer, subjectId, chapterId);
    const result = await this.persistRows(preview.rows, authorId);
    return this.finishImport('WORD_PANDOC', 'import-cau-hoi.docx', preview.errors, result, authorId);
  }

  /** Ghi từng dòng; một dòng lỗi không làm hỏng cả lô. */
  private async persistRows(rows: CreateQuestionDto[], authorId: string) {
    const errors: { row: number; message: string }[] = [];
    let created = 0;

    for (const [i, row] of rows.entries()) {
      try {
        await this.create(row, authorId);
        created++;
      } catch (e) {
        errors.push({ row: i + 1, message: (e as Error).message });
      }
    }

    return { created, failed: errors.length, errors };
  }

  /** Ghi lịch sử import rồi trả kết quả cho controller. */
  private async finishImport(
    source: 'EXCEL' | 'WORD_PANDOC',
    fileName: string,
    parseErrors: { row: number; message: string }[],
    result: { created: number; errors: { row: number; message: string }[] },
    authorId: string,
  ) {
    const errors = [...parseErrors, ...result.errors];

    await this.prisma.importJob.create({
      data: {
        source,
        status: result.created > 0 ? 'SUCCEEDED' : 'FAILED',
        fileName,
        totalRows: result.created + errors.length,
        successRows: result.created,
        failedRows: errors.length,
        errors: errors.length ? (errors as never) : undefined,
        createdById: authorId,
        finishedAt: new Date(),
      },
    });

    return { created: result.created, failed: errors.length, errors };
  }

  /** File Excel mẫu cho việc nhập câu hỏi. */
  async buildQuestionTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Câu hỏi');
    ws.columns = [
      { header: 'Mã chương', key: 'ch', width: 14 },
      { header: 'Mức độ (DE/TB/KHO)', key: 'd', width: 20 },
      { header: 'Loại (1DA/NDA/DS)', key: 't', width: 20 },
      { header: 'Nội dung', key: 'c', width: 50 },
      { header: 'A', key: 'a', width: 20 },
      { header: 'B', key: 'b', width: 20 },
      { header: 'C', key: 'cc', width: 20 },
      { header: 'D', key: 'dd', width: 20 },
      { header: 'Đáp án đúng', key: 'k', width: 14 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.addRow({
      ch: 'CAL2-C03', d: 'TB', t: '1DA',
      c: 'Tính $\\int_0^1 x^2\\,dx$',
      a: '$\\frac{1}{2}$', b: '$\\frac{1}{3}$', cc: '$1$', dd: '$\\frac{1}{4}$',
      k: 'B',
    });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
