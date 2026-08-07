'use client'

import { MessageSquare } from 'lucide-react'
import { Composer } from './Composer'
import { MessageItem } from './MessageItem'
import { useMessageBoard } from './use-message-board'
import type { SerializedMessage, DailyLimit } from './message-types'

export function MessageBoard(props: {
  initialItems: SerializedMessage[]
  initialTotalPages: number
  initialDailyLimit: DailyLimit
  currentUserId: string
  isAdmin: boolean
}) {
  const { currentUserId, isAdmin } = props
  const {
    items, page, totalPages, dailyLimit, limitReached,
    content, setContent, posting,
    loadingMore, loadMore,
    replyingTo, replyDraft, setReplyDraft,
    editingId, editDraft, setEditDraft, startEdit, cancelEdit, startReply,
    busyId,
    handlePost, handleReply, handleEdit, handleDelete, handlePin,
    canEdit, canDelete,
  } = useMessageBoard(props)

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
              setReplyingTo={startReply}
              replyDraft={replyDraft}
              setReplyDraft={setReplyDraft}
              onReplySubmit={handleReply}
              editingId={editingId}
              startEdit={startEdit}
              cancelEdit={cancelEdit}
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
