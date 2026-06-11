import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { detectFinancialAnomalies } from '@/services/monitoring.service'
import { writeAuditLog } from '@/services/audit.service'

export const financialAnomalyWatch = inngest.createFunction(
  { id: 'financial-anomaly-watch', name: 'Financial Anomaly Watch' },
  { cron: '0 6 * * *' }, // 08:00 SAST (UTC+2)
  async ({ step }) => {
    const anomalies = await step.run('detect', () => detectFinancialAnomalies())

    if (anomalies.length === 0) {
      return { anomalies: 0 }
    }

    await step.run('alert-admins', async () => {
      const admins = await db.user.findMany({
        where: { roles: { some: { role: { name: 'ADMIN' } } } },
        select: { id: true },
      })

      const critical = anomalies.some((a) => a.severity === 'critical')
      const body = anomalies.map((a) => `• ${a.title} — ${a.detail}`).join('\n')

      if (admins.length > 0) {
        await db.inboxMessage.createMany({
          data: admins.map((a) => ({
            userId: a.id,
            title: `${critical ? '🔴' : '⚠️'} ${anomalies.length} financial alert${anomalies.length === 1 ? '' : 's'}`,
            body,
            category: 'SYSTEM',
          })),
        })
      }

      await writeAuditLog({
        action: 'FINANCIAL_ANOMALY_DETECTED',
        entity: 'System',
        entityId: new Date().toISOString().slice(0, 7),
        payload: { anomalies },
      })

      logger.warn('Financial anomalies detected', { count: anomalies.length, anomalies })
    })

    return { anomalies: anomalies.length }
  },
)
