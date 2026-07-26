'use client'

import { Pin, PinOff, Trash2, Reply as ReplyIcon, Pencil } from 'lucide-react'
import { BADGE_TIER_CONFIG } from '@/lib/badge-tier'
import { Composer } from './Composer'
import { initials, formatRelative, type SerializedMessage } from './message-types'

export function MessageItem({
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
