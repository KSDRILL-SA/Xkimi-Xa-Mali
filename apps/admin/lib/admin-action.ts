import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { logger } from '@xxm/observability'
import { auth } from '@/lib/auth'
import { adminActionRatelimit, adminBulkActionRatelimit } from '@/lib/rate-limit'

export interface AdminContext {
  userId: string
  roles: string[]
  /** Caller IP for the audit trail, or 'unknown' behind a proxy that hides it. */
  ip: string
}

export interface AdminActionOptions {
  /**
   * Mark actions that fan out across every member — generating contributions,
   * broadcasting. They get the far tighter bucket.
   */
  bulk?: boolean
}

/** First forwarded hop, matching how the member app derives a client IP. */
async function clientIp(): Promise<string> {
  const h = await headers()
  return (
    h.get('cf-connecting-ip') ??
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  )
}

/**
 * The gate every admin server action goes through.
 *
 * A server action is a public endpoint. It is reachable by anyone who can craft
 * the request, whether or not the page that renders the form was ever shown to
 * them, so each one has to establish who is calling on its own — nothing about
 * the surrounding render can be trusted.
 *
 * This does that once, in one place: confirms a session, confirms the ADMIN
 * role, throttles by admin identity, and hands back the context the action needs
 * for its audit entry. It replaces a four-line preamble that was copied into
 * twenty-four actions across nine files, where the cost of one of them drifting
 * was an unguarded mutation on the highest-privilege surface in the system.
 *
 * Declared in its own module on purpose: a `'use server'` function may not close
 * over a helper defined in the component body, because functions are not
 * serialisable as bound arguments. An imported one is fine.
 *
 * Refusals redirect rather than throw. Next replaces thrown server-error
 * messages with a generic string in production, so a throw would tell the admin
 * nothing about why their action did not run.
 */
export async function requireAdmin(
  action: string,
  options: AdminActionOptions = {},
): Promise<AdminContext> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const roles = (session.user.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) {
    logger.warn('Non-admin attempted an admin action', { action, userId: session.user.id })
    redirect('/forbidden')
  }

  const limiter = options.bulk ? adminBulkActionRatelimit : adminActionRatelimit
  const { success } = await limiter.limit(session.user.id)
  if (!success) {
    logger.warn('Admin action rate limited', {
      action,
      userId: session.user.id,
      bucket: options.bulk ? 'bulk' : 'default',
    })
    redirect('/too-many-requests')
  }

  return { userId: session.user.id, roles, ip: await clientIp() }
}
