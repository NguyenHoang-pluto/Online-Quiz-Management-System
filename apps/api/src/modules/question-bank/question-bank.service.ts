import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ExcelJS from 'exceljs';
import sanitizeHtml from 'sanitize-html';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';
import type {
  CreateQuestionDto,
  UpdateQuestionDto,
  ListQuestionsDto,
  QuestionOptionDto,
} from './dto/question.dto';

const execFileAsync = promisify(execFile);

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
  private readonly logger = new Logger(QuestionBankService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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

  // ==================== IMPORT ====================

  /**
   * Chức năng 2.7 — Import câu hỏi từ Excel.
   *
   * Cột: Mã chương | Mức độ | Loại | Nội dung | A | B | C | D | Đáp án đúng
   * Mức độ: DE / TB / KHO      Loại: 1DA / NDA / DS
   * Đáp án đúng: "B" hoặc "A,C" với câu nhiều đáp án
   */
  async importFromExcel(buffer: Buffer, subjectId: string, authorId: string) {
    const chapters = await this.prisma.chapter.findMany({ where: { subjectId } });
    if (chapters.length === 0) {
      throw new BadRequestException('Môn học chưa khai báo chương nào');
    }
    const chapterByCode = new Map(chapters.map((c) => [c.code.toUpperCase(), c]));

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const sheet = wb.worksheets[0];
    if (!sheet) throw new BadRequestException('File Excel không có sheet nào');

    const DIFF: Record<string, 'EASY' | 'MEDIUM' | 'HARD'> = {
      DE: 'EASY', EASY: 'EASY',
      TB: 'MEDIUM', MEDIUM: 'MEDIUM',
      KHO: 'HARD', HARD: 'HARD',
    };
    const TYPE: Record<string, 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE'> = {
      '1DA': 'SINGLE_CHOICE', SINGLE: 'SINGLE_CHOICE',
      NDA: 'MULTIPLE_CHOICE', MULTIPLE: 'MULTIPLE_CHOICE',
      DS: 'TRUE_FALSE', TRUEFALSE: 'TRUE_FALSE',
    };

    const errors: { row: number; message: string }[] = [];
    const parsed: (CreateQuestionDto & { subjectId: string })[] = [];

    sheet.eachRow((row, n) => {
      if (n === 1) return;
      const cell = (i: number) => String(row.getCell(i).value ?? '').trim();

      const chapterCode = cell(1).toUpperCase();
      if (!chapterCode) return;

      const chapter = chapterByCode.get(chapterCode);
      if (!chapter) return void errors.push({ row: n, message: `Không có chương ${chapterCode}` });

      const difficulty = DIFF[cell(2).toUpperCase()];
      if (!difficulty) return void errors.push({ row: n, message: `Mức độ sai: ${cell(2)}` });

      const type = TYPE[cell(3).toUpperCase().replace(/[\s-]/g, '')];
      if (!type) return void errors.push({ row: n, message: `Loại câu hỏi sai: ${cell(3)}` });

      const content = cell(4);
      if (!content) return void errors.push({ row: n, message: 'Thiếu nội dung câu hỏi' });

      const labels = ['A', 'B', 'C', 'D'];
      const answers = cell(9).toUpperCase().split(/[,;\s]+/).filter(Boolean);
      if (answers.length === 0) return void errors.push({ row: n, message: 'Thiếu đáp án đúng' });

      const options = labels
        .map((label, i) => ({ label, content: cell(5 + i), isCorrect: answers.includes(label) }))
        .filter((o) => o.content !== '');

      if (options.length < 2) {
        return void errors.push({ row: n, message: 'Phải có tối thiểu 2 phương án' });
      }
      if (!options.some((o) => o.isCorrect)) {
        return void errors.push({ row: n, message: `Đáp án "${cell(9)}" không khớp phương án nào` });
      }

      try {
        this.validateOptions(type, options);
      } catch (e: any) {
        return void errors.push({ row: n, message: e.message });
      }

      parsed.push({ subjectId, chapterId: chapter.id, type, difficulty, content, options });
    });

    let created = 0;
    for (const q of parsed) {
      try {
        await this.create(q, authorId);
        created++;
      } catch (e: any) {
        errors.push({ row: 0, message: `Lỗi lưu câu hỏi: ${e.message}` });
      }
    }

    await this.prisma.importJob.create({
      data: {
        source: 'EXCEL',
        status: created > 0 ? 'SUCCEEDED' : 'FAILED',
        fileName: 'import-cau-hoi.xlsx',
        totalRows: parsed.length + errors.length,
        successRows: created,
        failedRows: errors.length,
        errors: errors.length ? (errors as any) : undefined,
        createdById: authorId,
        finishedAt: new Date(),
      },
    });

    return { created, failed: errors.length, errors };
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
    const chapter = await this.prisma.chapter.findFirst({ where: { id: chapterId, subjectId } });
    if (!chapter) throw new NotFoundException('Chương không thuộc môn học này');

    const dir = await mkdtemp(join(tmpdir(), 'eduexam-pandoc-'));
    const docxPath = join(dir, 'input.docx');
    await writeFile(docxPath, buffer);

    let markdown: string;
    try {
      const { stdout } = await execFileAsync(
        this.config.getOrThrow<string>('pandoc.bin'),
        [docxPath, '-f', 'docx', '-t', 'markdown', '--wrap=none'],
        {
          timeout: this.config.getOrThrow<number>('pandoc.timeoutMs'),
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      markdown = stdout;
    } catch (e: any) {
      this.logger.error(`Pandoc lỗi: ${e.message}`);
      throw new BadRequestException(
        e.code === 'ENOENT'
          ? 'Chưa cài Pandoc trên máy chủ. Xem hướng dẫn trong README.'
          : `Không đọc được file Word: ${e.message}`,
      );
    } finally {
      await unlink(docxPath).catch(() => undefined);
    }

    const { questions, errors } = this.parseQuestionText(markdown);

    let created = 0;
    for (const q of questions) {
      try {
        await this.create({ ...q, chapterId }, authorId);
        created++;
      } catch (e: any) {
        errors.push({ row: 0, message: e.message });
      }
    }

    await this.prisma.importJob.create({
      data: {
        source: 'WORD_PANDOC',
        status: created > 0 ? 'SUCCEEDED' : 'FAILED',
        fileName: 'import-cau-hoi.docx',
        totalRows: questions.length + errors.length,
        successRows: created,
        failedRows: errors.length,
        errors: errors.length ? (errors as any) : undefined,
        createdById: authorId,
        finishedAt: new Date(),
      },
    });

    return { created, failed: errors.length, errors };
  }

  /** Bóc tách câu hỏi từ văn bản thuần theo định dạng quy ước. */
  parseQuestionText(text: string) {
    const DIFF: Record<string, 'EASY' | 'MEDIUM' | 'HARD'> = {
      DE: 'EASY', TB: 'MEDIUM', KHO: 'HARD',
    };
    const questions: Omit<CreateQuestionDto, 'chapterId'>[] = [];
    const errors: { row: number; message: string }[] = [];

    const lines = text.split(/\r?\n/);
    let current: { difficulty: 'EASY' | 'MEDIUM' | 'HARD'; content: string; line: number } | null =
      null;
    let options: QuestionOptionDto[] = [];

    const flush = () => {
      if (!current) return;
      const correct = options.filter((o) => o.isCorrect).length;
      if (options.length < 2) {
        errors.push({ row: current.line, message: 'Câu hỏi có ít hơn 2 phương án' });
      } else if (correct === 0) {
        errors.push({ row: current.line, message: 'Không có phương án nào đánh dấu * là đúng' });
      } else {
        questions.push({
          type: correct > 1 ? 'MULTIPLE_CHOICE' : 'SINGLE_CHOICE',
          difficulty: current.difficulty,
          content: current.content,
          options,
        });
      }
      current = null;
      options = [];
    };

    lines.forEach((raw, i) => {
      const line = raw.replace(/\\$/, '').trim();
      if (!line) return;

      const head = line.match(/^\[(DE|TB|KHO)\]\s*(.+)$/i);
      if (head) {
        flush();
        current = {
          difficulty: DIFF[head[1].toUpperCase()],
          content: head[2].trim(),
          line: i + 1,
        };
        return;
      }

      const opt = line.match(/^(\*?)\s*([A-H])[.)]\s*(.+)$/);
      if (opt && current) {
        options.push({ label: opt[2], content: opt[3].trim(), isCorrect: opt[1] === '*' });
        return;
      }

      // Dòng tiếp nối nội dung câu hỏi
      if (current && options.length === 0) {
        current.content += ' ' + line;
      }
    });
    flush();

    return { questions, errors };
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
