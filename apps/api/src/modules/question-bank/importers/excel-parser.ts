import ExcelJS from 'exceljs';

import type { ParsedDifficulty, ParsedType, RowError } from './question-text-parser';
import type { ParsedOption } from './question-text-parser';
import { validateParsedOptions } from './question-text-parser';

export interface ExcelParsedRow {
  chapterId: string;
  type: ParsedType;
  difficulty: ParsedDifficulty;
  content: string;
  options: ParsedOption[];
}

/**
 * Doc sheet Excel theo mau tai ve san. Thuan tuy (khong DB):
 * nhan map chuong do service nap san, tra rows + errors, KHONG ghi DB.
 *
 * Cot: Ma chuong | Muc do | Loai | Noi dung | A | B | C | D | Dap an dung
 * Muc do: DE / TB / KHO      Loai: 1DA / NDA / DS
 * Dap an dung: "B" hoac "A,C" voi cau nhieu dap an
 */
export async function parseQuestionWorkbook(
  buffer: Buffer,
  chapterByCode: Map<string, { id: string }>,
): Promise<{ rows: ExcelParsedRow[]; errors: RowError[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error('File Excel không có sheet nào');

  const DIFF: Record<string, ParsedDifficulty> = {
    DE: 'EASY', EASY: 'EASY',
    TB: 'MEDIUM', MEDIUM: 'MEDIUM',
    KHO: 'HARD', HARD: 'HARD',
  };
  const TYPE: Record<string, ParsedType> = {
    '1DA': 'SINGLE_CHOICE', SINGLE: 'SINGLE_CHOICE',
    NDA: 'MULTIPLE_CHOICE', MULTIPLE: 'MULTIPLE_CHOICE',
    DS: 'TRUE_FALSE', TRUEFALSE: 'TRUE_FALSE',
  };

  const errors: RowError[] = [];
  const rows: ExcelParsedRow[] = [];

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

    const ruleError = validateParsedOptions(type, options);
    if (ruleError) return void errors.push({ row: n, message: ruleError });

    rows.push({ chapterId: chapter.id, type, difficulty, content, options });
  });

  return { rows, errors };
}
