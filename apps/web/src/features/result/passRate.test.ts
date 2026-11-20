import { describe, expect, test } from 'vitest';
import { passPercent } from './passRate';

describe('passPercent', () => {
  test('returns 0 when no exam has been graded', () => {
    expect(passPercent(0, 0)).toBe(0);
  });

  test('returns the percentage of students at or above the pass mark', () => {
    expect(passPercent(8, 3)).toBe(63);
  });

  test('returns 100 when nobody failed', () => {
    expect(passPercent(4, 0)).toBe(100);
  });
});
