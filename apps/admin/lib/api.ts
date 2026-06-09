export class ApiClientError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message)
  }
}

type ApiEnvelope<T> = { data: T; meta: unknown }

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isServer = typeof window === 'undefined'
  const base = isServer
    ? (process.env['WEB_INTERNAL_URL'] ?? process.env['NEXTAUTH_URL'] ?? 'http://localhost:3000')
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
