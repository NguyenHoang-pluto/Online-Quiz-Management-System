import ExcelJS from 'exceljs';

import { parseQuestionWorkbook } from './excel-parser';

async function workbookBuffer(rows: string[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Câu hỏi');
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const HEADER = ['Mã chương', 'Mức độ', 'Loại', 'Nội dung', 'A', 'B', 'C', 'D', 'Đáp án đúng'];

describe('parseQuestionWorkbook', () => {
  test('one good row parses, one bad chapter code errors with the right row number', async () => {
    const buffer = await workbookBuffer([
      HEADER,
      ['CAL2-C03', 'TB', '1DA', 'Tính $1+1$', '1', '2', '3', '4', 'B'],
      ['XXXX', 'TB', '1DA', 'Câu sai chương', '1', '2', '3', '4', 'A'],
    ]);
    const { rows, errors } = await parseQuestionWorkbook(
      buffer,
      new Map([['CAL2-C03', { id: 'ch1' }]]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].chapterId).toBe('ch1');
    expect(rows[0].type).toBe('SINGLE_CHOICE');
    expect(rows[0].options.find((o) => o.label === 'B')?.isCorrect).toBe(true);
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(3);
    expect(errors[0].message).toContain('XXXX');
  });

  test('a TRUE_FALSE row with 4 options errors on the option rule', async () => {
    const buffer = await workbookBuffer([
      HEADER,
      ['CAL2-C03', 'TB', 'DS', 'Đúng hay sai?', 'Đúng', 'Sai', 'Maybe', 'Unknown', 'A'],
    ]);
    const { rows, errors } = await parseQuestionWorkbook(
      buffer,
      new Map([['CAL2-C03', { id: 'ch1' }]]),
    );
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(2);
  });
});
