import { ForbiddenError } from './errors'

export const ROLES = {
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const

export type RoleName = (typeof ROLES)[keyof typeof ROLES]

export function hasRole(roles: string[], role: RoleName): boolean {
  return roles.includes(role)
}

export function isAdmin(roles: string[]): boolean {
  return hasRole(roles, ROLES.ADMIN)
}

export function assertAdmin(roles: string[]): void {
  if (!isAdmin(roles)) {
    throw new ForbiddenError('Admin access required')
  }
}

export function assertCanAccess(
  targetUserId: string,
  requesterId: string,
  requesterRoles: string[],
): void {
  if (targetUserId !== requesterId && !isAdmin(requesterRoles)) {
    throw new ForbiddenError('Access denied')
  }
}

export function assertNotSelf(
  actorId: string,
  targetId: string,
  action: string,
): void {
  if (actorId === targetId) {
    throw new ForbiddenError(`Cannot ${action} your own account`)
  }
}
