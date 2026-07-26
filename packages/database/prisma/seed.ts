import { PrismaClient, RoleName } from '@prisma/client'
import { NOTIFICATION_TEMPLATES } from './templates.ts'
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

  // ── Member-only test user (MEMBER role, no admin) ──────────────────────────
  const memberEmail = process.env.MEMBER_EMAIL
  const memberPhone = process.env.MEMBER_PHONE
  const memberPassword = process.env.MEMBER_PASSWORD

  if (!memberEmail || !memberPhone || !memberPassword) {
    console.log('Skipping member seed — MEMBER_EMAIL, MEMBER_PHONE, MEMBER_PASSWORD not set')
  } else {
    const memberHash = await bcrypt.hash(memberPassword, 12)

    const member = await prisma.user.upsert({
      where: { email: memberEmail },
      update: {
        password: memberHash,
        loginAttempts: 0,
        lockedUntil: null,
        status: 'ACTIVE',
      },
      create: {
        email: memberEmail,
        phone: memberPhone,
        firstName: process.env.MEMBER_FIRST_NAME ?? 'Member',
        lastName: process.env.MEMBER_LAST_NAME ?? 'User',
        password: memberHash,
        status: 'ACTIVE',
        emailVerified: new Date(),
        popiaConsentAt: new Date(),
        roles: {
          create: [{ roleId: memberRole.id }],
        },
        notificationPreference: {
          create: { sms: true, email: true, push: true, whatsapp: true },
        },
      },
    })

    console.log('Member seeded:', member.email)
  }

  // Idempotent: create-only, never overwrite — admins can edit template bodies in the DB
  const templates = NOTIFICATION_TEMPLATES

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
