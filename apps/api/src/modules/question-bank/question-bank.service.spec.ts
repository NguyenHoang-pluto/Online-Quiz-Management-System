import { BadRequestException, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';

import { QuestionBankService } from './question-bank.service';

// sanitize-html keo theo htmlparser2 ban ESM, Jest (CJS) khong parse duoc.
// Spec nay kiem tra luu tru/import, khong kiem tra lam sach HTML.
jest.mock('sanitize-html', () => ({ __esModule: true, default: (s: string) => s }));

jest.mock('./importers/word-converter', () => ({
  convertDocxToMarkdown: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { convertDocxToMarkdown } from './importers/word-converter';

const mockedConvert = convertDocxToMarkdown as jest.Mock;

const HEADER = ['Mã chương', 'Mức độ', 'Loại', 'Nội dung', 'A', 'B', 'C', 'D', 'Đáp án đúng'];

function makeService() {
  const prisma = {
    question: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    chapter: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
    importJob: { create: jest.fn().mockResolvedValue({}) },
  };
  const images = {
    upload: jest.fn(),
    removeByUrl: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    getOrThrow: jest.fn((key: string) => (key === 'pandoc.bin' ? 'pandoc' : 30_000)),
  };
  const service = new QuestionBankService(prisma as never, config as never, images as never);
  return { service, prisma, images };
}

async function workbookBuffer(rows: string[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Câu hỏi');
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('QuestionBankService.uploadImage', () => {
  test('stores the new URL and deletes the replaced object', async () => {
    const { service, prisma, images } = makeService();
    prisma.question.findUnique.mockResolvedValue({ id: 'q1', imageUrl: 'http://x/old.jpg' });
    images.upload.mockResolvedValue({
      imageUrl: 'http://x/new.jpg',
      width: 2,
      height: 2,
      sizeKb: 1,
    });

    const result = await service.uploadImage('q1', Buffer.from('img'), 'image/png');

    expect(images.upload).toHaveBeenCalledWith('q1', expect.any(Buffer), 'image/png');
    expect(images.removeByUrl).toHaveBeenCalledWith('http://x/old.jpg');
    expect(prisma.question.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'q1' }, data: { imageUrl: 'http://x/new.jpg' } }),
    );
    expect(result.imageUrl).toBe('http://x/new.jpg');
  });

  test('refuses an unknown question before touching storage', async () => {
    const { service, prisma, images } = makeService();
    prisma.question.findUnique.mockResolvedValue(null);

    await expect(
      service.uploadImage('nope', Buffer.from('img'), 'image/png'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(images.upload).not.toHaveBeenCalled();
  });
});

describe('QuestionBankService.removeImage', () => {
  test('deletes the stored object and clears the column', async () => {
    const { service, prisma, images } = makeService();
    prisma.question.findUnique.mockResolvedValue({ id: 'q1', imageUrl: 'http://x/old.jpg' });

    await service.removeImage('q1');

    expect(images.removeByUrl).toHaveBeenCalledWith('http://x/old.jpg');
    expect(prisma.question.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'q1' }, data: { imageUrl: null } }),
    );
  });
});

describe('QuestionBankService preview', () => {
  test('previewExcel maps chapter codes and keeps sheet row numbers, writing nothing', async () => {
    const { service, prisma } = makeService();
    prisma.chapter.findMany.mockResolvedValue([{ id: 'ch1', code: 'CAL2-C03' }]);
    const buffer = await workbookBuffer([
      HEADER,
      ['CAL2-C03', 'TB', '1DA', 'Tính $1+1$', '1', '2', '3', '4', 'B'],
    ]);

    const preview = await service.previewExcel(buffer, 's1');

    expect(preview.source).toBe('EXCEL');
    expect(preview.rows).toEqual([
      expect.objectContaining({
        rowIndex: 2,
        chapterId: 'ch1',
        rowErrors: [],
        type: 'SINGLE_CHOICE',
      }),
    ]);
    expect(preview.errors).toEqual([]);
    expect(prisma.question.create).not.toHaveBeenCalled();
  });

  test('previewExcel turns an unreadable file into a 400, not a 500', async () => {
    const { service, prisma } = makeService();
    prisma.chapter.findMany.mockResolvedValue([{ id: 'ch1', code: 'CAL2-C03' }]);

    await expect(service.previewExcel(Buffer.from('not an xlsx'), 's1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  test('previewWord maps every question to the chosen chapter and its source line', async () => {
    const { service, prisma } = makeService();
    prisma.chapter.findFirst.mockResolvedValue({ id: 'ch1' });
    mockedConvert.mockResolvedValue('[TB] Câu một\nA. 1\n*B. 2\n\n[DE] Câu hai\nA. 3\n*B. 4');

    const preview = await service.previewWord(Buffer.from('docx'), 's1', 'ch1');

    expect(preview.source).toBe('WORD_PANDOC');
    expect(preview.rows.map((r) => r.rowIndex)).toEqual([1, 5]);
    expect(preview.rows.every((r) => r.chapterId === 'ch1')).toBe(true);
  });
});

describe('QuestionBankService.confirmImport', () => {
  test('creates every item and counts failures instead of aborting', async () => {
    const { service } = makeService();
    const create = jest
      .spyOn(service, 'create')
      .mockResolvedValueOnce({ id: 'q1' } as never)
      .mockRejectedValueOnce(new Error('bad row'));

    const result = await service.confirmImport(
      { subjectId: 's1', items: [{ chapterId: 'ch1' }, { chapterId: 'ch1' }] } as never,
      'u1',
    );

    expect(create).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ created: 1, failed: 1 });
  });
});
