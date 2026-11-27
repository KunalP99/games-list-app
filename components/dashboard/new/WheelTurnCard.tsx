import Link from 'next/link'
import { TICKET_AWARDS } from '@/lib/constants'

const TURNS = ['spin', 'spin_reroll', 'choose'] as const
const STEP_LABEL: Record<string, string> = { spin: 'Spin', spin_reroll: 'Spin + Reroll', choose: 'Choose' }

const COPY: Record<string, { title: string; body: string; cta: string }> = {
  spin: { title: 'Spin', body: 'Spin the wheel for your next game.', cta: 'Spin the wheel' },
  spin_reroll: { title: 'Spin + Reroll', body: 'Spin, reroll once, then pick between the two.', cta: 'Spin the wheel' },
  choose: { title: 'Choose any game', body: `Pick your next game yourself, or skip the turn for +${TICKET_AWARDS.turn_skipped} tickets.`, cta: 'Pick my game' },
}

/**
 * Whose turn it is on the wheel, where it sits in the Spin → Spin + Reroll →
 * Choose cycle, and one button into it. A turn that's already underway (the
 * resumable `wheel_session`) says so instead.
 */
export default function WheelTurnCard({ turn, inProgress, lockedBy = null }: {
  turn: string
  inProgress: boolean
  /** The Main Game holding the wheel (lib/data/wheel-lock.ts): the card says so and links to it. */
  lockedBy?: { id: string; title: string } | null
}) {
  const copy = COPY[turn] ?? COPY.spin
  const current = Math.max(0, TURNS.indexOf(turn as (typeof TURNS)[number]))

  return (
    <div className="rounded-2xl bg-brand-600 text-white p-5 flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-white/80">Your wheel turn</p>
      <p className="text-2xl font-bold leading-tight">{copy.title}</p>
      <div>
        <div className="flex gap-1.5" aria-hidden>
          {TURNS.map((t, i) => (
            <span key={t} className={`h-1.5 flex-1 rounded-full ${i === current ? 'bg-white' : 'bg-white/30'}`} />
          ))}
        </div>
        <p className="mt-1.5 text-xs text-white/80">
          {TURNS.map((t, i) => (
            <span key={t}>
              {i > 0 && ' · '}
              {i === current ? <strong className="text-white">{STEP_LABEL[t]}</strong> : STEP_LABEL[t]}
            </span>
          ))}
        </p>
      </div>
      <p className="text-sm text-white/90">
        {lockedBy
          ? <>🔒 Locked until you finish or drop your Main Game, <strong className="font-semibold text-white">{lockedBy.title}</strong>.</>
          : inProgress ? 'You have a turn underway — pick up where you left off.' : copy.body}
      </p>
      <Link
        href={lockedBy ? `/games/${lockedBy.id}` : '/wheel'}
        className="mt-1 flex items-center justify-center h-11 rounded-lg bg-white text-zinc-900 text-sm font-semibold hover:bg-zinc-100 transition-colors"
      >
        {lockedBy ? `Go to ${lockedBy.title}` : inProgress ? 'Resume your turn' : copy.cta}
      </Link>
    </div>
  )
}
