import { describe, it, expect, vi, beforeEach } from 'vitest'

const create = vi.fn()
const raiseAlert = vi.fn()

vi.mock('@/lib/db', () => ({
  db: { dataSubjectRequest: { create: (...a: unknown[]) => create(...a) } },
}))

vi.mock('@/services/alert.service', () => ({
  raiseOperationalAlert: (...a: unknown[]) => raiseAlert(...a),
}))

vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  submitDataRequest,
  dueDateFor,
  DataRequestValidationError,
  DSR_RESPONSE_DAYS,
  REQUEST_KINDS,
} from '@/services/data-request.service'

const VALID = {
  requesterName: 'Thandi Mokoena',
  requesterEmail: 'thandi@example.co.za',
  kind: 'ACCESS' as const,
  detail: 'Please send me everything you hold about me.',
}

beforeEach(() => {
  create.mockReset().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: 'dsr_1',
      kind: data.kind,
      receivedAt: data.receivedAt,
      dueAt: data.dueAt,
    }),
  )
  raiseAlert.mockReset().mockResolvedValue({})
})

describe('the statutory clock', () => {
  it('is thirty days from when they asked', () => {
    const due = dueDateFor(new Date('2026-03-01T09:00:00Z'))
    expect(due.toISOString().slice(0, 10)).toBe('2026-03-31')
    expect(DSR_RESPONSE_DAYS).toBe(30)
  })

  it('starts when the person submits, not when an administrator notices', async () => {
    // The whole reason this path exists. The row carries its own receivedAt and
    // dueAt at the moment of submission, so nothing downstream can decide the
    // clock started later.
    const before = Date.now()
    const request = await submitDataRequest(VALID)
    const receivedAt = create.mock.calls[0][0].data.receivedAt as Date

    expect(receivedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(request.dueAt.getTime() - receivedAt.getTime()).toBe(30 * 24 * 60 * 60 * 1000)
  })
})

describe('recording a request', () => {
  it('normalises the email so the same person is not two requesters', async () => {
    await submitDataRequest({ ...VALID, requesterEmail: '  Thandi@Example.CO.ZA ' })
    expect(create.mock.calls[0][0].data.requesterEmail).toBe('thandi@example.co.za')
  })

  it('trims the name and the description', async () => {
    await submitDataRequest({ ...VALID, requesterName: '  Thandi  ', detail: '  delete me  ' })
    const data = create.mock.calls[0][0].data
    expect(data.requesterName).toBe('Thandi')
    expect(data.detail).toBe('delete me')
  })

  it('accepts someone who is not signed in', async () => {
    // A former member has no account to sign in to, and an invitee never had
    // one — they have the strongest claim to deletion and the least ability to
    // prove who they are on the way in.
    await submitDataRequest(VALID)
    expect(create.mock.calls[0][0].data.subjectId).toBeNull()
  })

  it('links to the account only from the session', async () => {
    await submitDataRequest({ ...VALID, subjectId: 'user_7' })
    expect(create.mock.calls[0][0].data.subjectId).toBe('user_7')
  })

  it('gives back the due date so the requester can hold us to it', async () => {
    const request = await submitDataRequest(VALID)
    expect(request.dueAt).toBeInstanceOf(Date)
    expect(request.id).toBe('dsr_1')
  })

  it('offers every kind the Act gives, and no others', async () => {
    expect(REQUEST_KINDS.map((k) => k.value).sort()).toEqual(
      ['ACCESS', 'CONSENT_WITHDRAWAL', 'CORRECTION', 'DELETION', 'OBJECTION'],
    )
  })
})

describe('telling the administrators', () => {
  it('raises an alert so the request is not left sitting in a table', async () => {
    await submitDataRequest(VALID)
    expect(raiseAlert).toHaveBeenCalledTimes(1)
    const alert = raiseAlert.mock.calls[0][0]
    expect(alert.code).toBe('DSR_RECEIVED')
    expect(alert.entityId).toBe('dsr_1')
  })

  it('does not put the requester\'s own words into the alert', async () => {
    // The alert travels by email and inbox to every administrator, and a member
    // may well have typed their ID number or their health into `detail`.
    const secret = 'my ID is 9001015800086 and I am ill'
    await submitDataRequest({ ...VALID, detail: secret })
    const alert = raiseAlert.mock.calls[0][0]
    expect(JSON.stringify(alert)).not.toContain(secret)
    expect(JSON.stringify(alert)).not.toContain('9001015800086')
  })

  it('gets the article right for every kind', async () => {
    // "A access request has been submitted" is what actually went out the first
    // time this ran for real. Every test passed, because none of them read the
    // sentence.
    const expected: Record<string, string> = {
      ACCESS: 'An access request has been submitted',
      OBJECTION: 'An objection request has been submitted',
      CORRECTION: 'A correction request has been submitted',
      DELETION: 'A deletion request has been submitted',
      CONSENT_WITHDRAWAL: 'A consent withdrawal request has been submitted',
    }

    for (const [kind, title] of Object.entries(expected)) {
      raiseAlert.mockClear()
      await submitDataRequest({ ...VALID, kind: kind as typeof VALID.kind })
      expect(raiseAlert.mock.calls[0][0].title).toBe(title)
    }
  })

  it('does not send an SMS, because there are thirty days', async () => {
    await submitDataRequest(VALID)
    expect(raiseAlert.mock.calls[0][0].severity).toBe('warning')
  })

  it('still records the request if the alert fails', async () => {
    // The row is already committed and the clock is already running. Failing the
    // submission here would tell the requester it was not received when it was.
    raiseAlert.mockRejectedValue(new Error('inbox down'))
    await expect(submitDataRequest(VALID)).resolves.toMatchObject({ id: 'dsr_1' })
  })
})

describe('what it refuses', () => {
  it('needs a name to reply to', async () => {
    await expect(submitDataRequest({ ...VALID, requesterName: ' x ' })).rejects.toBeInstanceOf(
      DataRequestValidationError,
    )
  })

  it('needs a usable email address', async () => {
    await expect(submitDataRequest({ ...VALID, requesterEmail: 'not-an-email' })).rejects.toBeInstanceOf(
      DataRequestValidationError,
    )
  })

  it('needs to know what is being asked for', async () => {
    await expect(submitDataRequest({ ...VALID, detail: '   ' })).rejects.toBeInstanceOf(
      DataRequestValidationError,
    )
  })

  it('rejects a kind it does not recognise', async () => {
    await expect(
      submitDataRequest({ ...VALID, kind: 'toString' as never }),
    ).rejects.toBeInstanceOf(DataRequestValidationError)
  })

  it('writes nothing when it refuses', async () => {
    await expect(submitDataRequest({ ...VALID, detail: '' })).rejects.toThrow()
    expect(create).not.toHaveBeenCalled()
    expect(raiseAlert).not.toHaveBeenCalled()
  })
})
