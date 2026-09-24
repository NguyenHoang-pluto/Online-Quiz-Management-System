import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Giới hạn tần suất có phân biệt ngữ cảnh.
 *
 * Với endpoint đăng nhập, đếm theo MÃ TÀI KHOẢN chứ không theo địa chỉ IP.
 *
 * Lý do: cả phòng máy đi ra Internet qua một địa chỉ NAT duy nhất. Đếm theo IP
 * thì 8 giờ sáng, năm sinh viên đầu tiên đăng nhập xong là cả phòng 65 người
 * bị khóa. Đếm theo tài khoản vẫn chặn được dò mật khẩu — kẻ tấn công nhắm vào
 * một tài khoản cụ thể — mà không làm hỏng ca thi.
 */
@Injectable()
export class SmartThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const url: string = req.originalUrl ?? req.url ?? '';
    const code = req.body?.code;

    if (url.includes('/auth/login') && typeof code === 'string' && code.length > 0) {
      return `login:${code.toLowerCase()}`;
    }
    return req.ips?.length ? req.ips[0] : (req.ip ?? 'unknown');
  }
}
