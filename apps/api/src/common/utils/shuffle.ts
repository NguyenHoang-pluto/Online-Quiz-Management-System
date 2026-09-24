import { randomInt } from 'node:crypto';

/**
 * Trộn mảng theo thuật toán Fisher-Yates, dùng nguồn ngẫu nhiên của crypto.
 *
 * Không dùng Math.random() vì nó có thể đoán trước được. Với hệ thống thi,
 * nếu sinh viên đoán được thứ tự trộn thì việc trộn đề mất hết ý nghĩa.
 *
 * Hàm trả về mảng mới, không sửa mảng gốc.
 */
export function shuffle<T>(input: readonly T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Lấy ngẫu nhiên n phần tử. Nếu mảng ngắn hơn n thì trả về toàn bộ đã trộn. */
export function sample<T>(input: readonly T[], n: number): T[] {
  return shuffle(input).slice(0, n);
}
