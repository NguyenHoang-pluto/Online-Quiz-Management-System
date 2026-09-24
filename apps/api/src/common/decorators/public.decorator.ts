import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Mở endpoint cho người chưa đăng nhập. Dùng cho login, quên mật khẩu. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
