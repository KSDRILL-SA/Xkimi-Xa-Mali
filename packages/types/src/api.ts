export type ApiResponse<T> = {
  data: T
  meta: {
    requestId: string
    timestamp: string
    pagination?: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
  }
}

export type ApiError = {
  error: {
    code: string
    message: string
    traceId: string
  }
}

export type PaginatedResult<T> = {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}
