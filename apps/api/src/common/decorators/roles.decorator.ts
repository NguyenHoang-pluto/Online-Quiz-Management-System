import { SetMetadata } from '@nestjs/common';
import type { Role } from '@eduexam/shared';

export const ROLES_KEY = 'roles';

/** Giới hạn endpoint theo vai trò: @Roles('ADMIN', 'LECTURER') */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
