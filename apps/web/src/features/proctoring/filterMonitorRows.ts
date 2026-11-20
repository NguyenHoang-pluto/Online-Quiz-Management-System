import type { MonitorRow } from '../../shared/types/api';

/** Bỏ dấu để tìm "Tran Thi" vẫn khớp "Trần Thị". */
const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi-VN');

/** Dùng chung cho màn giám sát trực tiếp và tab báo cáo sau ca thi. */
export function filterMonitorRows(
  rows: MonitorRow[],
  state: MonitorRow['state'] | '',
  query: string,
): MonitorRow[] {
  const q = fold(query.trim());
  return rows.filter(
    (r) =>
      (!state || r.state === state) &&
      (!q || fold(`${r.studentCode} ${r.studentName}`).includes(q)),
  );
}
