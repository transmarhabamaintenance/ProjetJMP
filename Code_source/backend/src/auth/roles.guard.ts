import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { UserRole } from '../domain/enums';
import { AuthUser, IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (request.method === 'OPTIONS') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const user = request.user;
    if (!user) throw new UnauthorizedException('Authentification requise');

    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required?.length) {
      if (!required.includes(user.role)) {
        throw new ForbiddenException(`Accès réservé au rôle ${required.join(' ou ')}`);
      }
      return true;
    }

    // Par défaut : consulter et créer sont ouverts à tous les connectés,
    // modifier et supprimer exigent le rôle ADMIN.
    if (request.method !== 'GET' && request.method !== 'POST' && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Modifier ou supprimer est réservé à un administrateur');
    }
    return true;
  }
}
