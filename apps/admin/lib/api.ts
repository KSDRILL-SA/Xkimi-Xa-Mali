import { WEB_BASE_URL } from './env'

export class ApiClientError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message)
  }
}

type ApiEnvelope<T> = { data: T; meta: unknown }

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isServer = typeof window === 'undefined'
  const base = isServer
    ? WEB_BASE_URL
    : ''

  const headers: Record<string, string> = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (isServer && process.env['ADMIN_API_SECRET']) {
    headers['x-admin-secret'] = process.env['ADMIN_API_SECRET']
  }

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const json = await res.json().catch(() => null)

  if (!res.ok) {
    const err = json?.error
    throw new ApiClientError(err?.code ?? 'SYS_004', err?.message ?? 'Request failed', res.status)
  }

  return (json as ApiEnvelope<T>).data
}

export const api = {
  get:    <T>(path: string)                   => request<T>('GET',    path),
  post:   <T>(path: string, body?: unknown)   => request<T>('POST',   path, body),
  patch:  <T>(path: string, body?: unknown)   => request<T>('PATCH',  path, body),
  delete: <T>(path: string)                   => request<T>('DELETE', path),
}

export type InternalResult<T> = {
  ok: boolean
  status: number
  data: T | null
  error?: { code?: string; message?: string }
}

/**
 * Server-to-server POST to the web app's trusted admin API. Adds the shared
 * secret, a request timestamp (required by the web's internal-request check),
 * and optionally the acting admin's user id. Centralises the wiring so server
 * actions don't hand-roll fetch + headers.
 */
export async function internalAdminPost<T = unknown>(
  path: string,
  body: unknown,
  opts: { adminUserId?: string; adminIp?: string } = {},
): Promise<InternalResult<T>> {
  return internalAdminRequest<T>('POST', path, body, opts)
}

/**
 * As {@link internalAdminPost}, for the verbs that are not POST.
 *
 * Some trusted routes model removal as DELETE with a body — the Founder badge
 * is one, because the reason for removing it has to travel with the request.
 */
export async function internalAdminRequest<T = unknown>(
  method: 'POST' | 'DELETE' | 'PATCH',
  path: string,
  body: unknown,
  opts: { adminUserId?: string; adminIp?: string } = {},
): Promise<InternalResult<T>> {
  const base   = WEB_BASE_URL
  const secret = process.env['ADMIN_API_SECRET']
  if (!secret) return { ok: false, status: 500, data: null, error: { message: 'ADMIN_API_SECRET not configured' } }

  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type':      'application/json',
        'x-admin-secret':    secret,
        'x-admin-timestamp': String(Date.now()),
        ...(opts.adminUserId && { 'x-admin-user-id': opts.adminUserId }),
        // Without this the web app records its caller's socket address, which
        // on a server-to-server hop is this app rather than the admin who
        // clicked. The audit trail promises "where", and our own infrastructure
        // is not an answer to that question.
        ...(opts.adminIp && { 'x-admin-ip': opts.adminIp }),
      },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null) as { data?: T; error?: { code?: string; message?: string } } | null
    if (!res.ok) return { ok: false, status: res.status, data: null, error: json?.error }
    return { ok: true, status: res.status, data: (json?.data ?? null) as T }
  } catch {
    return { ok: false, status: 0, data: null, error: { message: 'Network error' } }
  }
}
