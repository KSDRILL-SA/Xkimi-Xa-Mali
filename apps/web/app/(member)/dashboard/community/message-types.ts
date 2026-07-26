import type { BadgeTier } from '@prisma/client'

export type SerializedMessage = {
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

export type DailyLimit = { used: number; limit: number } | null

export const MAX_CONTENT_LENGTH = 500

export const EMOJIS = [
  '😀', '😂', '🙂', '😉', '😍', '😎', '🤝', '👍',
  '👏', '🙏', '💪', '🔥', '💯', '✅', '🎉', '🥳',
  '💰', '💵', '📈', '🏆', '⭐', '❤️', '🙌', '👊',
  '🤞', '😇', '😅', '😢', '🤔', '👀', '💡', '📌',
  '🚀', '🌟', '💚', '🫡', '😤', '🥹', '🫶', '👋',
]

export function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}

export function formatRelative(iso: string): string {
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
