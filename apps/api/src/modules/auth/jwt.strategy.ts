import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

import { RedisService } from '../../infra/redis/redis.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

export interface JwtPayload {
  sub: string;
  code: string;
  role: AuthUser['role'];
  sid: string;
  jti: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret')!,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    // Token còn hạn nhưng đã bị thu hồi do người dùng bấm đăng xuất
    if (await this.redis.isTokenRevoked(payload.jti)) {
      throw new UnauthorizedException('Phiên đăng nhập đã kết thúc');
    }
    return {
      id: payload.sub,
      code: payload.code,
      role: payload.role,
      sessionId: payload.sid,
      // Bắt buộc phải trả jti ra đây, nếu không thì logout sẽ thu hồi nhầm khóa
      // và access token cũ vẫn dùng được cho tới khi hết hạn.
      jti: payload.jti,
    };
  }
}
