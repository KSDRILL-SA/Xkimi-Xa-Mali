import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton'
import { MandatesTable } from '@/app/(dashboard)/mandates/MandatesTable'

/**
 * The admin console had no component tests at all. Its services are covered
 * thoroughly; the forms that call them were not covered by anything.
 *
 * That gap mattered more than usual this pass, because the fix applied to four
 * pages in a row was the same one: put a confirmation in front of an action
 * whose consequences are large or permanent. Every one of those confirmations
 * rests on a single property of a single component, and nothing checked it.
 *
 * Rendered with `react-dom/server` rather than a DOM library. The repository
 * has neither jsdom nor Testing Library, and the one component test in the
 * member app drives the component directly — following that is worth more than
 * introducing a dependency surface for assertions that do not need one.
 */

describe('the guard every confirmation rests on', () => {
  it('renders a plain button, not a submit', () => {
    // This is the whole mechanism. `type="submit"` inside a form submits it on
    // click, so the dialog would appear *after* the action had already run —
    // and every confirmation added on the members, contributions and goals
    // pages would be decoration. A default-typed <button> inside a <form> is a
    // submit button, so this is one attribute away from silently useless.
    const html = renderToStaticMarkup(
      <ConfirmSubmitButton title="Do the thing?" message="It cannot be undone." confirmLabel="Do it">
        Do it
      </ConfirmSubmitButton>,
    )

    expect(html).toContain('type="button"')
    expect(html).not.toContain('type="submit"')
  })

  it('does not show the warning until it is asked for', () => {
    // The message belongs in the dialog. If it rendered inline the admin would
    // read it as page furniture and stop seeing it, which is how a warning
    // stops working.
    const html = renderToStaticMarkup(
      <ConfirmSubmitButton title="Generate contributions?" message="There is no undo." confirmLabel="Generate">
        Generate
      </ConfirmSubmitButton>,
    )

    expect(html).toContain('Generate')
    expect(html).not.toContain('There is no undo.')
  })
})

/** A mandate still awaiting approval, which is the only kind that can be rejected. */
const pendingRow = {
  id: 'mn1',
  mandateId: 'mn1',
  member: 'KS Drill',
  email: 'ks@example.co.za',
  bank: 'Capitec Bank',
  amount: 'R 400.00',
  debitDay: 25,
  // The table only offers approve and reject on a mandate still waiting, which
  // is also the only status the service will now reject.
  status: 'Pending',
  statusClass: 'text-amber-700',
  createdAt: '10 August 2026',
}

describe('rejecting a mandate asks why', () => {
  const html = renderToStaticMarkup(
    <MandatesTable
      rows={[pendingRow]}
      approveAction={(async () => {}) as never}
      rejectAction={(async () => {}) as never}
    />,
  )

  it('offers a reason field on the rejection form', () => {
    // The member is told why, so there has to be somewhere to say it. The
    // service refuses without one; this is what stops that refusal being the
    // admin's first hint that a reason was needed.
    expect(html).toContain('name="reason"')
  })

  it('requires the reason in the browser too, not only on the server', () => {
    expect(html).toMatch(/name="reason"[^>]*required|required[^>]*name="reason"/)
    expect(html).toContain('minLength="10"')
  })

  it('does not ask for a reason to approve', () => {
    // Approving takes nothing away, so it is not made harder than it is.
    const approveForm = html.slice(0, html.indexOf('name="reason"'))
    expect(approveForm).toContain('Approve')
  })
})
