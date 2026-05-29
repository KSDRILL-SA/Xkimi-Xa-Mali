'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Pagination } from './Pagination'

interface RouterPaginationProps {
  totalItems: number
  itemsPerPage: number
  currentPage: number
  baseUrl: string
  className?: string
}

export function RouterPagination({ totalItems, itemsPerPage, currentPage, baseUrl, className }: RouterPaginationProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(page))
    router.push(`${baseUrl}?${params.toString()}`)
  }

  return (
    <Pagination
      totalItems={totalItems}
      itemsPerPage={itemsPerPage}
      currentPage={currentPage}
      onPageChange={handlePageChange}
      className={className}
    />
  )
}
