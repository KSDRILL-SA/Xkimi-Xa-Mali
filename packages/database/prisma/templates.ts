// The notification templates every environment is seeded with.
//
// Separated from the seed script so they can be inspected without connecting to
// a database — notably by the test that holds every SMS template to the GSM-7
// alphabet, since one character outside it more than doubles what each message
// costs to send.

export const NOTIFICATION_TEMPLATES: Array<{
  slug: string
  channel: 'SMS' | 'EMAIL' | 'WHATSAPP' | 'PUSH' | 'BOTH'
  subject: string | null
  body: string
}> = [
  // ── SMS templates (active — referenced by queueNotification calls) ──────
  {
    slug: 'debit-morning-warning',
    channel: 'SMS',
    subject: null,
    // The sign-off is the brotherhood's own call — it lands harder than any
    // reminder we could write, and it is the reason members read to the end.
    body: "Xkimm Xa Mali Foundation: Tonight at 20:00 we will deduct R{{amount}} for your monthly contribution. Humesa Mali N'wa Mfenhe!",
  },
  {
    // Stronger, targeted variant sent to members with a recent failed debit —
    // the ones most likely to decline again.
    slug: 'debit-morning-warning-urgent',
    channel: 'SMS',
    subject: null,
    // Plain hyphen, not an em dash: any character outside the GSM-7 alphabet
    // forces the whole message into UCS-2, which cuts a segment from 160
    // characters to 70. That one dash was costing three segments per send.
    body: "Xkimm Xa Mali Foundation: IMPORTANT - R{{amount}} will be deducted tonight at 20:00. A recent debit failed, so please make sure funds are available today to avoid another decline. Humesa Mali N'wa Mfenhe!",
  },
  {
    // Early-payment nudge, a few days before a contribution falls due —
    // encourages a badge-boosting payment before the automatic debit.
    slug: 'contribution-due-reminder',
    channel: 'SMS',
    subject: null,
    body: 'Xkimm Xa Mali Foundation: R{{amount}} is due on {{date}}. Pay early in the app to boost your badge points and protect your streak - or relax, we will debit it automatically.',
  },
  {
    // Thanks a member for a directed extra payment toward a goal.
    slug: 'goal-payment-thanks',
    channel: 'SMS',
    subject: null,
    body: 'Xkimm Xa Mali Foundation: Thank you! Your R{{amount}} toward "{{goal}}" has been received - your badge points just got a boost.',
  },
  {
    slug: 'debit-tomorrow-warning',
    channel: 'SMS',
    subject: null,
    body: 'Xkimm Xa Mali Foundation: Reminder - your delayed debit of R{{amount}} will run tomorrow ({{newDate}}). Ensure funds are available.',
  },
  {
    slug: 'debit-success',
    channel: 'SMS',
    subject: null,
    body: 'Xkimm Xa Mali Foundation: R{{amount}} contribution received. Thank you, {{firstName}}!',
  },
  {
    slug: 'debit-pending',
    channel: 'SMS',
    subject: null,
    body: 'Xkimm Xa Mali Foundation: Your debit of R{{amount}} is being processed. We will confirm once settled.',
  },
  {
    slug: 'overdue-reminder',
    channel: 'SMS',
    subject: null,
    body: 'Xkimm Xa Mali Foundation: Your monthly contribution of R{{amount}} is still outstanding. Please pay before month-end.',
  },
  {
    slug: 'mandate-approved',
    channel: 'SMS',
    subject: null,
    body: 'Xkimm Xa Mali Foundation: Your debit order has been approved. R{{amount}} will be collected on the {{debitDay}}th of each month.',
  },
  {
    slug: 'mandate-rejected',
    channel: 'SMS',
    subject: null,
    body: 'Xkimm Xa Mali Foundation: Your debit order request was not approved. Please contact the group admin.',
  },
  // ── SMS templates (reserved — for financial mandatory events) ────────────
  {
    slug: 'payment-failed-sms',
    channel: 'SMS',
    subject: null,
    body: 'Xkimm Xa Mali Foundation: {{firstName}}, your R{{amount}} debit was declined. Please log in to pay: {{url}}',
  },
  {
    // Money leaving a member's balance after they were told it had arrived.
    // In MANDATORY_SLUGS, so it reaches a member who has SMS switched off —
    // see the `debit-declined` note below for what happens when it is not.
    // No {{reason}} here: a reason may run to 500 characters and would split
    // the message across billable parts. It points at the transactions screen,
    // which now shows the reason in full; the email carries it inline.
    slug: 'contribution-reversed-sms',
    channel: 'SMS',
    subject: null,
    body: 'Xkimm Xa Mali Foundation: {{firstName}}, your R{{amount}} payment for {{period}} has been reversed. The reason is on your transactions page: {{url}}',
  },
  {
    slug: 'account-activated',
    channel: 'SMS',
    subject: null,
    body: 'Xkimm Xa Mali Foundation: Your account is now active. Welcome, {{firstName}}! Log in at: {{url}}',
  },
  {
    slug: 'invite-created',
    channel: 'SMS',
    subject: null,
    body: 'Xkimm Xa Mali Foundation: You have been invited to join. Your invite code is {{code}}. Register at: {{url}}',
  },
  // NOTE: there is deliberately no `debit-declined` pair. A declined debit uses
  // `payment-failed-sms` / `payment-failed-email`, which are in MANDATORY_SLUGS
  // and so reach a member who has notifications switched off. A duplicate pair
  // existed here and was never sent by anything; it was removed rather than
  // wired up, because whichever one a future change picked would have been a
  // coin flip between reaching the member and not.
  {
    slug: 'mandate-cancelled',
    channel: 'SMS',
    subject: null,
    body: 'Xkimm Xa Mali Foundation: Your debit order has been cancelled. Please set up a new one to continue contributions.',
  },
  {
    slug: 'mandate-delayed',
    channel: 'SMS',
    subject: null,
    body: 'Xkimm Xa Mali Foundation: Your debit has been delayed to {{newDate}}. Ensure sufficient funds are available.',
  },
  {
    slug: 'goal-activated',
    channel: 'SMS',
    subject: null,
    body: 'Xkimm Xa Mali Foundation: New goal activated - {{title}}. Target: R{{targetAmount}} by {{endDate}}.',
  },
  {
    slug: 'goal-achieved',
    channel: 'SMS',
    subject: null,
    body: 'Xkimm Xa Mali Foundation: Goal achieved! {{title}} has been reached. Congratulations!',
  },
  {
    slug: 'badge-level-up',
    channel: 'SMS',
    subject: null,
    body: 'Xkimm Xa Mali Foundation: Congratulations! You have been promoted to {{tier}} status.',
  },
  {
    slug: 'badge-level-down',
    channel: 'SMS',
    subject: null,
    body: 'Xkimm Xa Mali Foundation: Your badge tier has changed to {{tier}}. Keep contributing on time to climb back up.',
  },
  {
    slug: 'badge-progress-80',
    channel: 'PUSH',
    subject: null,
    body: 'Xkimm Xa Mali Foundation: You are {{progress}}% of the way to your next badge tier. Keep it up!',
  },
  {
    slug: 'budget-auto-exceeded',
    channel: 'SMS',
    subject: null,
    body: 'Xkimm Xa Mali Foundation: Your R{{amount}} debit was processed. This exceeded your {{type}} budget of R{{budget}}.',
  },
  // ── Email templates ──────────────────────────────────────────────────────
  {
    slug: 'welcome',
    channel: 'EMAIL',
    subject: 'Welcome to Xkimm Xa Mali Foundation',
    body: 'Welcome to Xkimm Xa Mali Foundation, {{firstName}}! Your account is now active.',
  },
  {
    slug: 'email-verification',
    channel: 'EMAIL',
    subject: 'Verify your email — Xkimm Xa Mali Foundation',
    body: 'Hi {{firstName}}, please verify your email address: {{url}} (expires in 24 hours)',
  },
  {
    slug: 'password-reset',
    channel: 'EMAIL',
    subject: 'Reset your password — Xkimm Xa Mali Foundation',
    body: 'Hi {{firstName}}, reset your password here: {{url}} (expires in 1 hour)',
  },
  {
    slug: 'invite-created-email',
    channel: 'EMAIL',
    subject: 'You have been invited to Xkimm Xa Mali Foundation',
    body: 'Hi {{firstName}}, you have been invited to join Xkimm Xa Mali Foundation. Use code {{code}} to register: {{url}}',
  },
  {
    slug: 'debit-success-email',
    channel: 'EMAIL',
    subject: 'Contribution received — Xkimm Xa Mali Foundation',
    body: 'Hi {{firstName}}, your R{{amount}} contribution for {{period}} has been processed successfully.',
  },
  {
    slug: 'overdue-reminder-email',
    channel: 'EMAIL',
    subject: 'Your contribution is overdue — Xkimm Xa Mali Foundation',
    body: 'Hi {{firstName}}, your R{{amount}} contribution for {{period}} is still outstanding. Please pay: {{url}}',
  },
  {
    slug: 'payment-failed-email',
    channel: 'EMAIL',
    subject: 'Payment failed — Xkimm Xa Mali Foundation',
    body: 'Hi {{firstName}}, your R{{amount}} debit for {{period}} was declined. Log in to resolve: {{url}}',
  },
  {
    // The reversing entry, explained. Says plainly that nothing was deleted —
    // that is the guide's promise about how a mistake gets corrected here, and
    // a member seeing money disappear deserves to be told the original is
    // still on record rather than left to infer it.
    slug: 'contribution-reversed-email',
    channel: 'EMAIL',
    subject: 'A payment has been reversed — Xkimm Xa Mali Foundation',
    body: 'Hi {{firstName}}, your R{{amount}} contribution for {{period}} has been reversed by leadership. Reason given: {{reason}}. Nothing has been deleted — the original payment and the reversing entry both remain in your history. View them here: {{url}}',
  },
  {
    slug: 'badge-level-up-email',
    channel: 'EMAIL',
    subject: 'You have been promoted — Xkimm Xa Mali Foundation',
    body: 'Hi {{firstName}}, congratulations! Your consistent contributions have earned you {{tier}} status.',
  },
  {
    slug: 'budget-near-limit',
    channel: 'EMAIL',
    subject: 'Approaching your budget limit — Xkimm Xa Mali Foundation',
    body: "Hi {{firstName}}, you've used {{percentage}}% of your monthly budget of R{{budget}}.",
  },
]
