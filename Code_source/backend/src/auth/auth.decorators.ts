import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { UserRole } from '../domain/enums';

export const IS_PUBLIC_KEY = 'jmp:isPublic';
export const ROLES_KEY = 'jmp:roles';

/** Marque une route accessible sans token (connexion uniquement). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Réserve la route à ces rôles, quelle que soit la méthode HTTP. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Utilisateur reconnecté, posé par JwtAuthGuard. */
export interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
