import type { NextRequest } from 'next/server'
import { clientIpFromHeaders } from '@xxm/utils/client-ip'

/**
 * The client's IP address, or undefined when it cannot be established from a
 * header the front door controls.
 *
 * The trust model — which forwarded-IP header is believable, and why believing
 * the wrong one silently disables rate limiting — lives in `@xxm/utils/client-ip`
 * so that this app, the admin app and the webhook routes all answer identically.
 */
export function getClientIP(req: NextRequest): string | undefined {
  return clientIpFromHeaders(req.headers)
}
