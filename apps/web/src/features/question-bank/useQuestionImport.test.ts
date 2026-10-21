import { describe, expect, test } from 'vitest';
import { revalidateRow } from './useQuestionImport';

describe('revalidateRow', () => {
  test('rejects a multiple-choice row whose every option is correct', () => {
    const errors = revalidateRow({
      type: 'MULTIPLE_CHOICE',
      content: 'Chọn đáp án đúng',
      options: [
        { label: 'A', content: '1', isCorrect: true },
        { label: 'B', content: '2', isCorrect: true },
        { label: 'C', content: '3', isCorrect: true },
        { label: 'D', content: '4', isCorrect: true },
      ],
    } as never);

    expect(errors).toContain('Câu nhiều đáp án không thể có tất cả đều đúng');
  });
});
