import { levelProgress } from '@/lib/achievements'
import type { UserStats } from '@/lib/user-stats'
import { formatDayRange, formatHoursRough, formatMinutes, formatSessionWhen, textOn, type WrappedExtras } from '@/lib/stats-wrapped'
import { Big, Kicker, PALETTE, PartsBar, hoursLabel } from './shared'

/**
 * The Stats page for one person — "Wrapped": a stack of full-width bands,
 * each in its own colour around one big number. The order matches the
 * head-to-head view (StatsVersus) exactly. Sections with nothing to show
 * (no tracker data, nothing completed yet) are left out rather than shown
 * empty. Never mentions anyone else: this view is only about you.
 */
export default function StatsSolo({
  stats,
  extras,
  accent,
}: {
  stats: UserStats
  extras: WrappedExtras
  accent: string
}) {
  const onAccent = textOn(accent)
  const { tracked, tickets } = extras
  const { level, percent } = levelProgress(stats.profile.xp)
  const days = Math.round(stats.totalHours / 24)
  const years = stats.gamesPerYear.slice(-6)
  const maxYear = Math.max(1, ...years.map(y => y.count))
  const stillGoing = stats.playingCount
  const finishTotal = stats.completedCount + stats.dnfCount + stillGoing
  const pct = (n: number) => (finishTotal ? `${(n / finishTotal) * 100}%` : '0%')
  const streakDays = tracked.streak ? dayNumbers(tracked.streak.from, tracked.streak.to) : []

  return (
    <div className="rounded-3xl overflow-hidden text-white bg-[#0A0A0F]">

      {/* 1. Hours */}
      <section className="px-5 py-8 md:px-16 md:py-14 flex flex-col md:flex-row md:items-end md:justify-between gap-6" style={{ backgroundColor: accent, color: onAccent }}>
        <div>
          <Kicker className="mb-2">You&apos;ve played</Kicker>
          <Big className="text-[110px] md:text-[220px]">{hoursLabel(stats.totalHours)}</Big>
          <p className="m-0 mt-5 md:mt-9 font-display text-4xl md:text-6xl uppercase leading-none">hours</p>
        </div>
        {days >= 1 && (
          <p className="m-0 md:max-w-xs text-lg md:text-2xl font-bold leading-snug">
            That&apos;s {days} straight day{days === 1 ? '' : 's'} with a controller in your hand.
          </p>
        )}
      </section>

      {/* 2. Games finished */}
      <section className="px-5 py-8 md:px-16 md:py-14 grid md:grid-cols-2 gap-8 md:items-end">
        <div>
          <Big className="text-[110px] md:text-[220px]" ><span style={{ color: accent }}>{stats.completedCount}</span></Big>
          <p className="m-0 mt-4 font-display text-4xl md:text-6xl uppercase leading-none">Games finished</p>
          {years.length > 1 && (
            <p className="m-0 mt-3 text-base md:text-lg text-zinc-400">Across {years.length} years of playing.</p>
          )}
        </div>
        {years.length > 0 && (
          <div className="flex items-end gap-2.5 md:gap-3.5 h-44 md:h-72">
            {years.map((y, i) => (
              <div key={y.year} className="flex-1 h-full flex flex-col items-center justify-end gap-1.5 md:gap-2.5">
                <span className="font-display text-xl md:text-3xl">{y.count}</span>
                <div
                  className="w-full rounded-t-lg"
                  style={{ height: `${(y.count / maxYear) * 72}%`, backgroundColor: i === years.length - 1 ? accent : '#3F3F46' }}
                />
                <span className="text-xs md:text-sm font-bold text-zinc-400">{y.year}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Finish rate */}
      {stats.completionRate != null && (
        <section className="px-5 py-8 md:px-16 md:py-14 flex flex-col gap-6" style={{ backgroundColor: PALETTE.finish.main }}>
          <div className="flex flex-col md:flex-row md:items-end gap-3 md:gap-8">
            <Big className="text-[110px] md:text-[200px]">{stats.completionRate}%</Big>
            <div className="md:pb-2">
              <p className="m-0 font-display text-4xl md:text-6xl uppercase leading-none">Finish rate</p>
              <p className="m-0 mt-2 text-lg md:text-xl font-medium">Start it, finish it.</p>
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <div className="flex h-6 md:h-9 rounded-lg overflow-hidden gap-1">
              <div style={{ width: pct(stats.completedCount), backgroundColor: '#FFFFFF' }} />
              <div style={{ width: pct(stats.dnfCount), backgroundColor: '#1E1B3A' }} />
              <div style={{ width: pct(stillGoing), backgroundColor: '#C4B5FD' }} />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm md:text-base font-bold">
              <span>■ {stats.completedCount} completed</span>
              <span style={{ color: '#1E1B3A' }}>■ {stats.dnfCount} dropped</span>
              <span style={{ color: '#EDE9FE' }}>■ {stillGoing} still going</span>
            </div>
          </div>
        </section>
      )}

      {/* 4. Most played (tracked) */}
      {tracked.mostPlayed && (
        <section className="px-5 py-8 md:px-16 md:py-14 flex flex-col md:flex-row md:items-end md:justify-between gap-6" style={{ backgroundColor: PALETTE.most.main }}>
          <div className="min-w-0">
            <Kicker className="mb-2">Most played</Kicker>
            <Big className="text-[110px] md:text-[200px]">{formatHoursRough(tracked.mostPlayed.minutes)}</Big>
            <p className="m-0 mt-4 md:mt-6 font-display text-3xl md:text-6xl uppercase leading-none break-words">on {tracked.mostPlayed.title}</p>
          </div>
          <div className="md:max-w-xs flex flex-col gap-2 md:text-right">
            <p className="m-0 text-lg md:text-2xl font-bold leading-snug">
              {Math.round(tracked.mostPlayed.share * 100)}% of all your tracked time went into one game.
            </p>
            {tracked.runnerUp && (
              <p className="m-0 text-sm md:text-base font-medium" style={{ color: PALETTE.most.light }}>
                Runner-up: {tracked.runnerUp.title} · {formatHoursRough(tracked.runnerUp.minutes)}
              </p>
            )}
          </div>
        </section>
      )}

      {/* 5. Longest session (tracked) */}
      {tracked.longestSession && (
        <section className="px-5 py-8 md:px-16 md:py-14 flex flex-col md:flex-row md:items-end md:justify-between gap-6" style={{ backgroundColor: PALETTE.session.main }}>
          <div>
            <Kicker className="mb-2">Longest session</Kicker>
            <Big className="text-[96px] md:text-[200px] whitespace-nowrap">{formatMinutes(tracked.longestSession.minutes)}</Big>
            <p className="m-0 mt-4 font-display text-3xl md:text-5xl uppercase leading-none">in one sitting</p>
          </div>
          <div className="md:max-w-sm flex flex-col gap-2 md:text-right">
            <p className="m-0 text-xl md:text-3xl font-bold leading-tight">{tracked.longestSession.title}</p>
            <p className="m-0 text-sm md:text-lg font-medium" style={{ color: PALETTE.session.light }}>
              {formatSessionWhen(tracked.longestSession.start, tracked.longestSession.end)}
            </p>
          </div>
        </section>
      )}

      {/* 6. Longest streak (tracked) */}
      {tracked.streak && (
        <section className="px-5 py-8 md:px-16 md:py-14 flex flex-col gap-7" style={{ backgroundColor: PALETTE.streak.main }}>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <Kicker className="mb-2">Longest streak</Kicker>
              <Big className="text-[96px] md:text-[200px] whitespace-nowrap">{tracked.streak.days} day{tracked.streak.days === 1 ? '' : 's'}</Big>
              <p className="m-0 mt-4 md:mt-6 font-display text-3xl md:text-6xl uppercase leading-none">in a row</p>
            </div>
            <div className="flex flex-col gap-2.5 md:items-end">
              <p className="m-0 text-base md:text-2xl font-bold">{formatDayRange(tracked.streak.from, tracked.streak.to)}</p>
              {tracked.streak.current > 0 && (
                <p className="m-0 self-start md:self-end text-sm md:text-base font-medium rounded-full px-3.5 py-2" style={{ backgroundColor: PALETTE.streak.deep }}>
                  Current streak: {tracked.streak.current} day{tracked.streak.current === 1 ? '' : 's'}
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-7 md:grid-cols-[repeat(14,minmax(0,1fr))] gap-1.5 md:gap-2">
            {streakDays.map((d, i) => (
              <div key={i} className="h-8 md:h-10 rounded-md md:rounded-lg flex items-center justify-center text-xs md:text-sm font-bold" style={{ backgroundColor: '#FECACA', color: PALETTE.streak.deep }}>
                {d}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 7. Tickets */}
      <section className="px-5 py-8 md:px-16 md:py-12 flex flex-col gap-6 md:gap-7" style={{ backgroundColor: PALETTE.tickets.main, color: PALETTE.tickets.onMain }}>
        <div className="flex items-center justify-between gap-4">
          <Kicker>Tickets</Kicker>
          <p className="m-0 text-sm md:text-lg font-bold rounded-full px-3 md:px-4 py-1.5 md:py-2" style={{ backgroundColor: PALETTE.tickets.onMain, color: PALETTE.tickets.main }}>
            {stats.profile.ticket_balance} in the bank
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-8 md:gap-16 md:items-start">
          <div className="flex flex-col gap-3">
            <Big className="text-7xl md:text-[120px]">+{tickets.earned} <span className="text-3xl md:text-5xl">earned</span></Big>
            <PartsBar parts={tickets.earnedParts} />
          </div>
          <div className="flex flex-col gap-3">
            <Big className="text-7xl md:text-[120px]">−{tickets.lost} <span className="text-3xl md:text-5xl">lost</span></Big>
            <PartsBar parts={tickets.lostParts} />
          </div>
        </div>
      </section>

      {/* 8. Highlights. Top-aligned: the three labels sit on one line and the
          numbers start level, so a caption that wraps (a long game or month)
          can't push its column out of line with the others. */}
      {stats.longestGame && (
        <section className="px-5 py-8 md:px-16 md:py-14 grid md:grid-cols-[1.4fr_1fr_1fr] gap-6 md:gap-10 items-start bg-[#F5F0E6] text-[#141413]">
          <div>
            <Kicker className="text-stone-600">Longest clear</Kicker>
            <Big className="mt-2 text-8xl md:text-[180px] text-[#C2410C]">{stats.longestGame.hours_played}h</Big>
            <p className="m-0 mt-3 text-lg md:text-3xl font-bold">{stats.longestGame.title}</p>
          </div>
          <div className="grid grid-cols-2 md:contents gap-4 items-start border-t-2 md:border-t-0 border-[#141413] pt-5 md:pt-0">
            {stats.shortestGame && (
              <div className="md:border-l-2 md:border-[#141413] md:pl-8">
                <Kicker className="text-stone-600">Quickest</Kicker>
                <Big className="mt-2 text-5xl md:text-8xl">{stats.shortestGame.hours_played}h</Big>
                <p className="m-0 mt-2 text-base md:text-xl font-bold">{stats.shortestGame.title}</p>
              </div>
            )}
            {stats.mostProlificMonth && (
              <div className="md:border-l-2 md:border-[#141413] md:pl-8">
                <Kicker className="text-stone-600">Best month</Kicker>
                <Big className="mt-2 text-5xl md:text-8xl">{stats.mostProlificMonth.count}</Big>
                <p className="m-0 mt-2 text-base md:text-xl font-bold">game{stats.mostProlificMonth.count === 1 ? '' : 's'} · {stats.mostProlificMonth.label}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 9. Perfectionist */}
      {stats.completedCount > 0 && (
        <section className="px-5 py-8 md:px-16 md:py-14 flex flex-col md:flex-row md:items-end md:justify-between gap-6" style={{ backgroundColor: PALETTE.perfect.main }}>
          <div>
            <Kicker className="mb-2">Perfectionist</Kicker>
            <Big className="text-[110px] md:text-[200px]">{stats.perfectedCount}</Big>
            <p className="m-0 mt-4 md:mt-6 font-display text-3xl md:text-6xl uppercase leading-none">game{stats.perfectedCount === 1 ? '' : 's'} at 100%</p>
          </div>
          <div className="md:max-w-md flex flex-col gap-3 md:items-end md:text-right">
            <p className="m-0 text-base md:text-2xl font-bold">
              {stats.perfectedCount > 0
                ? `That's ${Math.round((stats.perfectedCount / stats.completedCount) * 100)}% of everything you finished.`
                : 'None yet. 100% one to start the list.'}
            </p>
            {extras.perfectedTitles.length > 0 && (
              <div className="flex flex-wrap md:justify-end gap-2">
                {extras.perfectedTitles.slice(0, 3).map(t => (
                  <span key={t} className="text-xs md:text-sm font-bold rounded-full px-3 py-1.5" style={{ backgroundColor: PALETTE.perfect.deep }}>{t}</span>
                ))}
                {extras.perfectedTitles.length > 3 && (
                  <span className="text-xs md:text-sm font-bold rounded-full px-3 py-1.5" style={{ backgroundColor: PALETTE.perfect.deep }}>+{extras.perfectedTitles.length - 3} more</span>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 10. Level & XP */}
      <section className="px-5 py-8 md:px-16 md:py-12 flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-baseline gap-2 md:gap-5">
          <Big className="text-7xl md:text-[120px]">LVL {level}</Big>
          <p className="m-0 text-base md:text-xl font-medium text-zinc-400">
            {stats.profile.xp.toLocaleString('en-GB')} XP · {stats.achievementsUnlocked} achievement{stats.achievementsUnlocked === 1 ? '' : 's'}
          </p>
        </div>
        <div className="h-4 md:h-5 rounded-full bg-zinc-800 overflow-hidden">
          <div className="h-full" style={{ width: `${percent}%`, backgroundColor: accent }} />
        </div>
        <p className="m-0 text-sm md:text-base text-zinc-400">{percent}% of the way to level {level + 1}</p>
      </section>

      {/* 11. Genres */}
      {stats.genreData.length > 0 && (
        <section className="px-5 py-8 md:px-16 md:py-12 bg-[#D9F99D] text-[#14210A]">
          <Kicker className="mb-2">What you play</Kicker>
          <p className="m-0 font-display uppercase leading-[0.95]">
            <span className="text-6xl md:text-[88px]">{stats.genreData[0].genre} {stats.genreData[0].count}</span>{' '}
            <span className="text-2xl md:text-5xl text-[#3F6212]">
              {stats.genreData.slice(1, 4).map(g => `· ${g.genre} ${g.count}`).join(' ')}
            </span>
          </p>
        </section>
      )}
    </div>
  )
}

/** Day-of-month numbers for the streak's blocks, capped so a long streak doesn't become a wall. */
function dayNumbers(from: string, to: string): string[] {
  const out: string[] = []
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  for (let t = start; t <= end; t += 86_400_000) out.push(String(new Date(t).getUTCDate()))
  return out.length > 28 ? [...out.slice(0, 27), `+${out.length - 27}`] : out
}
