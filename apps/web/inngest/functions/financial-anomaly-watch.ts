import { inngest } from '@/lib/inngest'
import { detectFinancialAnomalies } from '@/services/monitoring.service'
import { raiseOperationalAlert } from '@/services/alert.service'

export const financialAnomalyWatch = inngest.createFunction(
  { id: 'financial-anomaly-watch', name: 'Financial Anomaly Watch' },
  { cron: '0 6 * * *' }, // 08:00 SAST (UTC+2)
  async ({ step }) => {
    const anomalies = await step.run('detect', () => detectFinancialAnomalies())

    if (anomalies.length === 0) {
      return { anomalies: 0 }
    }

    await step.run('alert-admins', () => {
      // A low collection rate is money already missing; the rest are early
      // signs. Only the first is worth an SMS at 08:00, and the sweep's own
      // severities already draw that line — so it is read rather than re-made
      // here.
      const critical = anomalies.some((a) => a.severity === 'critical')

      return raiseOperationalAlert({
        code: 'FINANCIAL_ANOMALY_DETECTED',
        severity: critical ? 'critical' : 'warning',
        // Plain ASCII: a critical one is sent as an SMS, where the bullet and
        // the em dash below cost half the segment. They stay in the body, which
        // only reaches the inbox and the email.
        title: `${anomalies.length} financial alert${anomalies.length === 1 ? '' : 's'}`,
        body: anomalies.map((a) => `• ${a.title} — ${a.detail}`).join('\n'),
        entityId: new Date().toISOString().slice(0, 7),
        payload: { anomalies },
      })
    })

    return { anomalies: anomalies.length }
  },
)
