import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Step {
  label: string
  description?: string
}

interface StepperProps {
  steps: Step[]
  currentStep: number
  orientation?: 'horizontal' | 'vertical'
  className?: string
}

export function Stepper({ steps, currentStep, orientation = 'horizontal', className }: StepperProps) {
  const isVertical = orientation === 'vertical'

  return (
    <nav
      aria-label="Progress"
      className={cn(
        isVertical ? 'flex flex-col gap-0' : 'flex items-start gap-0',
        className,
      )}
    >
      <ol
        className={cn(
          isVertical ? 'flex flex-col gap-0 w-full' : 'flex items-start w-full',
        )}
      >
        {steps.map((step, idx) => {
          const done   = idx < currentStep
          const active = idx === currentStep
          const future = idx > currentStep
          const isLast = idx === steps.length - 1

          return (
            <li
              key={idx}
              className={cn(
                isVertical ? 'flex gap-4 pb-6 last:pb-0' : 'flex-1 flex flex-col items-center',
              )}
              aria-current={active ? 'step' : undefined}
            >
              {/* Horizontal layout */}
              {!isVertical && (
                <>
                  <div className="flex items-center w-full">
                    {/* Connector left */}
                    {idx > 0 && (
                      <div className={cn('flex-1 h-0.5 transition-colors duration-300', done ? 'bg-xxm-green' : 'bg-xxm-gray-200')} />
                    )}

                    {/* Step bubble */}
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300',
                        done   && 'bg-xxm-green text-white',
                        active && 'bg-white border-2 border-xxm-gold text-xxm-gold shadow-gold-sm',
                        future && 'bg-xxm-gray-100 text-xxm-gray-400',
                      )}
                    >
                      {done ? <Check size={14} aria-hidden /> : idx + 1}
                    </div>

                    {/* Connector right */}
                    {!isLast && (
                      <div className={cn('flex-1 h-0.5 transition-colors duration-300', done ? 'bg-xxm-green' : 'bg-xxm-gray-200')} />
                    )}
                  </div>

                  <div className="mt-2 text-center px-1">
                    <p className={cn('text-xs font-semibold', active ? 'text-xxm-green-900' : future ? 'text-xxm-gray-400' : 'text-xxm-gray-600')}>
                      {step.label}
                    </p>
                    {step.description && (
                      <p className="text-xs text-xxm-gray-400 mt-0.5 hidden sm:block">{step.description}</p>
                    )}
                  </div>
                </>
              )}

              {/* Vertical layout */}
              {isVertical && (
                <>
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300',
                        done   && 'bg-xxm-green text-white',
                        active && 'bg-white border-2 border-xxm-gold text-xxm-gold shadow-gold-sm',
                        future && 'bg-xxm-gray-100 text-xxm-gray-400',
                      )}
                    >
                      {done ? <Check size={14} aria-hidden /> : idx + 1}
                    </div>
                    {!isLast && (
                      <div className={cn('w-0.5 flex-1 mt-1 min-h-[2rem] transition-colors duration-300', done ? 'bg-xxm-green' : 'bg-xxm-gray-200')} />
                    )}
                  </div>

                  <div className="pt-0.5">
                    <p className={cn('text-sm font-semibold', active ? 'text-xxm-green-900' : future ? 'text-xxm-gray-400' : 'text-xxm-gray-600')}>
                      {step.label}
                    </p>
                    {step.description && (
                      <p className="text-xs text-xxm-gray-400 mt-0.5">{step.description}</p>
                    )}
                  </div>
                </>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
