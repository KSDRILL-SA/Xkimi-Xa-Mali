import { Prisma } from '@prisma/client'
import type { NotifChannel } from '@prisma/client'
import { db } from '@/lib/db'

// Queues a notification for delivery (actual send happens in M07 email/SMS workers).
// Soft-fails when the template slug doesn't exist — templates are seeded in M07,
// so calls from job functions before seeding must not crash the job.
export async function queueNotification(params: {
  userId: string
  templateSlug: string
  channel: NotifChannel
  payload: Record<string, unknown>
}): Promise<void> {
  const template = await db.notificationTemplate.findUnique({
    where: { slug: params.templateSlug },
  })

  if (!template) return

  await db.notification.create({
    data: {
      userId: params.userId,
      templateId: template.id,
      channel: params.channel,
      status: 'QUEUED',
      payload: params.payload as Prisma.InputJsonValue,
    },
  })
}
