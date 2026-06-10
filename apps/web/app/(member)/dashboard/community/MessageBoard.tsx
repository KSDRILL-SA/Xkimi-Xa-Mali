'use client'

import { useState } from 'react'
import type { BadgeTier } from '@prisma/client'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { BADGE_TIER_CONFIG } from '@/lib/badge-tier'
import { Pin, PinOff, Trash2, Reply as ReplyIcon, Send, MessageSquare } from 'lucide-react'

type SerializedMessage = {
  id: string
  content: string
  isPinned: boolean
  editableUntil: string
  createdAt: string
  author: {
    id: string
    firstName: string
    lastName: string
    badge: BadgeTier
  }
  replies: SerializedMessage[]
}

type DailyLimit = { used: number; limit: number } | null

const MAX_CONTENT_LENGTH = 500

function formatRelative(iso: string): string {
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)

  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`

  return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function MessageBoard({
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
  const [items, setItems] = useState(initialItems)
  const [page, setPage] = useState(1)
  const totalPages = initialTotalPages
  const [dailyLimit, setDailyLimit] = useState(initialDailyLimit)
  const [content, setContent] = useState('')
  const [posting, setPosting] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)

  const limitReached = !!dailyLimit && dailyLimit.used >= dailyLimit.limit

  async function handlePost(e: React.FormEvent, replyToId?: string) {
    e.preventDefault()
    const trimmed = content.trim()
    if (!trimmed || trimmed.length > MAX_CONTENT_LENGTH || posting) return

    setPosting(true)
    try {
      const message = await api.post<SerializedMessage>('/api/v1/community/messages', {
        content: trimmed,
        ...(replyToId && { replyToId }),
      })

      if (replyToId) {
        setItems((prev) => prev.map((m) => (m.id === replyToId ? { ...m, replies: [...m.replies, message] } : m)))
        setReplyingTo(null)
      } else {
        setItems((prev) => [message, ...prev])
      }

      setDailyLimit((prev) => (prev ? { ...prev, used: prev.used + 1 } : prev))
      setContent('')
    } catch (err: unknown) {
      const e2 = err as { message?: string }
      toast.error('Could not post message', e2.message ?? 'Please try again.')
    } finally {
      setPosting(false)
    }
  }

  async function handleDelete(messageId: string, isReply: boolean, parentId?: string) {
    try {
      await api.delete(`/api/v1/community/messages/${messageId}`)
      if (isReply && parentId) {
        setItems((prev) => prev.map((m) => (m.id === parentId ? { ...m, replies: m.replies.filter((r) => r.id !== messageId) } : m)))
      } else {
        setItems((prev) => prev.filter((m) => m.id !== messageId))
      }
      toast.success('Message deleted')
    } catch (err: unknown) {
      const e2 = err as { message?: string }
      toast.error('Could not delete message', e2.message ?? 'Please try again.')
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
      const e2 = err as { message?: string }
      toast.error('Could not update pin', e2.message ?? 'Please try again.')
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

  function canDelete(message: SerializedMessage): boolean {
    if (isAdmin) return true
    if (message.author.id !== currentUserId) return false
    return new Date() <= new Date(message.editableUntil)
  }

  return (
    <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm overflow-hidden flex flex-col">

      {/* ── Post form ─────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-xxm-gray-100 bg-xxm-green-50/30">
        <form onSubmit={(e) => handlePost(e)} className="space-y-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={MAX_CONTENT_LENGTH}
            rows={2}
            disabled={limitReached || posting}
            placeholder={limitReached ? "You've reached today's message limit" : 'Share something with the community…'}
            className="w-full rounded-xl border border-xxm-gray-200 px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-xxm-green/25 disabled:opacity-60 disabled:bg-xxm-gray-50"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {dailyLimit && (
                <span className={`text-[11px] font-semibold ${limitReached ? 'text-red-500' : 'text-xxm-gray-400'}`}>
                  {dailyLimit.used}/{dailyLimit.limit} messages today
                </span>
              )}
              <span className="text-[11px] text-xxm-gray-300">{content.length}/{MAX_CONTENT_LENGTH}</span>
            </div>
            <Button type="submit" size="sm" disabled={!content.trim() || limitReached} loading={posting}>
              <Send size={13} className="mr-1.5" aria-hidden />
              Post
            </Button>
          </div>
        </form>
      </div>

      {/* ── Message list ──────────────────────────────────── */}
      {items.length === 0 ? (
        <div className="p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-xxm-green-50 flex items-center justify-center mx-auto mb-4">
            <MessageSquare size={24} className="text-xxm-green/40" aria-hidden />
          </div>
          <p className="text-xxm-gray-600 font-semibold">No messages yet</p>
          <p className="text-xxm-gray-400 text-xs mt-1.5">Be the first to start the conversation.</p>
        </div>
      ) : (
        <div className="divide-y divide-xxm-gray-50">
          {items.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              canDelete={canDelete}
              isAdmin={isAdmin}
              onDelete={handleDelete}
              onPin={handlePin}
              replyingTo={replyingTo}
              setReplyingTo={setReplyingTo}
              replyContent={content}
              setReplyContent={setContent}
              onReplySubmit={handlePost}
              posting={posting}
              limitReached={limitReached}
            />
          ))}
        </div>
      )}

      {/* ── Load more ─────────────────────────────────────── */}
      {page < totalPages && (
        <div className="px-5 py-3 border-t border-xxm-gray-100 text-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="text-sm font-semibold text-xxm-green hover:text-xxm-canopy transition-colors disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load older messages'}
          </button>
        </div>
      )}
    </div>
  )
}

function MessageItem({
  message,
  canDelete,
  isAdmin,
  onDelete,
  onPin,
  replyingTo,
  setReplyingTo,
  replyContent,
  setReplyContent,
  onReplySubmit,
  posting,
  limitReached,
  isReply = false,
  parentId,
}: {
  message: SerializedMessage
  canDelete: (m: SerializedMessage) => boolean
  isAdmin: boolean
  onDelete: (messageId: string, isReply: boolean, parentId?: string) => void
  onPin: (messageId: string, pin: boolean) => void
  replyingTo: string | null
  setReplyingTo: (id: string | null) => void
  replyContent: string
  setReplyContent: (v: string) => void
  onReplySubmit: (e: React.FormEvent, replyToId?: string) => void
  posting: boolean
  limitReached: boolean
  isReply?: boolean
  parentId?: string
}) {
  const cfg = BADGE_TIER_CONFIG[message.author.badge]
  const Icon = cfg.icon

  return (
    <div className={`px-5 py-4 ${isReply ? 'bg-xxm-green-50/20' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-xl ${cfg.iconBg} flex items-center justify-center shrink-0`}>
          <Icon size={14} className={cfg.iconColor} aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-xxm-green-900">{message.author.firstName} {message.author.lastName}</p>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.badgeClass}`}>
              {cfg.label}
            </span>
            {message.isPinned && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-xxm-gold-dark">
                <Pin size={10} aria-hidden /> Pinned
              </span>
            )}
            <span className="text-[11px] text-xxm-gray-400 ml-auto shrink-0">{formatRelative(message.createdAt)}</span>
          </div>
          <p className="text-sm text-xxm-gray-700 mt-1 whitespace-pre-wrap break-words">{message.content}</p>

          <div className="flex items-center gap-3 mt-2">
            {!isReply && (
              <button
                onClick={() => setReplyingTo(replyingTo === message.id ? null : message.id)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-xxm-green hover:text-xxm-canopy transition-colors"
              >
                <ReplyIcon size={11} aria-hidden /> Reply
              </button>
            )}
            {canDelete(message) && (
              <button
                onClick={() => onDelete(message.id, isReply, parentId)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-500 hover:text-red-700 transition-colors"
              >
                <Trash2 size={11} aria-hidden /> Delete
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => onPin(message.id, !message.isPinned)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-xxm-gray-400 hover:text-xxm-gold-dark transition-colors"
              >
                {message.isPinned ? <PinOff size={11} aria-hidden /> : <Pin size={11} aria-hidden />}
                {message.isPinned ? 'Unpin' : 'Pin'}
              </button>
            )}
          </div>

          {replyingTo === message.id && (
            <form onSubmit={(e) => onReplySubmit(e, message.id)} className="mt-3 space-y-2">
              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                maxLength={MAX_CONTENT_LENGTH}
                rows={2}
                disabled={limitReached || posting}
                placeholder="Write a reply…"
                autoFocus
                className="w-full rounded-xl border border-xxm-gray-200 px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-xxm-green/25 disabled:opacity-60"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setReplyingTo(null); setReplyContent('') }}
                  className="text-xs font-semibold text-xxm-gray-400 hover:text-xxm-gray-600 transition-colors px-2"
                >
                  Cancel
                </button>
                <Button type="submit" size="sm" disabled={!replyContent.trim() || limitReached} loading={posting}>
                  Reply
                </Button>
              </div>
            </form>
          )}

          {message.replies.length > 0 && (
            <div className="mt-3 space-y-3 border-l-2 border-xxm-green/10 pl-3">
              {message.replies.map((reply) => (
                <MessageItem
                  key={reply.id}
                  message={reply}
                  canDelete={canDelete}
                  isAdmin={isAdmin}
                  onDelete={onDelete}
                  onPin={onPin}
                  replyingTo={replyingTo}
                  setReplyingTo={setReplyingTo}
                  replyContent={replyContent}
                  setReplyContent={setReplyContent}
                  onReplySubmit={onReplySubmit}
                  posting={posting}
                  limitReached={limitReached}
                  isReply
                  parentId={message.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
