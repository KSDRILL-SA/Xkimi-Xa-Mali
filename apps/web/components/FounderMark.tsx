import { Gem } from 'lucide-react'

/**
 * The Founder mark.
 *
 * Always shown *beside* the earned tier, never instead of it. The two say
 * different things — one is what you did, the other is who you are to this
 * collective — and a founder sitting at AMATEUR should show both without either
 * one being read as a correction of the other.
 *
 * A different icon family from the tier ladder on purpose. The tiers use Medal,
 * Award, Trophy and Crown, which are all "you climbed to here"; this one is not
 * a rung on that ladder and should not look like one.
 */
export function FounderMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const small = size === 'sm'

  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-full border border-xxm-gold/40 bg-xxm-gold/10 font-bold text-xxm-gold-dark shrink-0 ' +
        (small ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]')
      }
      // The icon is decorative; the word "Founder" is the accessible name, and
      // on the icon-only variant the title carries it instead.
      title="Founder of the collective"
    >
      <Gem size={small ? 9 : 11} aria-hidden />
      Founder
    </span>
  )
}
