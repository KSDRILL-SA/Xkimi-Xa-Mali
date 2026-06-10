interface AuthHeadingProps {
  title: string
  subtitle?: string
  centered?: boolean
}

export function AuthHeading({ title, subtitle, centered }: AuthHeadingProps) {
  return (
    <div className={`mb-6 animate-fade-in-up ${centered ? 'text-center' : ''}`}>
      <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-xxm-green-900">
        {title}
      </h1>
      {subtitle && <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{subtitle}</p>}
    </div>
  )
}
