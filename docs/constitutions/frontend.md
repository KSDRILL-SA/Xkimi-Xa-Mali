# Frontend Constitution — Xkimi Xa Mali Foundation

## Rules

```
[FRONTEND-F01]  No business logic in UI components.
                Logic lives in hooks or services. Components render; hooks compute.

[FRONTEND-F02]  Component props are explicit TypeScript interfaces.
                No `any`, no object spread without type safety.

[FRONTEND-F03]  Design token system from day one.
                No hardcoded hex colours, spacing values, or font sizes in components.
                All brand values defined in tailwind.config.ts tokens and mirrored
                as CSS custom properties in globals.css. Both Tailwind utilities and
                custom CSS classes draw from these same tokens — never raw values.

[FRONTEND-F04]  Styling approach: Tailwind + custom CSS — both worlds used deliberately.
                Use Tailwind utilities for layout, spacing, and common patterns.
                Use custom CSS (in globals.css or CSS Modules) for complex animations,
                pseudo-element styling, multi-step transitions, and anything that would
                require ugly Tailwind class stacking. One approach does not replace
                the other — use whichever produces cleaner, more readable code.

[FRONTEND-F05]  All forms use React Hook Form + Zod resolver.
                Form schemas are imported from /lib/validation — same schema
                used server-side. No duplicate schema definitions.

[FRONTEND-F06]  All API calls from UI go through typed fetch wrappers in /lib/api.
                No raw fetch() in components or pages.

[FRONTEND-F07]  No sensitive data rendered in component state or localStorage.
                Bank account numbers shown masked (* * * * 1234) client-side.
                Full value fetched only on explicit user request.

[FRONTEND-F08]  Loading, error, and empty states handled in every data-fetching component.
                No UI silently fails. Skeleton loaders on async content.

[FRONTEND-F09]  Composition over monoliths.
                Large components use slot/render-prop patterns.
                No component file exceeds 250 lines.

[FRONTEND-F10]  Mobile-first responsive design. Every page tested at 375px width.
                Tailwind breakpoints (sm/md/lg/xl) used for responsive layout.
                Custom CSS media queries allowed when Tailwind breakpoints
                are insufficient for the specific design requirement.

[FRONTEND-F11]  Accessibility: all interactive elements keyboard-navigable.
                All images have alt text. Colour contrast ≥ WCAG AA.

[FRONTEND-F12]  Server Components for all static and data-fetching content.
                Client Components only when interactivity requires it.
                'use client' directive justified with a comment.

[FRONTEND-F13]  All financial amounts formatted with Intl.NumberFormat (ZAR).
                Never format money manually.
```

## Server / Client Split

The rule: server components fetch and own data, client components own interactivity. `'use client'` is never the default.

```mermaid
flowchart TD
    subgraph SERVER["Server — Vercel edge/serverless"]
        PAGE["page.tsx<br/>async Server Component<br/>calls services directly, no fetch()"]
        LAYOUT["layout.tsx<br/>shared chrome<br/>passes session as prop"]
    end
    subgraph CLIENT["Client — browser"]
        FORM["Form ('use client')<br/>React Hook Form + Zod"]
        HOOK["Custom hook<br/>API via lib/api.ts"]
        UI["UI primitives<br/>components/ui/* — no logic"]
    end
    subgraph API["API"]
        APIROUTE["POST/PATCH/DELETE (mutations)<br/>GET data served in page.tsx"]
    end

    PAGE -->|"passes data as props"| FORM
    PAGE -->|"passes data as props"| UI
    LAYOUT --> PAGE
    FORM --> HOOK --> APIROUTE
    APIROUTE -->|"router.refresh()"| PAGE
```

---

## Component Structure

**Not shadcn/ui** — `@xxm/ui` (`packages/ui/`) is a hand-built component library shared across all 3 apps, not a copy-pasted shadcn primitive set. Roughly 26 components (Button, Card, DataTable, Dropdown, Toast, Stepper, Reveal, and more).

```
components/
  ui/                     — thin app-local wrappers, if any; primitives live in @xxm/ui
  layout/
    Header.tsx
    Sidebar.tsx
    Footer.tsx
    PageWrapper.tsx
  member/
    ContributionCard.tsx
    TransactionRow.tsx
    MandateForm.tsx
    GoalProgressBar.tsx
    StatementDownload.tsx
  admin/
    MemberTable.tsx
    ReportChart.tsx
    AuditLogRow.tsx
  shared/
    AmountDisplay.tsx      — ZAR formatter wrapper
    StatusBadge.tsx        — generic status badge with colour map
    ConfirmModal.tsx        — reusable destructive action confirmation
    EmptyState.tsx
    ErrorBoundary.tsx
```

## Design Tokens

Tokens are defined **once, shared**, in `packages/config/tailwind/base.ts` (`@xxm/config/tailwind`) — every app's `tailwind.config.ts` just imports `baseConfig` from it, rather than each app maintaining its own palette. **Updated 2026-08-30**: the version previously here (a flat 7-color list: `xxm-green`, `xxm-gold`, `xxm-light`, plus 4 semantic colors) undercounted the real system and named at least one token, `xxm-light`, that doesn't exist as such anymore — it's `xxm-green.50` now, a shade within a scale rather than its own name. None of the 4 semantic names (`success`/`warning`/`danger`/`info`) exist in the current config or in `globals.css` either.

**The real palette, from `packages/config/tailwind/base.ts` directly** — 5 color families, most with a full shade scale, not flat single values:

```typescript
export const xxmColors = {
  'xxm-green':     { DEFAULT: '#1B4332', 50: '#F0FDF4', ..., 950: '#052E16' }, // 11 shades
  'xxm-canopy':    { DEFAULT: '#2C5F47', light: '#3A7A5C', dark: '#1E4030' },
  'xxm-gold':      { DEFAULT: '#D4AF37', 50: '#FEFCE8', 100: '#FEF9C3', 200: '#FEF08A', light: '#F0D060', dark: '#A88828', deep: '#8A6F20' },
  'xxm-champagne': { DEFAULT: '#F5F0E6', 50: '#FDFBF7', 100: '#FAF6EE', 200: '#F5F0E6', 300: '#EDE4D2', 400: '#DDD3BA' },
  'xxm-gray':      { 50: '#F9FAFB', ..., 900: '#111827' }, // 10 shades
}
```

The two anchor colors (`xxm-green` DEFAULT `#1B4332`, `xxm-gold` DEFAULT `#D4AF37`) are unchanged from the original palette — those two facts in the previous version of this doc were still correct.

**Usage rule, unchanged:**
- Tailwind utility → `className="bg-xxm-green text-xxm-gold"` (or a shade: `bg-xxm-green-100`)
- Raw hex anywhere in app code → not allowed; add a token instead

## Currency Formatting

Defined once, shared: `packages/utils/src/formatters.ts` (`@xxm/utils`), not per-app. `apps/web/lib/formatters.ts` is a thin re-export, not its own implementation.

```typescript
// packages/utils/src/formatters.ts
/** Accepts plain numbers, strings, or Prisma Decimal-like values. */
export function formatZAR(amount: number | string | { toString(): string }): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(Number(amount))
}

// Usage: formatZAR(contribution.amountDue) → "R 100,00"
```
