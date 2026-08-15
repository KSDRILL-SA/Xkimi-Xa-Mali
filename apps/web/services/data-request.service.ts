import { DsrKind } from '@prisma/client'
import { db } from '@/lib/db'
import { raiseOperationalAlert } from '@/services/alert.service'
import { logger } from '@xxm/observability'

/**
 * Intake for POPIA data subject requests submitted by the person themselves.
 *
 * The admin app can already *log* a request that arrived by email, and that path
 * is the right one for a request that genuinely arrived that way. What was
 * missing is this one. The privacy page tells members that requests directed to
 * the Information Officer are "properly recorded and answered within the time
 * the Act requires", and until now the recording depended entirely on an
 * administrator reading a support email and remembering to transcribe it. The
 * thirty-day clock is started by the transcription, not by the request — so a
 * request nobody transcribed was a request the clock never ran for, which is the
 * precise failure `DataSubjectRequest` was created to end.
 *
 * This module closes that loop: the row is written when the person presses the
 * button, and the clock starts from that moment whatever anyone does next.
 *
 * **Recording is not answering, and this deliberately does not verify identity.**
 * POPIA requires the responsible party to satisfy itself who it is dealing with
 * *before disclosing or deleting* anything — not before writing down that
 * somebody asked. Verifying at intake would put an identity check in front of a
 * statutory right and give us a reason to not record awkward requests. So the
 * row is created for anyone who submits, an administrator verifies before acting
 * on it, and `outcome` records what verification was done. A fraudulent request
 * that is recorded and then refused is a compliant outcome; a genuine request
 * that was never recorded is not.
 */

/** What a member may ask for, in the words the form puts to them. */
export const REQUEST_KINDS: ReadonlyArray<{ value: DsrKind; label: string; helper: string }> = [
  {
    value: DsrKind.ACCESS,
    label: 'See the information you hold about me',
    helper: 'A copy of your personal information and what it is used for.',
  },
  {
    value: DsrKind.CORRECTION,
    label: 'Correct something that is wrong',
    helper: 'Tell us which detail is wrong and what it should say.',
  },
  {
    value: DsrKind.DELETION,
    label: 'Delete my information',
    helper: 'Some financial records must be kept by law; we will tell you which.',
  },
  {
    value: DsrKind.OBJECTION,
    label: 'Object to how my information is used',
    helper: 'Tell us which use you object to.',
  },
  {
    value: DsrKind.CONSENT_WITHDRAWAL,
    label: 'Withdraw my consent',
    helper: 'Withdrawing consent does not undo processing already carried out lawfully.',
  },
] as const

/** The statutory response period, in days. Mirrors the admin app's constant. */
export const DSR_RESPONSE_DAYS = 30

export function dueDateFor(receivedAt: Date): Date {
  const due = new Date(receivedAt)
  due.setDate(due.getDate() + DSR_RESPONSE_DAYS)
  return due
}

export class DataRequestValidationError extends Error {}

export type SubmitDataRequestInput = {
  requesterName: string
  requesterEmail: string
  kind: DsrKind
  detail: string
  /** Set when the submitter is signed in. Never taken from the form. */
  subjectId?: string | null
}

export type SubmittedDataRequest = {
  id: string
  kind: DsrKind
  receivedAt: Date
  dueAt: Date
}

const MAX_DETAIL = 4000
const MAX_NAME = 120

/**
 * Record a request and tell the administrators it arrived.
 *
 * Returns the due date so the page can show the requester the same date the
 * Foundation is now measured against. Telling them when to expect an answer is
 * both the courteous thing and the thing that makes a missed deadline visible
 * from the outside as well as the inside.
 */
export async function submitDataRequest(
  input: SubmitDataRequestInput,
): Promise<SubmittedDataRequest> {
  const requesterName = input.requesterName.trim()
  const requesterEmail = input.requesterEmail.trim().toLowerCase()
  const detail = input.detail.trim()

  if (requesterName.length < 2 || requesterName.length > MAX_NAME) {
    throw new DataRequestValidationError('Please give the name we should use when we reply.')
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(requesterEmail)) {
    throw new DataRequestValidationError('Please give an email address we can reply to.')
  }
  if (!Object.values(DsrKind).includes(input.kind)) {
    throw new DataRequestValidationError('Please choose what you are asking for.')
  }
  if (!detail) {
    throw new DataRequestValidationError('Please tell us what you are asking for.')
  }
  if (detail.length > MAX_DETAIL) {
    throw new DataRequestValidationError('Please keep the description under 4000 characters.')
  }

  const receivedAt = new Date()
  const dueAt = dueDateFor(receivedAt)

  // `subjectId` comes from the session and never from the submitted form. A
  // request that claims to be about somebody else must not link itself to that
  // person's account on the strength of a typed email address.
  const request = await db.dataSubjectRequest.create({
    data: {
      requesterName,
      requesterEmail,
      subjectId: input.subjectId ?? null,
      kind: input.kind,
      detail,
      receivedAt,
      dueAt,
    },
    select: { id: true, kind: true, receivedAt: true, dueAt: true },
  })

  // Raised, not merely logged. A request that sits unseen in a table nobody
  // opens is the state this whole path exists to prevent, and the arrival is
  // the one moment we can be certain a person is waiting.
  //
  // `warning`, so it reaches an inbox and an email without also sending an SMS —
  // there are thirty days to answer, so it does not need to wake anyone, but it
  // must not wait for someone to think of looking either.
  //
  // The requester's own words are deliberately NOT included. The alert travels
  // by email and inbox to every administrator, and `detail` is written by a
  // member who may put their ID number, their bank details or their health in
  // it. What travels is that a request exists and where to read it.
  try {
    await raiseOperationalAlert({
      code: 'DSR_RECEIVED',
      severity: 'warning',
      title: `${article(kindLabel(request.kind))} ${kindLabel(request.kind)} request has been submitted`,
      body: [
        `Someone has asked the Foundation to ${kindSentence(request.kind)}.`,
        '',
        `It must be answered by ${dueAt.toISOString().slice(0, 10)} — ${DSR_RESPONSE_DAYS} days from today.`,
        '',
        'Open Data Requests in the admin app to read it and respond.',
        'Verify who the requester is before disclosing or deleting anything.',
      ].join('\n'),
      entityId: request.id,
      payload: { kind: request.kind, dueAt: request.dueAt },
    })
  } catch (err) {
    // raiseOperationalAlert is documented never to throw, so this is defence
    // against that promise being broken later. The row is already committed and
    // the clock is already running; failing the submission now would tell the
    // requester their request was not received when in fact it was, which is the
    // worse of the two outcomes by a distance.
    logger.error('DSR recorded but the arrival alert failed', { err, requestId: request.id })
  }

  return request
}

/**
 * "An access request", not "A access request".
 *
 * Two of the five kinds begin with a vowel. The alert read "A access request has
 * been submitted" the first time it was raised for real — correct in every test,
 * because no test asserted on the article.
 */
function article(word: string): 'A' | 'An' {
  return /^[aeiou]/i.test(word) ? 'An' : 'A'
}

function kindLabel(kind: DsrKind): string {
  switch (kind) {
    case DsrKind.ACCESS: return 'access'
    case DsrKind.CORRECTION: return 'correction'
    case DsrKind.DELETION: return 'deletion'
    case DsrKind.OBJECTION: return 'objection'
    case DsrKind.CONSENT_WITHDRAWAL: return 'consent withdrawal'
  }
}

function kindSentence(kind: DsrKind): string {
  switch (kind) {
    case DsrKind.ACCESS: return 'show them the personal information it holds about them'
    case DsrKind.CORRECTION: return 'correct personal information it holds about them'
    case DsrKind.DELETION: return 'delete the personal information it holds about them'
    case DsrKind.OBJECTION: return 'stop a use of their personal information'
    case DsrKind.CONSENT_WITHDRAWAL: return 'record the withdrawal of their consent'
  }
}
