import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Role } from '@eduexam/shared';

export interface AuthUser {
  id: string;
  code: string;
  role: Role;
  /** Phiên đăng nhập — dùng để khóa một lượt thi vào đúng một phiên. */
  sessionId: string;
  /** Mã riêng của access token này — cần cho việc thu hồi khi đăng xuất. */
  jti: string;
}

/** Lấy người dùng đã đăng nhập: method(@CurrentUser() user: AuthUser) */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthUser;
    return data ? user?.[data] : user;
  },
);
