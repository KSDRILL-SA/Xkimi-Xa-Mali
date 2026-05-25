# Frontend Constitution — Xkimm Xa Mali

## Rules

```
[FRONTEND-F01]  No business logic in UI components.
                Logic lives in hooks or services. Components render; hooks compute.

[FRONTEND-F02]  Component props are explicit TypeScript interfaces.
                No `any`, no object spread without type safety.

[FRONTEND-F03]  Design token system from day one.
                No hardcoded hex colours, spacing values, or font sizes in components.
                All values from Tailwind config tokens.

[FRONTEND-F04]  All forms use React Hook Form + Zod resolver.
                Form schemas are imported from /lib/validation — same schema
                used server-side. No duplicate schema definitions.

[FRONTEND-F05]  All API calls from UI go through typed fetch wrappers in /lib/api.
                No raw fetch() in components or pages.

[FRONTEND-F06]  No sensitive data rendered in component state or localStorage.
                Bank account numbers shown masked (* * * * 1234) client-side.
                Full value fetched only on explicit user request.

[FRONTEND-F07]  Loading, error, and empty states handled in every data-fetching component.
                No UI silently fails. Skeleton loaders on async content.

[FRONTEND-F08]  Composition over monoliths.
                Large components use slot/render-prop patterns.
                No component file exceeds 250 lines.

[FRONTEND-F09]  Mobile-first responsive design. Every page tested at 375px width.
                Tailwind breakpoints used — no custom media queries in CSS.

[FRONTEND-F10]  Accessibility: all interactive elements keyboard-navigable.
                All images have alt text. Colour contrast ≥ WCAG AA.

[FRONTEND-F11]  Server Components for all static and data-fetching content.
                Client Components only when interactivity requires it.
                'use client' directive justified with a comment.

[FRONTEND-F12]  All financial amounts formatted with Intl.NumberFormat (ZAR).
                Never format money manually.
```

## Component Structure

```
components/
  ui/                     — shadcn/ui primitives (Button, Input, Card, etc.)
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

## Design Tokens (Tailwind config)

```javascript
// Brand colours
'xxm-green':  '#1B4332'   // deep green — wealth
'xxm-gold':   '#D4AF37'   // gold — prosperity
'xxm-light':  '#F0FDF4'   // light green tint — backgrounds

// Semantic
'success': '#16A34A'
'warning': '#D97706'
'danger':  '#DC2626'
'info':    '#2563EB'
```

## Currency Formatting

```typescript
// lib/formatters.ts
export const formatZAR = (amount: number | Decimal) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(Number(amount))

// Usage: formatZAR(contribution.amountDue) → "R 100,00"
```
