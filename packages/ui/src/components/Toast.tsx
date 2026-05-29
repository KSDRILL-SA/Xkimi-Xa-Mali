'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@xxm/utils'

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  variant: ToastVariant
  title: string
  description?: string
  duration?: number
}

interface ToastContextValue {
  toast: (opts: Omit<Toast, 'id'>) => void
  success: (title: string, description?: string) => void
  error:   (title: string, description?: string) => void
  warning: (title: string, description?: string) => void
  info:    (title: string, description?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const ICONS: Record<ToastVariant, React.ElementType> = {
  success: CheckCircle2,
  error:   XCircle,
  warning: AlertTriangle,
  info:    Info,
}

const STYLES: Record<ToastVariant, string> = {
  success: 'border-l-4 border-l-green-500  bg-white text-gray-800',
  error:   'border-l-4 border-l-red-500    bg-white text-gray-800',
  warning: 'border-l-4 border-l-amber-500  bg-white text-gray-800',
  info:    'border-l-4 border-l-blue-500   bg-white text-gray-800',
}

const ICON_STYLES: Record<ToastVariant, string> = {
  success: 'text-green-500',
  error:   'text-red-500',
  warning: 'text-amber-500',
  info:    'text-blue-500',
}

function ToastItem({ toast: t, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const Icon = ICONS[t.variant]
  const progressRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const duration = t.duration ?? 4500
    const el = progressRef.current
    if (el) {
      el.style.transition = `width ${duration}ms linear`
      el.style.width = '0%'
    }
    const timer = setTimeout(() => onDismiss(t.id), duration)
    return () => clearTimeout(timer)
  }, [t.id, t.duration, onDismiss])

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'relative flex items-start gap-3 px-4 py-3.5 rounded-xl shadow-xxm max-w-sm w-full overflow-hidden',
        'toast-enter',
        STYLES[t.variant],
      )}
    >
      <Icon size={18} className={cn('shrink-0 mt-0.5', ICON_STYLES[t.variant])} aria-hidden />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-snug">{t.title}</p>
        {t.description && (
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{t.description}</p>
        )}
      </div>

      <button
        onClick={() => onDismiss(t.id)}
        aria-label="Dismiss notification"
        className="shrink-0 p-0.5 rounded text-gray-400 hover:text-gray-600 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold"
      >
        <X size={14} aria-hidden />
      </button>

      {/* Progress bar */}
      <div
        ref={progressRef}
        className={cn('absolute bottom-0 left-0 h-[2px] w-full', ICON_STYLES[t.variant].replace('text-', 'bg-'))}
        style={{ width: '100%' }}
        aria-hidden
      />
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((opts: Omit<Toast, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setToasts((prev) => [...prev.slice(-4), { ...opts, id }])
  }, [])

  const success = useCallback((title: string, description?: string) =>
    toast({ variant: 'success', title, description }), [toast])
  const error   = useCallback((title: string, description?: string) =>
    toast({ variant: 'error',   title, description }), [toast])
  const warning = useCallback((title: string, description?: string) =>
    toast({ variant: 'warning', title, description }), [toast])
  const info    = useCallback((title: string, description?: string) =>
    toast({ variant: 'info',    title, description }), [toast])

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info }}>
      {children}
      {mounted &&
        createPortal(
          <div
            aria-label="Notifications"
            className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 items-end"
          >
            {toasts.map((t) => (
              <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
