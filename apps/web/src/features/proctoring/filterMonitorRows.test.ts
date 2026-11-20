import { describe, expect, test } from 'vitest';
import type { MonitorRow } from '../../shared/types/api';
import { filterMonitorRows } from './filterMonitorRows';

const rows = [
  {
    attemptId: 'a1',
    studentCode: '3122410127',
    studentName: 'Nguyễn Văn A',
    state: 'DANH_DAU',
  },
  {
    attemptId: 'a2',
    studentCode: '3122410128',
    studentName: 'Trần Thị B',
    state: 'BINH_THUONG',
  },
] as MonitorRow[];

describe('filterMonitorRows', () => {
  test('filters by violation state', () => {
    expect(filterMonitorRows(rows, 'DANH_DAU', '').map((r) => r.attemptId)).toEqual(['a1']);
  });

  test('filters by code or name, ignoring case and surrounding spaces', () => {
    expect(filterMonitorRows(rows, '', '  TRAN THI  ').map((r) => r.attemptId)).toEqual(['a2']);
    expect(filterMonitorRows(rows, '', '3122410127').map((r) => r.attemptId)).toEqual(['a1']);
  });

  test('returns all rows when no filter is active', () => {
    expect(filterMonitorRows(rows, '', '')).toHaveLength(2);
  });
});
