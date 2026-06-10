// Typed client-side fetch wrapper. All UI API calls route through here. [FRONTEND-F05]

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

type ApiEnvelope<T> = { data: T; meta: unknown }

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })

  const json = await res.json().catch(() => null)

  if (!res.ok) {
    const err = json?.error
    throw new ApiClientError(err?.code ?? 'SYS_004', err?.message ?? 'Request failed', res.status, err?.details)
  }

  return (json as ApiEnvelope<T>).data
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}
