import { PrismaClient, RoleName } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Seed roles
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

  // Seed founder (admin + member dual role)
  // Update FOUNDER_EMAIL / FOUNDER_PHONE / FOUNDER_PASSWORD in your .env.local before seeding
  const founderEmail = process.env.FOUNDER_EMAIL
  const founderPhone = process.env.FOUNDER_PHONE
  const founderPassword = process.env.FOUNDER_PASSWORD

  if (!founderEmail || !founderPhone || !founderPassword) {
    console.log('Skipping founder seed — FOUNDER_EMAIL, FOUNDER_PHONE, FOUNDER_PASSWORD not set')
    return
  }

  const passwordHash = await bcrypt.hash(founderPassword, 12)

  const founder = await prisma.user.upsert({
    where: { email: founderEmail },
    update: {},
    create: {
      email: founderEmail,
      phone: founderPhone,
      firstName: 'Kurhula',
      lastName: 'Maluleke',
      status: 'ACTIVE',
      roles: {
        create: [
          { roleId: adminRole.id },
          { roleId: memberRole.id },
        ],
      },
    },
  })

  console.log('Founder seeded:', founder.email)

  // Seed notification templates
  const templates = [
    {
      slug: 'morning-warning-sms',
      channel: 'SMS' as const,
      body: 'Xkimm Xa Mali: Tonight at 20:00 we will deduct R{{amount}} for your {{month}} contribution. Reply DELAY to postpone.',
    },
    {
      slug: 'payment-success-sms',
      channel: 'SMS' as const,
      body: 'Xkimm Xa Mali: R{{amount}} contribution for {{month}} received. Thank you, {{firstName}}!',
    },
    {
      slug: 'payment-failed-sms',
      channel: 'SMS' as const,
      body: 'Xkimm Xa Mali: Your R{{amount}} debit for {{month}} was declined. Please log in to resolve: {{url}}',
    },
    {
      slug: 'overdue-reminder-sms',
      channel: 'SMS' as const,
      body: 'Xkimm Xa Mali: Your {{month}} contribution of R{{amount}} is still outstanding. Please pay before month-end.',
    },
    {
      slug: 'welcome-email',
      channel: 'EMAIL' as const,
      body: 'Welcome to Xkimm Xa Mali, {{firstName}}! Your account is ready.',
    },
    {
      slug: 'email-verification',
      channel: 'EMAIL' as const,
      body: 'Please verify your email: {{url}}',
    },
    {
      slug: 'password-reset',
      channel: 'EMAIL' as const,
      body: 'Reset your password: {{url}} (expires in 1 hour)',
    },
    {
      slug: 'payment-success-email',
      channel: 'EMAIL' as const,
      body: 'Hi {{firstName}}, your R{{amount}} contribution for {{month}} has been processed successfully.',
    },
  ]

  for (const template of templates) {
    await prisma.notificationTemplate.upsert({
      where: { slug: template.slug },
      update: {},
      create: template,
    })
  }

  console.log('Notification templates seeded:', templates.length)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
