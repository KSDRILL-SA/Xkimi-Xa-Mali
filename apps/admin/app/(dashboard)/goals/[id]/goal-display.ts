// Presentation lookups shared by the goal detail page and its sub-components.
// Kept out of the components themselves so the page and the overview card can
// never drift on what a status looks like.

export const STATUS_CONFIG: Record<string, {
  label: string
  badge: string
  bar: 'default' | 'gold' | 'success' | 'danger'
}> = {
  DRAFT:    { label: 'Draft',    badge: 'bg-xxm-gray-100 text-xxm-gray-600',   bar: 'default' },
  ACTIVE:   { label: 'Active',   badge: 'bg-amber-100 text-amber-700',         bar: 'gold'    },
  ACHIEVED: { label: 'Achieved', badge: 'bg-xxm-green-100 text-xxm-green-700', bar: 'success' },
  FAILED:   { label: 'Failed',   badge: 'bg-red-100 text-red-700',             bar: 'danger'  },
}

export const TYPE_LABELS: Record<string, string> = {
  MONTHLY: 'Monthly goal',
  YEARLY:  'Yearly goal',
  CUSTOM:  'Custom goal',
}

export const ERRORS: Record<string, string> = {
  update:   'Could not update the goal. Only draft goals can be edited.',
  activate: 'Could not activate the goal.',
  lock:     'Could not lock the goal.',
  progress: 'Could not record progress. Progress can only be added to active goals, and never to the primary fund.',
  primary:  'Could not set the primary fund. Only an active goal can become the primary fund.',
}
