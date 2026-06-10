'use client'

import { useEffect, useRef, useState } from 'react'
import type { BadgeTier } from '@prisma/client'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { BADGE_TIER_CONFIG } from '@/lib/badge-tier'
import {
  Pin, PinOff, Trash2, Reply as ReplyIcon, Send, MessageSquare,
  Smile, Pencil,
} from 'lucide-react'

type SerializedMessage = {
  id: string
  content: string
  isPinned: boolean
  editableUntil: string
  editedAt: string | null
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

const EMOJIS = [
  '😀', '😂', '🙂', '😉', '😍', '😎', '🤝', '👍',
  '👏', '🙏', '💪', '🔥', '💯', '✅', '🎉', '🥳',
  '💰', '💵', '📈', '🏆', '⭐', '❤️', '🙌', '👊',
  '🤞', '😇', '😅', '😢', '🤔', '👀', '💡', '📌',
  '🚀', '🌟', '💚', '🫡', '😤', '🥹', '🫶', '👋',
]

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}

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

// ─── Emoji picker popover ─────────────────────────────────────────────────────

function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-xxm-gray-400 hover:text-xxm-gold-dark hover:bg-xxm-gold/10 transition-colors"
        aria-label="Add emoji"
      >
        <Smile size={17} aria-hidden />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 z-30 w-64 rounded-2xl border border-xxm-gray-100 bg-white shadow-xxm-lg p-2.5 animate-scale-in origin-bottom-left">
          <div className="grid grid-cols-8 gap-0.5">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => { onPick(emoji); setOpen(false) }}
                className="w-7 h-7 rounded-lg text-lg leading-none flex items-center justify-center hover:bg-xxm-green-50 transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Reusable composer (new message, reply, edit) ─────────────────────────────

function Composer({
  value, onChange, onSubmit, onCancel,
  placeholder, disabled, submitLabel, loading, autoFocus, footerLeft,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onCancel?: () => void
  placeholder: string
  disabled?: boolean
  submitLabel: string
  loading?: boolean
  autoFocus?: boolean
  footerLeft?: React.ReactNode
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)

  function insertEmoji(emoji: string) {
    const ta = taRef.current
    if (!ta) { onChange(value + emoji); return }
    const start = ta.selectionStart ?? value.length
    const end = ta.selectionEnd ?? value.length
    const next = value.slice(0, start) + emoji + value.slice(end)
    if (next.length > MAX_CONTENT_LENGTH) return
    onChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      const caret = start + emoji.length
      ta.setSelectionRange(caret, caret)
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="rounded-2xl border border-xxm-gray-200 bg-white focus-within:border-xxm-green/40 focus-within:ring-2 focus-within:ring-xxm-green/15 transition-all">
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={MAX_CONTENT_LENGTH}
        rows={2}
        disabled={disabled}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full bg-transparent px-4 pt-3 pb-1.5 text-sm text-xxm-gray-800 placeholder:text-xxm-gray-400 resize-none focus:outline-none disabled:opacity-60"
      />
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
        <div className="flex items-center gap-1.5">
          <EmojiPicker onPick={insertEmoji} />
          {footerLeft}
        </div>
        <div className="flex items-center gap-2.5">
          <span className={`text-[11px] tabular-nums ${value.length > MAX_CONTENT_LENGTH - 50 ? 'text-amber-500 font-semibold' : 'text-xxm-gray-300'}`}>
            {value.length}/{MAX_CONTENT_LENGTH}
          </span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs font-semibold text-xxm-gray-400 hover:text-xxm-gray-600 transition-colors px-1.5"
            >
              Cancel
            </button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={onSubmit}
            disabled={!value.trim() || disabled}
            loading={loading}
          >
            <Send size={13} className="mr-1.5" aria-hidden />
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
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

  return (
    <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm overflow-hidden flex flex-col">

      {/* ── Composer ───────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-xxm-gray-100 bg-gradient-to-br from-xxm-green-50/60 to-transparent">
        {limitReached ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 font-medium text-center">
            You&rsquo;ve reached today&rsquo;s message limit. Come back tomorrow to keep the conversation going.
          </div>
        ) : (
          <Composer
            value={content}
            onChange={setContent}
            onSubmit={handlePost}
            placeholder="Share something with the brotherhood…"
            disabled={posting}
            submitLabel="Post"
            loading={posting}
            footerLeft={
              dailyLimit && (
                <span className="text-[11px] font-semibold text-xxm-gray-400">
                  {dailyLimit.used}/{dailyLimit.limit} today
                </span>
              )
            }
          />
        )}
      </div>

      {/* ── Message list ───────────────────────────────────── */}
      {items.length === 0 ? (
        <div className="p-14 text-center">
          <div className="w-16 h-16 rounded-3xl bg-xxm-green-50 flex items-center justify-center mx-auto mb-4">
            <MessageSquare size={26} className="text-xxm-green/40" aria-hidden />
          </div>
          <p className="text-xxm-green-900 font-bold">No messages yet</p>
          <p className="text-xxm-gray-400 text-sm mt-1.5">Be the first to start the conversation.</p>
        </div>
      ) : (
        <div className="divide-y divide-xxm-gray-50">
          {items.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              canEdit={canEdit}
              canDelete={canDelete}
              busyId={busyId}
              onDelete={handleDelete}
              onPin={handlePin}
              replyingTo={replyingTo}
              setReplyingTo={(id) => { setReplyingTo(id); setReplyDraft(''); setEditingId(null) }}
              replyDraft={replyDraft}
              setReplyDraft={setReplyDraft}
              onReplySubmit={handleReply}
              editingId={editingId}
              startEdit={startEdit}
              cancelEdit={() => { setEditingId(null); setEditDraft('') }}
              editDraft={editDraft}
              setEditDraft={setEditDraft}
              onEditSubmit={handleEdit}
              posting={posting}
              limitReached={limitReached}
            />
          ))}
        </div>
      )}

      {/* ── Load more ──────────────────────────────────────── */}
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
  currentUserId,
  isAdmin,
  canEdit,
  canDelete,
  busyId,
  onDelete,
  onPin,
  replyingTo,
  setReplyingTo,
  replyDraft,
  setReplyDraft,
  onReplySubmit,
  editingId,
  startEdit,
  cancelEdit,
  editDraft,
  setEditDraft,
  onEditSubmit,
  posting,
  limitReached,
  isReply = false,
  parentId,
}: {
  message: SerializedMessage
  currentUserId: string
  isAdmin: boolean
  canEdit: (m: SerializedMessage) => boolean
  canDelete: (m: SerializedMessage) => boolean
  busyId: string | null
  onDelete: (messageId: string, isReply: boolean, parentId?: string) => void
  onPin: (messageId: string, pin: boolean) => void
  replyingTo: string | null
  setReplyingTo: (id: string | null) => void
  replyDraft: string
  setReplyDraft: (v: string) => void
  onReplySubmit: (parentId: string) => void
  editingId: string | null
  startEdit: (m: SerializedMessage) => void
  cancelEdit: () => void
  editDraft: string
  setEditDraft: (v: string) => void
  onEditSubmit: (messageId: string, parentId?: string) => void
  posting: boolean
  limitReached: boolean
  isReply?: boolean
  parentId?: string
}) {
  const cfg = BADGE_TIER_CONFIG[message.author.badge]
  const Icon = cfg.icon
  const isMine = message.author.id === currentUserId
  const isEditing = editingId === message.id
  const isBusy = busyId === message.id

  return (
    <div className={`group px-5 py-4 transition-colors ${message.isPinned ? 'bg-xxm-gold/5' : 'hover:bg-xxm-green-50/20'}`}>
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className={`relative w-10 h-10 rounded-2xl ${cfg.iconBg} flex items-center justify-center shrink-0 ring-1 ring-black/5`}>
          <span className={`text-xs font-black ${cfg.iconColor}`}>{initials(message.author.firstName, message.author.lastName)}</span>
          <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center ring-1 ring-black/5`}>
            <Icon size={11} className={cfg.iconColor} aria-hidden />
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-xxm-green-900">
              {message.author.firstName} {message.author.lastName}
              {isMine && <span className="ml-1.5 text-[10px] font-semibold text-xxm-gray-400">You</span>}
            </p>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.badgeClass}`}>
              {cfg.label}
            </span>
            {message.isPinned && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-xxm-gold-dark">
                <Pin size={10} aria-hidden /> Pinned
              </span>
            )}
            <span className="text-[11px] text-xxm-gray-400 ml-auto shrink-0">
              {formatRelative(message.createdAt)}
              {message.editedAt && <span className="italic"> · edited</span>}
            </span>
          </div>

          {/* Body or inline editor */}
          {isEditing ? (
            <div className="mt-2">
              <Composer
                value={editDraft}
                onChange={setEditDraft}
                onSubmit={() => onEditSubmit(message.id, parentId)}
                onCancel={cancelEdit}
                placeholder="Edit your message…"
                disabled={isBusy}
                submitLabel="Save"
                loading={isBusy}
                autoFocus
              />
            </div>
          ) : (
            <div className="mt-1.5 inline-block max-w-full rounded-2xl rounded-tl-sm bg-xxm-gray-50 px-3.5 py-2.5">
              <p className="text-sm text-xxm-gray-800 leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
            </div>
          )}

          {/* Action bar */}
          {!isEditing && (
            <div className="flex items-center gap-4 mt-2">
              {!isReply && (
                <button
                  onClick={() => setReplyingTo(replyingTo === message.id ? null : message.id)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-xxm-gray-400 hover:text-xxm-green transition-colors"
                >
                  <ReplyIcon size={12} aria-hidden /> Reply
                </button>
              )}
              {canEdit(message) && (
                <button
                  onClick={() => startEdit(message)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-xxm-gray-400 hover:text-xxm-green transition-colors"
                >
                  <Pencil size={12} aria-hidden /> Edit
                </button>
              )}
              {canDelete(message) && (
                <button
                  onClick={() => onDelete(message.id, isReply, parentId)}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-xxm-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={12} aria-hidden /> Delete
                </button>
              )}
              {isAdmin && !isReply && (
                <button
                  onClick={() => onPin(message.id, !message.isPinned)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-xxm-gray-400 hover:text-xxm-gold-dark transition-colors ml-auto"
                >
                  {message.isPinned ? <PinOff size={12} aria-hidden /> : <Pin size={12} aria-hidden />}
                  {message.isPinned ? 'Unpin' : 'Pin'}
                </button>
              )}
            </div>
          )}

          {/* Reply composer */}
          {replyingTo === message.id && !isEditing && (
            <div className="mt-3">
              <Composer
                value={replyDraft}
                onChange={setReplyDraft}
                onSubmit={() => onReplySubmit(message.id)}
                onCancel={() => setReplyingTo(null)}
                placeholder={`Reply to ${message.author.firstName}…`}
                disabled={limitReached || posting}
                submitLabel="Reply"
                loading={posting}
                autoFocus
              />
            </div>
          )}

          {/* Replies */}
          {message.replies.length > 0 && (
            <div className="mt-3 space-y-1 border-l-2 border-xxm-green/10 pl-1">
              {message.replies.map((reply) => (
                <MessageItem
                  key={reply.id}
                  message={reply}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  busyId={busyId}
                  onDelete={onDelete}
                  onPin={onPin}
                  replyingTo={replyingTo}
                  setReplyingTo={setReplyingTo}
                  replyDraft={replyDraft}
                  setReplyDraft={setReplyDraft}
                  onReplySubmit={onReplySubmit}
                  editingId={editingId}
                  startEdit={startEdit}
                  cancelEdit={cancelEdit}
                  editDraft={editDraft}
                  setEditDraft={setEditDraft}
                  onEditSubmit={onEditSubmit}
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
