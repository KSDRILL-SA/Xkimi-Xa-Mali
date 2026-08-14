import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useForm, useWatch, type Control, type FieldValues } from 'react-hook-form'

/**
 * Proof that `useWatch` returns what `watch` returned, before the payment
 * screens are moved onto it.
 *
 * The React Compiler refuses to compile any component calling `watch()` —
 * "React Hook Form's `useForm()` API returns a `watch()` function which cannot
 * be memoized safely" — which silently opted the three highest-value screens in
 * the app out of compilation. The documented replacement is `useWatch`, and the
 * one place the two are known to diverge is the **first render**: `watch` reads
 * the live form state, while `useWatch` seeds itself from the default value.
 * Where a field has no default, that is the difference between the form's value
 * and `undefined` — and on a payment screen a first-render `undefined` is a
 * blank or NaN amount in front of somebody about to pay.
 *
 * `contribute/page.tsx` watches `periodMonth` and `periodYear`, and its
 * `useForm` gives defaults for **neither**, so that case is not hypothetical
 * here — it is the exact shape of the code being changed.
 *
 * Rendered with `react-dom/server` rather than a DOM harness on purpose: this
 * suite runs on `environment: 'node'` with no `@testing-library` anywhere, and
 * the question being asked is what the *first* render produces, which is
 * precisely what server rendering yields. Nothing new had to be installed to
 * answer it.
 */

type Shape = { amount?: number; periodMonth?: number; periodYear?: number }

function ViaWatch({ defaults, field }: { defaults: Shape; field: keyof Shape }) {
  const { watch } = useForm<Shape>({ defaultValues: defaults })
  return <span>{String(watch(field))}</span>
}

function ViaUseWatch({ defaults, field }: { defaults: Shape; field: keyof Shape }) {
  const { control } = useForm<Shape>({ defaultValues: defaults })
  return <Inner control={control} field={field} />
}

function Inner({ control, field }: { control: Control<Shape>; field: keyof Shape }) {
  const value = useWatch({ control: control as Control<FieldValues>, name: field })
  return <span>{String(value)}</span>
}

function firstRender(node: React.ReactElement): string {
  return renderToStaticMarkup(node)
}

/** Every field/default combination the three payment screens actually use. */
const CASES: Array<[name: string, defaults: Shape, field: keyof Shape]> = [
  ['an amount with a default (GoalPayModal, PaymentModal)', { amount: 250 }, 'amount'],
  ['an amount defaulted to the minimum (contribute page)', { amount: 50 }, 'amount'],
  ['a zero amount, which must not read as absent', { amount: 0 }, 'amount'],
  ['periodMonth with NO default (contribute page)', { amount: 50 }, 'periodMonth'],
  ['periodYear with NO default (contribute page)', { amount: 50 }, 'periodYear'],
  ['a period that does have a default (PaymentModal)', { periodMonth: 3, periodYear: 2026 }, 'periodMonth'],
]

describe('useWatch returns what watch returned, on first render', () => {
  for (const [name, defaults, field] of CASES) {
    it(name, () => {
      const withWatch = firstRender(<ViaWatch defaults={defaults} field={field} />)
      const withUseWatch = firstRender(<ViaUseWatch defaults={defaults} field={field} />)
      expect(withUseWatch).toBe(withWatch)
    })
  }

  it('renders the actual value, not an empty element', () => {
    // Guards the comparison itself: two identically broken renders would satisfy
    // every assertion above.
    expect(firstRender(<ViaWatch defaults={{ amount: 250 }} field="amount" />)).toContain('250')
    expect(firstRender(<ViaUseWatch defaults={{ amount: 250 }} field="amount" />)).toContain('250')
  })

  it('distinguishes a missing field from a present one', () => {
    // And guards against the comparison passing because everything renders
    // "undefined" regardless of the defaults.
    const present = firstRender(<ViaUseWatch defaults={{ amount: 250 }} field="amount" />)
    const absent = firstRender(<ViaUseWatch defaults={{ amount: 250 }} field="periodMonth" />)
    expect(present).not.toBe(absent)
    expect(absent).toContain('undefined')
  })
})
