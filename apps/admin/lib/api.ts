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
  opts: { adminUserId?: string } = {},
): Promise<InternalResult<T>> {
  const base   = WEB_BASE_URL
  const secret = process.env['ADMIN_API_SECRET']
  if (!secret) return { ok: false, status: 500, data: null, error: { message: 'ADMIN_API_SECRET not configured' } }

  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-admin-secret':    secret,
        'x-admin-timestamp': String(Date.now()),
        ...(opts.adminUserId && { 'x-admin-user-id': opts.adminUserId }),
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
