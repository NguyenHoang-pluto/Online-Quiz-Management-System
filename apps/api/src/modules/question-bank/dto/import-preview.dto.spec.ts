import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ConfirmImportDto } from './import-preview.dto';

describe('ConfirmImportDto', () => {
  test('rejects more than 500 items', async () => {
    const dto = plainToInstance(ConfirmImportDto, {
      subjectId: 's1',
      items: Array.from({ length: 501 }, () => ({})),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  test('rejects an item missing chapterId', async () => {
    const dto = plainToInstance(ConfirmImportDto, {
      subjectId: 's1',
      items: [
        {
          type: 'SINGLE_CHOICE',
          difficulty: 'MEDIUM',
          content: 'Nội dung',
          options: [
            { label: 'A', content: 'a', isCorrect: true },
            { label: 'B', content: 'b', isCorrect: false },
          ],
        },
      ],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(JSON.stringify(errors[0])).toContain('chapterId');
  });

  test('accepts a well-formed single item', async () => {
    const dto = plainToInstance(ConfirmImportDto, {
      subjectId: 's1',
      chapterId: 'ch1',
      items: [
        {
          chapterId: 'ch1',
          type: 'SINGLE_CHOICE',
          difficulty: 'MEDIUM',
          content: 'Nội dung',
          options: [
            { label: 'A', content: 'a', isCorrect: true },
            { label: 'B', content: 'b', isCorrect: false },
          ],
        },
      ],
    });
    await expect(validate(dto)).resolves.toEqual([]);
  });
});
