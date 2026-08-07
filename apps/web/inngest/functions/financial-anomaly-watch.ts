import { inngest } from '@/lib/inngest'
import { logger } from '@xxm/observability'
import { detectFinancialAnomalies } from '@/services/monitoring.service'
import { notifyAdmins } from '@/services/inbox.service'
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
      const critical = anomalies.some((a) => a.severity === 'critical')

      // Through the shared helper, which also settles a question this job used to
      // answer differently: it alerted every account holding the ADMIN role,
      // including any since suspended.
      await notifyAdmins({
        title: `${critical ? '🔴' : '⚠️'} ${anomalies.length} financial alert${anomalies.length === 1 ? '' : 's'}`,
        body: anomalies.map((a) => `• ${a.title} — ${a.detail}`).join('\n'),
      })

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
