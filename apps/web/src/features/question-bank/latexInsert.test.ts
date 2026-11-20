import { describe, expect, test } from 'vitest';
import { insertLatex, STRUCTURED_TEMPLATES } from './latexInsert';

describe('insertLatex', () => {
  test('inserts a snippet at the caret and returns the new caret position', () => {
    expect(insertLatex('Tính $x^2$', 7, '\\sqrt{a}')).toEqual({
      value: 'Tính $x\\sqrt{a}^2$',
      cursor: 15,
    });
  });

  test('appends when no caret was recorded', () => {
    expect(insertLatex('ABC', null, '\\frac{1}{2}')).toEqual({
      value: 'ABC\\frac{1}{2}',
      cursor: 14,
    });
  });
});

describe('STRUCTURED_TEMPLATES', () => {
  test('exposes fraction, radical, power, subscript and matrix builders', () => {
    expect(STRUCTURED_TEMPLATES.map((t) => t.label)).toEqual([
      'Phân số',
      'Căn',
      'Luỹ thừa',
      'Chỉ số dưới',
      'Ma trận',
    ]);
  });
});
