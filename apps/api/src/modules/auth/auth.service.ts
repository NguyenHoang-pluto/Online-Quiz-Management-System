import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'node:crypto';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import type { JwtPayload } from './jwt.strategy';
import type { LoginDto } from './dto/login.dto';
import type { ChangePasswordDto } from './dto/change-password.dto';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; code: string; fullName: string; role: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  private sha256(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  /**
   * ConfigService trả về string | undefined, còn jsonwebtoken chỉ nhận
   * số giây hoặc chuỗi dạng "15m" / "7d". Thu hẹp kiểu đúng một chỗ ở đây.
   */
  private ttl(key: 'jwt.accessTtl' | 'jwt.refreshTtl'): JwtSignOptions['expiresIn'] {
    return this.config.getOrThrow<string>(key) as JwtSignOptions['expiresIn'];
  }

  /** Chức năng 1.1 — Đăng nhập JWT */
  async login(dto: LoginDto, meta: { ip?: string; userAgent?: string }): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { code: dto.code } });

    // Luôn trả cùng một thông báo dù sai mã hay sai mật khẩu,
    // tránh để lộ mã nào đang tồn tại trong hệ thống.
    const invalid = () => new UnauthorizedException('Mã đăng nhập hoặc mật khẩu không đúng');
    if (!user) throw invalid();
    if (!(await argon2.verify(user.passwordHash, dto.password))) throw invalid();
    if (user.status === 'LOCKED') {
      throw new UnauthorizedException('Tài khoản đã bị khóa, liên hệ quản trị viên');
    }

    const sessionId = randomUUID();
    const tokens = await this.issueTokens(user.id, user.code, user.role, sessionId);

    await this.prisma.$transaction([
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: this.sha256(tokens.refreshToken),
          userAgent: meta.userAgent?.slice(0, 500),
          ipAddress: meta.ip,
          expiresAt: this.refreshExpiry(),
        },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
    ]);

    return {
      ...tokens,
      user: { id: user.id, code: user.code, fullName: user.fullName, role: user.role },
    };
  }

  private async issueTokens(userId: string, code: string, role: string, sessionId: string) {
    const payload: JwtPayload = {
      sub: userId,
      code,
      role: role as JwtPayload['role'],
      sid: sessionId,
      jti: randomUUID(),
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      expiresIn: this.ttl('jwt.accessTtl'),
    });

    // jti bắt buộc phải có: nếu không, hai token sinh trong cùng một giây với
    // cùng payload sẽ giống hệt nhau, và tokenHash đụng khóa duy nhất.
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, sid: sessionId, jti: randomUUID() },
      {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
        expiresIn: this.ttl('jwt.refreshTtl'),
      },
    );

    return { accessToken, refreshToken };
  }

  private refreshExpiry(): Date {
    const days = parseInt(this.config.get<string>('jwt.refreshTtl')!.replace('d', ''), 10) || 7;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  /** Cấp lại access token khi hết hạn — chức năng 1.1 "tự động đăng xuất khi hết hạn" */
  async refresh(refreshToken: string): Promise<LoginResult> {
    let payload: { sub: string; sid: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.sha256(refreshToken) },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn');
    }

    // Xoay vòng refresh token: token cũ dùng một lần rồi thu hồi ngay.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.issueTokens(
      stored.user.id,
      stored.user.code,
      stored.user.role,
      payload.sid,
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: stored.user.id,
        tokenHash: this.sha256(tokens.refreshToken),
        expiresAt: this.refreshExpiry(),
      },
    });

    return {
      ...tokens,
      user: {
        id: stored.user.id,
        code: stored.user.code,
        fullName: stored.user.fullName,
        role: stored.user.role,
      },
    };
  }

  async logout(userId: string, jti: string, refreshToken?: string) {
    // Chặn access token còn hạn tiếp tục được dùng
    await this.redis.revokeToken(jti, 15 * 60);

    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: this.sha256(refreshToken), userId },
        data: { revokedAt: new Date() },
      });
    }
  }

  /** Chức năng 1.3 — Đổi mật khẩu cá nhân */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!(await argon2.verify(user.passwordHash, dto.currentPassword))) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu cũ');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await argon2.hash(dto.newPassword, { type: argon2.argon2id }) },
      }),
      // Đổi mật khẩu thì mọi thiết bị khác phải đăng nhập lại
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: 'Đổi mật khẩu thành công' };
  }
}
