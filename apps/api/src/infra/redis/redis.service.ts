import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis dùng cho 4 việc:
 *   1. Heartbeat của từng lượt thi (key có TTL, hết TTL = mất kết nối)
 *   2. Danh sách token bị thu hồi khi đăng xuất
 *   3. Khóa phiên thi — chặn một tài khoản mở bài trên hai máy
 *   4. Adapter cho Socket.IO khi chạy nhiều tiến trình
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis({
      host: config.get<string>('redis.host'),
      port: config.get<number>('redis.port'),
      password: config.get<string>('redis.password'),
      maxRetriesPerRequest: null,
    });
    this.client.on('connect', () => this.logger.log('Đã kết nối Redis'));
    this.client.on('error', (e) => this.logger.error(`Lỗi Redis: ${e.message}`));
  }

  // ---------- Heartbeat ----------

  private heartbeatKey(attemptId: string) {
    return `hb:${attemptId}`;
  }

  /** Client ping mỗi 5s. TTL lấy theo ngưỡng trong hồ sơ chính sách. */
  async touchHeartbeat(attemptId: string, timeoutSeconds: number) {
    await this.client.set(this.heartbeatKey(attemptId), Date.now(), 'EX', timeoutSeconds);
  }

  async isAlive(attemptId: string): Promise<boolean> {
    return (await this.client.exists(this.heartbeatKey(attemptId))) === 1;
  }

  // ---------- Khóa phiên thi ----------

  private sessionKey(attemptId: string) {
    return `attempt:session:${attemptId}`;
  }

  /**
   * Trao quyền làm bài cho một phiên đăng nhập.
   *
   * Phiên mới LUÔN được chiếm quyền, không bao giờ từ chối. Lý do: sessionId
   * sinh mới mỗi lần đăng nhập, nên nếu từ chối thì sinh viên chỉ cần đăng xuất
   * rồi vào lại là mất quyền vào bài của chính mình cho tới hết ca thi — phạt
   * người trung thực nặng hơn người gian lận.
   *
   * Tính chất chống gian lận vẫn còn: chỉ một phiên giữ quyền tại một thời
   * điểm, phiên cũ lập tức bị chặn lưu đáp án. Hai thiết bị dùng song song sẽ
   * liên tục giành khoá của nhau, và số lần giành chính là dấu hiệu bất thường.
   *
   * @returns true nếu quyền vừa bị chuyển từ một phiên khác sang
   */
  async claimSession(
    attemptId: string,
    sessionId: string,
    ttlSeconds: number,
  ): Promise<{ tookOver: boolean }> {
    const key = this.sessionKey(attemptId);
    const previous = await this.client.get(key);
    await this.client.set(key, sessionId, 'EX', ttlSeconds);
    return { tookOver: previous !== null && previous !== sessionId };
  }

  /** Phiên này còn đang giữ quyền làm bài không. */
  async ownsSession(attemptId: string, sessionId: string): Promise<boolean> {
    const current = await this.client.get(this.sessionKey(attemptId));
    // Khoá hết hạn hoặc Redis vừa khởi động lại thì không chặn thí sinh:
    // cơ sở dữ liệu mới là nguồn sự thật cho quyền sở hữu bài thi.
    if (current === null) return true;
    return current === sessionId;
  }

  // ---------- Thu hồi token ----------

  async revokeToken(jti: string, ttlSeconds: number) {
    await this.client.set(`jwt:revoked:${jti}`, '1', 'EX', ttlSeconds);
  }

  async isTokenRevoked(jti: string): Promise<boolean> {
    return (await this.client.exists(`jwt:revoked:${jti}`)) === 1;
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
