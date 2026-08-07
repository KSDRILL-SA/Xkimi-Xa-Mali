'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import {
  MAX_CONTENT_LENGTH,
  type SerializedMessage,
  type DailyLimit,
} from './message-types'

/**
 * Everything the message board does, separated from everything it draws.
 *
 * The board holds eleven pieces of state and six calls to the API. With all of
 * that inline the component was doing two jobs at once and could not be read as
 * either. Here the behaviour can be followed on its own — and, unlike a
 * component, exercised without rendering anything.
 */
export function useMessageBoard({
  initialItems,
  initialTotalPages,
  initialDailyLimit,
  currentUserId,
  isAdmin,
}: {
  initialItems: SerializedMessage[]
  initialTotalPages: number
  initialDailyLimit: DailyLimit
  currentUserId: string
  isAdmin: boolean
}) {
  const toast = useToast()
  const totalPages = initialTotalPages

  const [items, setItems] = useState(initialItems)
  const [page, setPage] = useState(1)
  const [dailyLimit, setDailyLimit] = useState(initialDailyLimit)
  const [content, setContent] = useState('')
  const [posting, setPosting] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const limitReached = !!dailyLimit && dailyLimit.used >= dailyLimit.limit

  async function handlePost() {
    const trimmed = content.trim()
    if (!trimmed || trimmed.length > MAX_CONTENT_LENGTH || posting) return

    setPosting(true)
    try {
      const message = await api.post<SerializedMessage>('/api/v1/community/messages', { content: trimmed })
      setItems((prev) => [message, ...prev])
      setDailyLimit((prev) => (prev ? { ...prev, used: prev.used + 1 } : prev))
      setContent('')
    } catch (err: unknown) {
      toast.error('Could not post message', (err as { message?: string }).message ?? 'Please try again.')
    } finally {
      setPosting(false)
    }
  }

  async function handleReply(parentId: string) {
    const trimmed = replyDraft.trim()
    if (!trimmed || trimmed.length > MAX_CONTENT_LENGTH || posting) return

    setPosting(true)
    try {
      const message = await api.post<SerializedMessage>('/api/v1/community/messages', { content: trimmed, replyToId: parentId })
      setItems((prev) => prev.map((m) => (m.id === parentId ? { ...m, replies: [...m.replies, message] } : m)))
      setDailyLimit((prev) => (prev ? { ...prev, used: prev.used + 1 } : prev))
      setReplyDraft('')
      setReplyingTo(null)
    } catch (err: unknown) {
      toast.error('Could not post reply', (err as { message?: string }).message ?? 'Please try again.')
    } finally {
      setPosting(false)
    }
  }

  async function handleEdit(messageId: string, parentId?: string) {
    const trimmed = editDraft.trim()
    if (!trimmed || trimmed.length > MAX_CONTENT_LENGTH || busyId) return

    setBusyId(messageId)
    try {
      const updated = await api.patch<SerializedMessage>(`/api/v1/community/messages/${messageId}`, { content: trimmed })
      setItems((prev) =>
        prev.map((m) => {
          if (m.id === messageId) return { ...m, content: updated.content, editedAt: updated.editedAt }
          if (parentId && m.id === parentId) {
            return { ...m, replies: m.replies.map((r) => (r.id === messageId ? { ...r, content: updated.content, editedAt: updated.editedAt } : r)) }
          }
          return m
        }),
      )
      setEditingId(null)
      setEditDraft('')
      toast.success('Message updated')
    } catch (err: unknown) {
      toast.error('Could not edit message', (err as { message?: string }).message ?? 'Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(messageId: string, isReply: boolean, parentId?: string) {
    setBusyId(messageId)
    try {
      await api.delete(`/api/v1/community/messages/${messageId}`)
      if (isReply && parentId) {
        setItems((prev) => prev.map((m) => (m.id === parentId ? { ...m, replies: m.replies.filter((r) => r.id !== messageId) } : m)))
      } else {
        setItems((prev) => prev.filter((m) => m.id !== messageId))
      }
      toast.success('Message deleted')
    } catch (err: unknown) {
      toast.error('Could not delete message', (err as { message?: string }).message ?? 'Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  async function handlePin(messageId: string, pin: boolean) {
    try {
      await api.patch(`/api/v1/admin/community/messages/${messageId}/pin`, { isPinned: pin })
      setItems((prev) =>
        prev
          .map((m) => (m.id === messageId ? { ...m, isPinned: pin } : m))
          .sort((a, b) => Number(b.isPinned) - Number(a.isPinned)),
      )
    } catch (err: unknown) {
      toast.error('Could not update pin', (err as { message?: string }).message ?? 'Please try again.')
    }
  }

  async function loadMore() {
    if (loadingMore || page >= totalPages) return
    setLoadingMore(true)
    try {
      const nextPage = page + 1
      const result = await api.get<{ items: SerializedMessage[]; dailyLimit: DailyLimit }>(
        `/api/v1/community/messages?page=${nextPage}&limit=20`,
      )
      setItems((prev) => [...prev, ...result.items])
      setPage(nextPage)
    } catch {
      toast.error('Could not load more messages')
    } finally {
      setLoadingMore(false)
    }
  }

  function startEdit(message: SerializedMessage) {
    setReplyingTo(null)
    setEditingId(message.id)
    setEditDraft(message.content)
  }

  function canDelete(message: SerializedMessage): boolean {
    return isAdmin || message.author.id === currentUserId
  }

  function canEdit(message: SerializedMessage): boolean {
    if (message.author.id !== currentUserId) return false
    return new Date() <= new Date(message.editableUntil)
  }

  return {
    items, page, totalPages, dailyLimit, limitReached,
    content, setContent, posting,
    loadingMore, loadMore,
    replyingTo, setReplyingTo, replyDraft, setReplyDraft,
    editingId, editDraft, setEditDraft, startEdit,
    busyId,
    handlePost, handleReply, handleEdit, handleDelete, handlePin,
    canEdit, canDelete,

    // Named for what the member is doing, so the view states an intent rather
    // than reaching in and resetting three pieces of state itself.
    startReply: (id: string | null) => {
      setReplyingTo(id)
      setReplyDraft('')
      setEditingId(null)
    },
    cancelEdit: () => {
      setEditingId(null)
      setEditDraft('')
    },
  }
}
