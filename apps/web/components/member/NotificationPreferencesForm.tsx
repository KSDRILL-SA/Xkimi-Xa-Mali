'use client'

import { useState } from 'react'
import { api, ApiClientError } from '@/lib/api'
import { Switch } from '@/components/ui/Switch'
import { Alert } from '@/components/ui/Alert'

interface Prefs {
  sms: boolean
  email: boolean
  push: boolean
}

const CHANNELS: { key: keyof Prefs; label: string; description: string }[] = [
  { key: 'sms', label: 'SMS notifications', description: 'Payment warnings, confirmations, and overdue reminders' },
  { key: 'email', label: 'Email notifications', description: 'Receipts, statements, and account updates' },
  { key: 'push', label: 'Push & WhatsApp notifications', description: 'In-app alerts and WhatsApp messages (managed via the WhatsApp page)' },
]

export function NotificationPreferencesForm({ initial }: { initial: Prefs }) {
  const [prefs, setPrefs] = useState<Prefs>(initial)
  const [error, setError] = useState('')

  async function toggle(key: keyof Prefs, value: boolean) {
    const previous = prefs
    setPrefs({ ...prefs, [key]: value }) // optimistic
    setError('')
    try {
      await api.patch('/api/v1/notifications/preferences', { [key]: value })
    } catch (err) {
      setPrefs(previous) // rollback
      setError(err instanceof ApiClientError ? err.message : 'Failed to update preference')
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      {CHANNELS.map((channel) => (
        <div key={channel.key} className="flex items-center justify-between gap-4 py-2">
          <div>
            <p className="text-sm font-medium text-xxm-green-900">{channel.label}</p>
            <p className="text-xs text-xxm-gray-400">{channel.description}</p>
          </div>
          <Switch
            checked={prefs[channel.key]}
            onChange={(v) => toggle(channel.key, v)}
            label={channel.label}
          />
        </div>
      ))}
      <p className="text-xs text-xxm-gray-400 pt-2 border-t border-xxm-gray-100">
        Critical payment notifications may still be sent regardless of these settings.
      </p>
    </div>
  )
}
