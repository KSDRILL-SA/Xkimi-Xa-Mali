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
      update: {},
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

  const templates = [
    // ── SMS templates ──────────────────────────────────────────────────────
    {
      slug: 'debit-morning-warning',
      channel: 'SMS' as const,
      subject: null,
      body: 'Xkimm Xa Mali: Tonight at 20:00 we will deduct R{{amount}} for your monthly contribution. Reply DELAY to postpone.',
    },
    {
      slug: 'debit-tomorrow-warning',
      channel: 'SMS' as const,
      subject: null,
      body: 'Xkimm Xa Mali: Reminder — your delayed debit of R{{amount}} will run tomorrow ({{newDate}}). Ensure funds are available.',
    },
    {
      slug: 'debit-success',
      channel: 'SMS' as const,
      subject: null,
      body: 'Xkimm Xa Mali: R{{amount}} contribution received. Thank you, {{firstName}}!',
    },
    {
      slug: 'debit-pending',
      channel: 'SMS' as const,
      subject: null,
      body: 'Xkimm Xa Mali: Your debit of R{{amount}} is being processed. We will confirm once settled.',
    },
    {
      slug: 'overdue-reminder',
      channel: 'SMS' as const,
      subject: null,
      body: 'Xkimm Xa Mali: Your monthly contribution of R{{amount}} is still outstanding. Please pay before month-end to avoid penalties.',
    },
    {
      slug: 'payment-failed-sms',
      channel: 'SMS' as const,
      subject: null,
      body: 'Xkimm Xa Mali: Your R{{amount}} debit was declined. Please log in to resolve: {{url}}',
    },
    {
      slug: 'mandate-approved-sms',
      channel: 'SMS' as const,
      subject: null,
      body: 'Xkimm Xa Mali: Your debit order has been approved. R{{amount}} will be collected on the {{debitDay}}th of each month.',
    },
    {
      slug: 'mandate-rejected-sms',
      channel: 'SMS' as const,
      subject: null,
      body: 'Xkimm Xa Mali: Your debit order request was not approved. Please contact support for assistance.',
    },
    // ── Email templates ────────────────────────────────────────────────────
    {
      slug: 'welcome-email',
      channel: 'EMAIL' as const,
      subject: 'Welcome to Xkimm Xa Mali',
      body: 'Welcome to Xkimm Xa Mali, {{firstName}}! Your account is active.',
    },
    {
      slug: 'email-verification',
      channel: 'EMAIL' as const,
      subject: 'Verify your email — Xkimm Xa Mali',
      body: 'Please verify your email: {{url}}',
    },
    {
      slug: 'password-reset',
      channel: 'EMAIL' as const,
      subject: 'Reset your password — Xkimm Xa Mali',
      body: 'Reset your password: {{url}} (expires in 1 hour)',
    },
    {
      slug: 'payment-success-email',
      channel: 'EMAIL' as const,
      subject: 'Payment received — Xkimm Xa Mali',
      body: 'Hi {{firstName}}, your R{{amount}} contribution for {{period}} has been processed successfully.',
    },
    {
      slug: 'payment-failed-email',
      channel: 'EMAIL' as const,
      subject: 'Payment failed — Xkimm Xa Mali',
      body: 'Hi {{firstName}}, your R{{amount}} debit for {{period}} was declined. Log in to resolve: {{url}}',
    },
    {
      slug: 'overdue-reminder-email',
      channel: 'EMAIL' as const,
      subject: 'Outstanding contribution — Xkimm Xa Mali',
      body: 'Hi {{firstName}}, your R{{amount}} contribution for {{period}} is still outstanding. Please pay: {{url}}',
    },
    {
      slug: 'mandate-approved-email',
      channel: 'EMAIL' as const,
      subject: 'Debit order approved — Xkimm Xa Mali',
      body: 'Hi {{firstName}}, your debit order of R{{amount}} on the {{debitDay}}th has been approved.',
    },
    {
      slug: 'invitation-email',
      channel: 'EMAIL' as const,
      subject: 'You are invited to join Xkimm Xa Mali',
      body: 'Hi {{firstName}}, you have been invited to join Xkimm Xa Mali. Use code {{code}} to register: {{url}}',
    },
    // ── WhatsApp templates ─────────────────────────────────────────────────
    {
      slug: 'debit-warning-whatsapp',
      channel: 'WHATSAPP' as const,
      subject: null,
      body: 'Xkimm Xa Mali: Tonight at 20:00 we will deduct R{{amount}} for your monthly contribution.',
    },
    {
      slug: 'payment-success-whatsapp',
      channel: 'WHATSAPP' as const,
      subject: null,
      body: 'Xkimm Xa Mali: R{{amount}} contribution received. Thank you, {{firstName}}!',
    },
    {
      slug: 'payment-failed-whatsapp',
      channel: 'WHATSAPP' as const,
      subject: null,
      body: 'Xkimm Xa Mali: Your R{{amount}} debit was declined. Please resolve: {{url}}',
    },
  ]

  for (const template of templates) {
    await prisma.notificationTemplate.upsert({
      where: { slug: template.slug },
      update: { subject: template.subject, body: template.body },
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
