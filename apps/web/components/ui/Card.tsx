import { clsx } from 'clsx'

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={clsx('xxm-card', className)}>{children}</div>
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100">
      <div>
        <h3 className="font-semibold text-xxm-green-900">{title}</h3>
        {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={clsx('p-5', className)}>{children}</div>
}
