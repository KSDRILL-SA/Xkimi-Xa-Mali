import { describe, it, expect } from 'vitest'
import { smsCost } from '@xxm/utils/sms'
import { NOTIFICATION_TEMPLATES } from '../prisma/templates'

/**
 * Representative values for the placeholders, so each template is measured as it
 * will actually be sent rather than as it is written. A rendered value is part
 * of the message and counts toward the segment.
 */
const SAMPLE: Record<string, string> = {
  amount: '110.00',
  firstName: 'Kurhula',
  name: 'Kurhula Success',
  date: '25 August 2026',
  newDate: '25 August 2026',
  goal: '2026 Family Fund',
  title: '2026 Family Fund',
  targetAmount: '120000.00',
  endDate: '31 December 2026',
  tier: 'WORLD_CLASS',
  badge: 'WORLD_CLASS',
  reason: 'insufficient funds',
  month: 'August',
  days: '3',
  code: 'ABC123XYZ',
  url: 'https://xkimixamali.co.za/invite/abcdefghijklmnop',
  link: 'https://xkimixamali.co.za/invite/abcdefghijklmnop',
  progress: '80',
  percentage: '85',
  budget: '2500.00',
  bank: 'Standard Bank',
  reference: 'XXM-GOAL-A1B2C3D4',
  debitDay: '25',
  type: 'monthly',
  period: 'August 2026',
  // The operational alert pair. `title` above is shared with the goal templates
  // and is shorter than a real alert headline — the longest this system
  // produces is around forty characters ("2026-08: 9 contributions not
  // collected"), which still leaves the SMS inside one segment.
  detail: '9 declined by the bank\n1 could not be submitted (gateway unreachable)',
}

function render(body: string): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => SAMPLE[key] ?? `{{${key}}}`)
}

const SMS_TEMPLATES = NOTIFICATION_TEMPLATES.filter((t) => t.channel === 'SMS' || t.channel === 'BOTH')

describe('every SMS template stays in the GSM-7 alphabet', () => {
  // One character outside GSM-7 forces the whole message into UCS-2, which cuts
  // a segment from 160 characters to 70 — so a single em dash can more than
  // double what a message costs. It has been introduced here three separate
  // times and caught each time only by measuring. This is the measurement.
  it('has SMS templates to check', () => {
    expect(SMS_TEMPLATES.length).toBeGreaterThan(0)
  })

  for (const template of SMS_TEMPLATES) {
    it(`${template.slug} is GSM-7`, () => {
      const cost = smsCost(render(template.body))
      expect(
        cost.offendingCharacters,
        `"${template.slug}" would be sent as UCS-2 because of ${JSON.stringify(cost.offendingCharacters)}. ` +
        'Replace those characters — an em dash becomes a hyphen, curly quotes become straight ones.',
      ).toEqual([])
    })
  }
})

describe('no SMS template is quietly expensive', () => {
  const LIMIT = 2

  for (const template of SMS_TEMPLATES) {
    it(`${template.slug} costs at most ${LIMIT} segments`, () => {
      const cost = smsCost(render(template.body))
      expect(
        cost.segments,
        `"${template.slug}" renders to ${cost.units} ${cost.encoding} units, billed as ${cost.segments} segments.`,
      ).toBeLessThanOrEqual(LIMIT)
    })
  }
})

/**
 * The alert SMS is measured against the sample `title` like every other
 * template, and that sample is shorter than a real alert headline. This is the
 * one template where that gap matters: it is sent when money did not move, and
 * a second segment is paid for on every founder, every time.
 */
describe('the operational alert SMS, measured against real headlines', () => {
  const HEADLINES = [
    '2026-08: 9 contributions not collected',
    'The monthly debit run failed and did not complete',
    'Ledger drift on 12 contributions',
    'The failed-transaction retry failed and did not complete',
    '3 financial alerts',
  ]

  const template = NOTIFICATION_TEMPLATES.find((t) => t.slug === 'admin-alert-sms')

  it('exists', () => expect(template).toBeDefined())

  for (const headline of HEADLINES) {
    it(`stays in one segment for "${headline}"`, () => {
      const cost = smsCost(template!.body.replace('{{title}}', headline))
      expect(cost.offendingCharacters).toEqual([])
      expect(cost.segments, `renders to ${cost.units} ${cost.encoding} units`).toBe(1)
    })
  }
})

describe('template hygiene', () => {
  it('every template carries the platform name, so a member knows who is writing', () => {
    for (const t of SMS_TEMPLATES) {
      expect(t.body, `${t.slug} does not name the sender`).toContain('Xkimi Xa Mali')
    }
  })

  it('uses the full name everywhere, with no half-renamed leftovers', () => {
    for (const t of NOTIFICATION_TEMPLATES) {
      const text = `${t.subject ?? ''} ${t.body}`
      if (text.includes('Xkimi Xa Mali')) {
        expect(text, `${t.slug} still uses the short name`).toContain('Xkimi Xa Mali Foundation')
      }
    }
  })

  it('has no duplicate slugs — the seed upserts on slug', () => {
    const slugs = NOTIFICATION_TEMPLATES.map((t) => t.slug)
    expect(slugs.length).toBe(new Set(slugs).size)
  })

  it('leaves no placeholder unaccounted for in the sample data', () => {
    // A placeholder with no sample here is one this test cannot measure honestly.
    const unknown = new Set<string>()
    for (const t of NOTIFICATION_TEMPLATES) {
      for (const [, key] of `${t.subject ?? ''} ${t.body}`.matchAll(/\{\{(\w+)\}\}/g)) {
        if (!(key in SAMPLE)) unknown.add(key)
      }
    }
    expect([...unknown]).toEqual([])
  })
})
