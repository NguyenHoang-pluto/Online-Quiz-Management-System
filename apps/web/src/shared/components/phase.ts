import type { ExamPhase } from '@eduexam/shared';

/**
 * Nhãn hiển thị cho giai đoạn đề thi.
 *
 * Tách riêng khỏi ExamStatus: trạng thái cho biết giảng viên đã bấm gì, còn
 * giai đoạn cho biết ca thi thực sự đang ở đâu so với đồng hồ. Một đề đã phát
 * hành có thể là "chưa tới giờ", "đang diễn ra", hoặc "hết giờ chưa chốt" —
 * ba tình huống cần xử lý khác hẳn nhau.
 */
export const PHASE: Record<
  ExamPhase,
  { text: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info'; hint: string }
> = {
  BAN_NHAP: {
    text: 'Bản nháp',
    tone: 'neutral',
    hint: 'Chưa phát hành, sinh viên không thấy',
  },
  SAP_DIEN_RA: {
    text: 'Sắp diễn ra',
    tone: 'info',
    hint: 'Đã phát hành, chưa tới giờ mở phòng',
  },
  DANG_DIEN_RA: {
    text: 'Đang thi',
    tone: 'success',
    hint: 'Sinh viên đang làm bài',
  },
  HET_GIO: {
    text: 'Hết giờ, chưa chốt',
    tone: 'warning',
    hint: 'Quá giờ đóng phòng, cần bấm chốt ca thi',
  },
  DA_DONG: {
    text: 'Đã đóng',
    tone: 'neutral',
    hint: 'Đã chốt, xem được kết quả',
  },
};
