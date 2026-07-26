import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

vi.mock('@/repositories/community.repository', () => ({
  communityRepo: {
    findById: vi.fn(),
    create: vi.fn(),
    updateContent: vi.fn(),
    softDelete: vi.fn(),
    setPinned: vi.fn(),
    findMessages: vi.fn(),
    countTopLevel: vi.fn(),
  },
}))
vi.mock('@/lib/cache', () => ({
  cache: { get: vi.fn(), set: vi.fn().mockResolvedValue(undefined), del: vi.fn() },
  CACHE_KEYS: {},
}))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

import { communityRepo } from '@/repositories/community.repository'
import { cache } from '@/lib/cache'
import { writeAuditLog } from '@/services/audit.service'
import {
  postMessage,
  editMessage,
  deleteMessage,
  pinMessage,
  getDailyLimitStatus,
} from '@/services/community.service'
import {
  MessageNotFoundError,
  MessageLimitError,
  MessageEditWindowError,
  MessageDepthError,
  ForbiddenError,
  ValidationError,
} from '@/lib/errors'

const mock = <T extends (...a: never[]) => unknown>(fn: unknown) => fn as MockedFunction<T>

const AUTHOR = 'u1'
const OTHER = 'u2'
const MEMBER = ['MEMBER']
const ADMIN = ['ADMIN']

const message = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  userId: AUTHOR,
  content: 'hello brothers',
  replyToId: null,
  isPinned: false,
  isDeleted: false,
  editableUntil: new Date(Date.now() + 60_000),
  editedAt: null,
  createdAt: new Date(),
  user: { id: AUTHOR, firstName: 'Ku', lastName: 'Ma', badgeScore: { currentBadge: 'PRO' } },
  replies: [],
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  mock(cache.get).mockResolvedValue(null as never)
  mock(cache.set).mockResolvedValue(undefined as never)
  mock(communityRepo.create).mockResolvedValue(message() as never)
})

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

describe('postMessage — content', () => {
  it('refuses an empty message', async () => {
    await expect(postMessage(AUTHOR, '   ')).rejects.toBeInstanceOf(ValidationError)
    expect(communityRepo.create).not.toHaveBeenCalled()
  })

  it('refuses a message past the 500-character limit', async () => {
    await expect(postMessage(AUTHOR, 'a'.repeat(501))).rejects.toBeInstanceOf(ValidationError)
  })

  it('accepts exactly 500', async () => {
    await expect(postMessage(AUTHOR, 'a'.repeat(500))).resolves.toBeDefined()
  })

  it('stores the trimmed text, not what was typed around it', async () => {
    await postMessage(AUTHOR, '  hello brothers  ')
    expect(communityRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'hello brothers' }),
    )
  })

  it('opens a five-minute window to edit', async () => {
    const before = Date.now()
    await postMessage(AUTHOR, 'hello')
    const [{ editableUntil }] = mock(communityRepo.create).mock.calls[0] as unknown as [{ editableUntil: Date }]
    const window = editableUntil.getTime() - before
    expect(window).toBeGreaterThan(4 * 60_000)
    expect(window).toBeLessThanOrEqual(5 * 60_000 + 1000)
  })
})

describe('postMessage — replies stay two levels deep', () => {
  it('allows a reply to a top-level message', async () => {
    mock(communityRepo.findById).mockResolvedValue(message({ replyToId: null }) as never)
    await expect(postMessage(AUTHOR, 'agreed', 'm1')).resolves.toBeDefined()
  })

  it('refuses a reply to a reply, so threads cannot nest without end', async () => {
    mock(communityRepo.findById).mockResolvedValue(message({ id: 'm2', replyToId: 'm1' }) as never)
    await expect(postMessage(AUTHOR, 'agreed', 'm2')).rejects.toBeInstanceOf(MessageDepthError)
  })

  it('refuses a reply to a message that does not exist', async () => {
    mock(communityRepo.findById).mockResolvedValue(null as never)
    await expect(postMessage(AUTHOR, 'agreed', 'gone')).rejects.toBeInstanceOf(MessageNotFoundError)
  })

  it('refuses a reply to a deleted message', async () => {
    mock(communityRepo.findById).mockResolvedValue(message({ isDeleted: true }) as never)
    await expect(postMessage(AUTHOR, 'agreed', 'm1')).rejects.toBeInstanceOf(MessageNotFoundError)
  })
})

describe('postMessage — the daily limit', () => {
  it('refuses the eleventh message of the day', async () => {
    mock(cache.get).mockResolvedValue(10 as never)
    await expect(postMessage(AUTHOR, 'hello')).rejects.toBeInstanceOf(MessageLimitError)
    expect(communityRepo.create).not.toHaveBeenCalled()
  })

  it('allows the tenth', async () => {
    mock(cache.get).mockResolvedValue(9 as never)
    await expect(postMessage(AUTHOR, 'hello')).resolves.toBeDefined()
  })

  it('counts the message just posted', async () => {
    mock(cache.get).mockResolvedValue(3 as never)
    await postMessage(AUTHOR, 'hello')
    expect(cache.set).toHaveBeenCalledWith(expect.any(String), 4, expect.any(Number))
  })

  it('expires the count before the next day, so it resets', async () => {
    mock(cache.get).mockResolvedValue(1 as never)
    await postMessage(AUTHOR, 'hello')
    const [, , ttl] = mock(cache.set).mock.calls[0] as unknown as [string, number, number]
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(24 * 60 * 60)
  })

  it('does not spend quota on a reply that was rejected', async () => {
    // The parent is validated before the counter moves, so a member who replies
    // to a deleted message does not lose one of their ten.
    mock(communityRepo.findById).mockResolvedValue(null as never)
    await expect(postMessage(AUTHOR, 'agreed', 'gone')).rejects.toBeInstanceOf(MessageNotFoundError)
    expect(cache.set).not.toHaveBeenCalled()
  })

  it('lets a member through when the counter is unavailable, rather than silencing them', async () => {
    // Redis is optional; an unconfigured cache reads as null. Failing closed
    // would mute the whole board whenever the cache went away.
    mock(cache.get).mockResolvedValue(null as never)
    await expect(postMessage(AUTHOR, 'hello')).resolves.toBeDefined()
  })
})

describe('getDailyLimitStatus', () => {
  it('reports nothing used when nothing has been posted', async () => {
    mock(cache.get).mockResolvedValue(null as never)
    expect(await getDailyLimitStatus(AUTHOR)).toEqual({ used: 0, limit: 10 })
  })

  it('never reports more used than the limit', async () => {
    mock(cache.get).mockResolvedValue(99 as never)
    expect(await getDailyLimitStatus(AUTHOR)).toEqual({ used: 10, limit: 10 })
  })
})

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

describe('editMessage', () => {
  beforeEach(() => {
    mock(communityRepo.updateContent).mockResolvedValue(message({ content: 'edited' }) as never)
  })

  it('lets the author correct their own message inside the window', async () => {
    mock(communityRepo.findById).mockResolvedValue(message() as never)
    await expect(editMessage(AUTHOR, 'm1', 'edited')).resolves.toBeDefined()
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'COMMUNITY_MESSAGE_EDITED' }),
    )
  })

  it('refuses once the window has closed', async () => {
    mock(communityRepo.findById).mockResolvedValue(
      message({ editableUntil: new Date(Date.now() - 1000) }) as never,
    )
    await expect(editMessage(AUTHOR, 'm1', 'edited')).rejects.toBeInstanceOf(MessageEditWindowError)
  })

  it('refuses another member', async () => {
    mock(communityRepo.findById).mockResolvedValue(message() as never)
    await expect(editMessage(OTHER, 'm1', 'edited')).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('refuses an admin too — they may pin and delete, but not rewrite words', async () => {
    // Editing is the one power an admin does not get: silently changing what a
    // member said is worse than removing it visibly.
    mock(communityRepo.findById).mockResolvedValue(message() as never)
    await expect(editMessage('admin-1', 'm1', 'edited')).rejects.toBeInstanceOf(ForbiddenError)
    expect(communityRepo.updateContent).not.toHaveBeenCalled()
  })

  it('validates the new content as strictly as the original', async () => {
    mock(communityRepo.findById).mockResolvedValue(message() as never)
    await expect(editMessage(AUTHOR, 'm1', '  ')).rejects.toBeInstanceOf(ValidationError)
    await expect(editMessage(AUTHOR, 'm1', 'a'.repeat(501))).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses a deleted message', async () => {
    mock(communityRepo.findById).mockResolvedValue(message({ isDeleted: true }) as never)
    await expect(editMessage(AUTHOR, 'm1', 'edited')).rejects.toBeInstanceOf(MessageNotFoundError)
  })
})

// ---------------------------------------------------------------------------
// Deleting and pinning
// ---------------------------------------------------------------------------

describe('deleteMessage', () => {
  it('lets the author delete their own, with no time limit', async () => {
    mock(communityRepo.findById).mockResolvedValue(
      message({ editableUntil: new Date(Date.now() - 86_400_000) }) as never,
    )
    await deleteMessage(AUTHOR, 'm1', MEMBER)
    expect(communityRepo.softDelete).toHaveBeenCalledWith('m1', AUTHOR)
  })

  it('lets an admin delete anyone else', async () => {
    mock(communityRepo.findById).mockResolvedValue(message() as never)
    await deleteMessage('admin-1', 'm1', ADMIN)
    expect(communityRepo.softDelete).toHaveBeenCalled()
  })

  it('refuses another member', async () => {
    mock(communityRepo.findById).mockResolvedValue(message() as never)
    await expect(deleteMessage(OTHER, 'm1', MEMBER)).rejects.toBeInstanceOf(ForbiddenError)
    expect(communityRepo.softDelete).not.toHaveBeenCalled()
  })

  it('records whose message it was, so an admin removal is distinguishable', async () => {
    mock(communityRepo.findById).mockResolvedValue(message() as never)
    await deleteMessage('admin-1', 'm1', ADMIN)
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { ownMessage: false } }),
    )
  })

  it('soft-deletes rather than removing, so replies keep their parent', async () => {
    mock(communityRepo.findById).mockResolvedValue(message() as never)
    await deleteMessage(AUTHOR, 'm1', MEMBER)
    expect(communityRepo.softDelete).toHaveBeenCalled()
  })
})

describe('pinMessage', () => {
  beforeEach(() => {
    mock(communityRepo.setPinned).mockResolvedValue({ id: 'm1', isPinned: true } as never)
  })

  it('is admin-only', async () => {
    await expect(pinMessage('m1', true, OTHER, MEMBER)).rejects.toThrow()
    expect(communityRepo.findById).not.toHaveBeenCalled()
  })

  it('pins for an admin and records it', async () => {
    mock(communityRepo.findById).mockResolvedValue(message() as never)
    expect(await pinMessage('m1', true, 'admin-1', ADMIN)).toEqual({ id: 'm1', isPinned: true })
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'COMMUNITY_MESSAGE_PINNED' }),
    )
  })

  it('records an unpin as its own action', async () => {
    mock(communityRepo.findById).mockResolvedValue(message() as never)
    mock(communityRepo.setPinned).mockResolvedValue({ id: 'm1', isPinned: false } as never)
    await pinMessage('m1', false, 'admin-1', ADMIN)
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'COMMUNITY_MESSAGE_UNPINNED' }),
    )
  })

  it('refuses to pin a deleted message', async () => {
    mock(communityRepo.findById).mockResolvedValue(message({ isDeleted: true }) as never)
    await expect(pinMessage('m1', true, 'admin-1', ADMIN)).rejects.toBeInstanceOf(MessageNotFoundError)
  })
})
