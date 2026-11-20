/** Tỷ lệ bài đạt (≥ 5.0) đã làm tròn, dùng ở chú giải biểu đồ phổ điểm. */
export function passPercent(total: number, failed: number): number {
  if (total <= 0) return 0;
  return Math.round(((total - failed) / total) * 100);
}
