import { PrismaClient, RoleName } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const adminRole = await prisma.role.upsert({
    where: { name: RoleName.ADMIN },
    update: {},
    create: { name: RoleName.ADMIN },
  })

  const memberRole = await prisma.role.upsert({
    where: { name: RoleName.MEMBER },
    update: {},
    create: { name: RoleName.MEMBER },
  })

  console.log('Roles seeded:', { adminRole: adminRole.name, memberRole: memberRole.name })

  const founderEmail = process.env.FOUNDER_EMAIL
  const founderPhone = process.env.FOUNDER_PHONE
  const founderPassword = process.env.FOUNDER_PASSWORD

  if (!founderEmail || !founderPhone || !founderPassword) {
    console.log('Skipping founder seed — FOUNDER_EMAIL, FOUNDER_PHONE, FOUNDER_PASSWORD not set')
  } else {
    const passwordHash = await bcrypt.hash(founderPassword, 12)

    const founder = await prisma.user.upsert({
      where: { email: founderEmail },
      update: {
        password: passwordHash,
        loginAttempts: 0,
        lockedUntil: null,
        status: 'ACTIVE',
      },
      create: {
        email: founderEmail,
        phone: founderPhone,
        firstName: 'Kurhula',
        lastName: 'Maluleke',
        password: passwordHash,
        status: 'ACTIVE',
        emailVerified: new Date(),
        popiaConsentAt: new Date(),
        roles: {
          create: [
            { roleId: adminRole.id },
            { roleId: memberRole.id },
          ],
        },
        notificationPreference: {
          create: { sms: true, email: true, push: true, whatsapp: true },
        },
      },
    })

    console.log('Founder seeded:', founder.email)
  }

  // Idempotent: create-only, never overwrite — admins can edit template bodies in the DB
  const templates: Array<{
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
      body: 'Xkimm Xa Mali: Tonight at 20:00 we will deduct R{{amount}} for your monthly contribution.',
    },
    {
      slug: 'debit-tomorrow-warning',
      channel: 'SMS',
      subject: null,
      body: 'Xkimm Xa Mali: Reminder — your delayed debit of R{{amount}} will run tomorrow ({{newDate}}). Ensure funds are available.',
    },
    {
      slug: 'debit-success',
      channel: 'SMS',
      subject: null,
      body: 'Xkimm Xa Mali: R{{amount}} contribution received. Thank you, {{firstName}}!',
    },
    {
      slug: 'debit-pending',
      channel: 'SMS',
      subject: null,
      body: 'Xkimm Xa Mali: Your debit of R{{amount}} is being processed. We will confirm once settled.',
    },
    {
      slug: 'overdue-reminder',
      channel: 'SMS',
      subject: null,
      body: 'Xkimm Xa Mali: Your monthly contribution of R{{amount}} is still outstanding. Please pay before month-end.',
    },
    {
      slug: 'mandate-approved',
      channel: 'SMS',
      subject: null,
      body: 'Xkimm Xa Mali: Your debit order has been approved. R{{amount}} will be collected on the {{debitDay}}th of each month.',
    },
    {
      slug: 'mandate-rejected',
      channel: 'SMS',
      subject: null,
      body: 'Xkimm Xa Mali: Your debit order request was not approved. Please contact the group admin.',
    },
    // ── SMS templates (reserved — for financial mandatory events) ────────────
    {
      slug: 'payment-failed-sms',
      channel: 'SMS',
      subject: null,
      body: 'Xkimm Xa Mali: Your R{{amount}} debit was declined. Please log in to resolve: {{url}}',
    },
    {
      slug: 'account-activated',
      channel: 'SMS',
      subject: null,
      body: 'Xkimm Xa Mali: Your account is now active. Welcome, {{firstName}}! Log in at: {{url}}',
    },
    {
      slug: 'invite-created',
      channel: 'SMS',
      subject: null,
      body: 'Xkimm Xa Mali: You have been invited to join. Your invite code is {{code}}. Register at: {{url}}',
    },
    {
      slug: 'debit-declined',
      channel: 'SMS',
      subject: null,
      body: 'Xkimm Xa Mali: Your contribution debit of R{{amount}} was declined. Log in to pay manually: {{url}}',
    },
    {
      slug: 'mandate-cancelled',
      channel: 'SMS',
      subject: null,
      body: 'Xkimm Xa Mali: Your debit order has been cancelled. Please set up a new one to continue contributions.',
    },
    {
      slug: 'mandate-delayed',
      channel: 'SMS',
      subject: null,
      body: 'Xkimm Xa Mali: Your debit has been delayed to {{newDate}}. Ensure sufficient funds are available.',
    },
    {
      slug: 'goal-activated',
      channel: 'SMS',
      subject: null,
      body: 'Xkimm Xa Mali: New goal activated — {{title}}. Target: R{{targetAmount}} by {{endDate}}.',
    },
    {
      slug: 'goal-achieved',
      channel: 'SMS',
      subject: null,
      body: 'Xkimm Xa Mali: Goal achieved! {{title}} has been reached. Congratulations!',
    },
    {
      slug: 'badge-level-up',
      channel: 'SMS',
      subject: null,
      body: 'Xkimm Xa Mali: Congratulations! You have been promoted to {{tier}} status.',
    },
    {
      slug: 'badge-level-down',
      channel: 'SMS',
      subject: null,
      body: 'Xkimm Xa Mali: Your badge tier has changed to {{tier}}. Keep contributing on time to climb back up.',
    },
    {
      slug: 'badge-progress-80',
      channel: 'PUSH',
      subject: null,
      body: 'Xkimm Xa Mali: You are {{progress}}% of the way to your next badge tier. Keep it up!',
    },
    // ── Email templates ──────────────────────────────────────────────────────
    {
      slug: 'welcome',
      channel: 'EMAIL',
      subject: 'Welcome to Xkimm Xa Mali',
      body: 'Welcome to Xkimm Xa Mali, {{firstName}}! Your account is now active.',
    },
    {
      slug: 'email-verification',
      channel: 'EMAIL',
      subject: 'Verify your email — Xkimm Xa Mali',
      body: 'Hi {{firstName}}, please verify your email address: {{url}} (expires in 24 hours)',
    },
    {
      slug: 'password-reset',
      channel: 'EMAIL',
      subject: 'Reset your password — Xkimm Xa Mali',
      body: 'Hi {{firstName}}, reset your password here: {{url}} (expires in 1 hour)',
    },
    {
      slug: 'invite-created-email',
      channel: 'EMAIL',
      subject: 'You have been invited to Xkimm Xa Mali',
      body: 'Hi {{firstName}}, you have been invited to join Xkimm Xa Mali. Use code {{code}} to register: {{url}}',
    },
    {
      slug: 'debit-success-email',
      channel: 'EMAIL',
      subject: 'Contribution received — Xkimm Xa Mali',
      body: 'Hi {{firstName}}, your R{{amount}} contribution for {{period}} has been processed successfully.',
    },
    {
      slug: 'debit-declined-email',
      channel: 'EMAIL',
      subject: 'Contribution payment failed — Xkimm Xa Mali',
      body: 'Hi {{firstName}}, your R{{amount}} debit for {{period}} was declined. Please log in to resolve: {{url}}',
    },
    {
      slug: 'overdue-reminder-email',
      channel: 'EMAIL',
      subject: 'Your contribution is overdue — Xkimm Xa Mali',
      body: 'Hi {{firstName}}, your R{{amount}} contribution for {{period}} is still outstanding. Please pay: {{url}}',
    },
    {
      slug: 'payment-failed-email',
      channel: 'EMAIL',
      subject: 'Payment failed — Xkimm Xa Mali',
      body: 'Hi {{firstName}}, your R{{amount}} debit for {{period}} was declined. Log in to resolve: {{url}}',
    },
    {
      slug: 'badge-level-up-email',
      channel: 'EMAIL',
      subject: 'You have been promoted — Xkimm Xa Mali',
      body: 'Hi {{firstName}}, congratulations! Your consistent contributions have earned you {{tier}} status.',
    },
  ]

  for (const template of templates) {
    await prisma.notificationTemplate.upsert({
      where: { slug: template.slug },
      update: {},   // never overwrite — admin can edit template bodies in the DB
      create: template,
    })
  }

  console.log('Notification templates seeded:', templates.length)

  // Seed system configuration defaults
  const configs = [
    { key: 'MIN_CONTRIBUTION_AMOUNT', value: '100' },
    { key: 'MAX_LOGIN_ATTEMPTS', value: '5' },
    { key: 'LOCKOUT_DURATION_MINUTES', value: '30' },
    { key: 'INVITE_EXPIRY_DAYS', value: '7' },
    { key: 'MAX_BANK_ACCOUNTS_PER_USER', value: '3' },
    { key: 'NOTIFICATION_MAX_RETRIES', value: '3' },
    { key: 'STATEMENT_RETENTION_DAYS', value: '365' },
  ]

  for (const config of configs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: {},
      create: { ...config, updatedBy: 'system-seed' },
    })
  }

  console.log('System config seeded:', configs.length)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
