import Link from 'next/link'
import LiveIndicator from '@/components/games/LiveIndicator'
import PlayCalendar from './PlayCalendar'
import GameShelf from './GameShelf'
import PlatformIcon from '@/components/games/PlatformIcon'
import RecentTimeline from './RecentTimeline'
import { PROFILE_CARDS, shelfGames, type CardGame, type CardSize, type ProfileCardData, type ProfileCardId } from '@/lib/profile-cards'

// What each profile card shows, at either size. Plain components fed by
// ProfileCardData (lib/data/profile-cards.ts), so the editor can switch a
// card's size, or add one, without going back to the server.

const hoursText = (h: number | null) =>
  h == null ? null : `${h.toLocaleString(undefined, { maximumFractionDigits: 1 })}h`

function Frame({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex h-full min-h-[150px] flex-col gap-3 rounded-2xl border border-edge-base bg-surface-base p-5 ${className}`}>
      <h2 className="text-sm font-semibold text-fg-base">{title}</h2>
      {children}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="flex flex-1 items-center text-sm text-fg-muted">{children}</p>
}

/**
 * A big number card in one colour, with a small picture of the number (a
 * ring, a bar, the week's days, the year's months). A square stacks them; a
 * half card puts the picture beside the number.
 */
function Figure({
  label, value, note, tone, square, visual, fill,
}: {
  label: string
  /** Left out when the picture carries the number itself (the finish rate's ring). */
  value?: string
  note?: string
  tone: 'ink' | 'amber' | 'orange' | 'plain'
  square: boolean
  visual?: React.ReactNode
  /** The card itself as a progress bar, 0 to 1: filling up a square, across a half card. */
  fill?: number
}) {
  const tones = {
    ink: 'bg-zinc-900 text-white dark:bg-zinc-800 border-transparent',
    amber: 'bg-amber-200 text-amber-950 dark:bg-amber-400/15 dark:text-amber-100 border-transparent',
    orange: 'bg-orange-100 text-orange-950 dark:bg-orange-400/15 dark:text-orange-100 border-transparent',
    plain: 'bg-surface-base text-fg-base border-edge-base',
  }
  const number = value != null && (
    <p className={`font-display leading-[0.9] tabular-nums ${square ? 'text-4xl sm:text-5xl' : 'text-5xl'}`}>{value}</p>
  )
  return (
    <div className={`relative isolate flex h-full flex-col gap-3 overflow-hidden rounded-2xl border ${square ? 'p-4' : 'min-h-[150px] p-5'} ${tones[tone]}`}>
      {fill != null && (
        <div
          aria-hidden
          className={`absolute -z-10 ${square ? 'inset-x-0 bottom-0 border-t-2' : 'inset-y-0 left-0 border-r-2'}`}
          style={{
            [square ? 'height' : 'width']: `${Math.max(0, Math.min(1, fill)) * 100}%`,
            backgroundColor: 'color-mix(in srgb, currentColor 14%, transparent)',
            borderColor: 'color-mix(in srgb, currentColor 35%, transparent)',
          }}
        />
      )}
      <h2 className="text-sm font-medium opacity-80">{label}</h2>
      {square && value == null ? (
        <>
          <div className="absolute inset-x-10 bottom-11 top-10 -z-10 flex items-center justify-center">{visual}</div>
          <span className="flex-1" />
        </>
      ) : square ? (
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
          {number}
          {visual}
        </div>
      ) : (
        <div className={`flex min-h-0 flex-1 items-center gap-5 ${value == null ? 'justify-center' : 'justify-between'}`}>
          {number}
          {visual && <div className={value != null ? 'w-1/2 max-w-[220px]' : 'flex h-full min-h-[96px] items-center justify-center'}>{visual}</div>}
        </div>
      )}
      {note && <p data-note className={`text-xs opacity-75 ${square && value == null ? 'text-center' : ''}`}>{note}</p>}
    </div>
  )
}

/**
 * A ring filled to `percent`, with the figure in the middle, as big as the
 * space it's given (its height decides; the figure scales with it).
 */
function Ring({ percent, children }: { percent: number; children: React.ReactNode }) {
  const r = 44
  const length = 2 * Math.PI * r
  return (
    <div className="relative aspect-square h-full max-w-full" style={{ containerType: 'inline-size' }}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth="8" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${(Math.max(0, Math.min(100, percent)) / 100) * length} ${length}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display leading-none tabular-nums" style={{ fontSize: '26cqw' }}>
        {children}
      </span>
    </div>
  )
}

const WEEKDAYS = 'SMTWTFS'

function GameRow({ game, aside }: { game: CardGame; aside?: React.ReactNode }) {
  return (
    <Link href={`/games/${game.id}`} className="flex items-center gap-3 rounded-xl bg-surface-sunken p-2 hover:bg-surface-hover transition-colors">
      {game.cover
        ? <img src={game.cover} alt="" className="h-14 w-10 shrink-0 rounded-md object-cover" />
        : <span className="h-14 w-10 shrink-0 rounded-md bg-surface-hover" aria-hidden />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-fg-base">{game.title}</span>
        {aside && <span className="block truncate text-xs text-fg-muted">{aside}</span>}
      </span>
    </Link>
  )
}

function PlayingTile({ game, big }: { game: CardGame & { liveSince: string | null }; big: boolean }) {
  return (
    <Link
      href={`/games/${game.id}`}
      className={`relative flex flex-col justify-end overflow-hidden rounded-xl bg-zinc-800 p-4 text-white ${big ? 'min-h-[170px] sm:col-span-2' : 'min-h-[170px]'}`}
    >
      {game.wide && (
        <img src={game.wide} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" aria-hidden />
      {game.liveSince && (
        <span className="absolute left-3 top-3 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold">
          <LiveIndicator startedAt={game.liveSince} dark />
        </span>
      )}
      <span className="relative block truncate text-base font-bold">{game.title}</span>
      {game.hours != null && <span className="relative text-xs text-white/85">{hoursText(game.hours)} played</span>}
    </Link>
  )
}

const MONTHS = 'JFMAMJJASOND'
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function CardBody({
  card, size, data, accent, chosen,
}: {
  card: ProfileCardId
  size: CardSize
  data: ProfileCardData
  accent: string
  /** The Game shelf's chosen games (layout item `games`). */
  chosen?: string[]
}) {
  const full = size === 'full'
  const square = size === 'small'
  const title = PROFILE_CARDS[card].name

  switch (card) {
    case 'playing': {
      const games = data.playing ?? []
      return (
        <Frame title={title}>
          {games.length === 0 ? <Empty>Nothing in Playing right now.</Empty> : full ? (
            <div className="grid gap-3 sm:grid-cols-4">
              {games.slice(0, 3).map((g, i) => <PlayingTile key={g.id} game={g} big={i === 0} />)}
            </div>
          ) : (
            <div className="space-y-2">
              {games.slice(0, 3).map(g => (
                <GameRow
                  key={g.id}
                  game={g}
                  aside={g.liveSince ? <LiveIndicator startedAt={g.liveSince} /> : hoursText(g.hours) && `${hoursText(g.hours)} played`}
                />
              ))}
            </div>
          )}
        </Frame>
      )
    }
    case 'recently_completed': {
      const games = data.recently_completed ?? []
      return (
        <Frame title={title}>
          {games.length === 0
            ? <Empty>No completed games yet.</Empty>
            : <RecentTimeline games={games} accent={accent} full={full} />}
        </Frame>
      )
    }
    case 'up_next': {
      const games = data.up_next ?? []
      return (
        <Frame title={title}>
          {games.length === 0
            ? <Empty>The backlog is empty.</Empty>
            : (
              <div className={full ? 'grid gap-2 sm:grid-cols-3' : 'space-y-2'}>
                {games.slice(0, 3).map(g => <GameRow key={g.id} game={g} />)}
              </div>
            )}
        </Frame>
      )
    }
    case 'year': {
      const year = data.year
      const max = Math.max(1, ...(year?.bars.map(b => b.minutes) ?? [0]))
      return (
        <Frame title={title}>
          {!year || year.totalMinutes === 0 ? <Empty>No tracked play in the last 12 months.</Empty> : (
            <>
              <p className="text-xs text-fg-muted">
                <span className="font-display text-3xl leading-[0.9] text-fg-base tabular-nums">{Math.round(year.totalMinutes / 60).toLocaleString()}h</span>
                {' '}in the last 12 months
              </p>
              <div className="flex h-28 items-end gap-1.5" role="img" aria-label="Tracked hours each month">
                {year.bars.map(bar => (
                  <div key={bar.start} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <div
                      className="w-full rounded-t-md"
                      style={{ height: `${Math.max(bar.minutes > 0 ? 4 : 2, (bar.minutes / max) * 100)}%`, backgroundColor: bar.minutes > 0 ? accent : 'rgba(127,127,127,0.25)' }}
                      title={`${Math.round(bar.minutes / 6) / 10}h`}
                    />
                    <span className="text-[10px] text-fg-muted">{MONTHS[Number(bar.start.slice(5, 7)) - 1]}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Frame>
      )
    }
    case 'shelf':
      return <GameShelf games={shelfGames(data.shelf ?? [], chosen)} chosen={Boolean(chosen?.length)} />
    case 'calendar':
      return (
        <Frame title={title}>
          {data.calendar ? <PlayCalendar start={data.calendar.start} minutes={data.calendar.minutes} accent={accent} /> : <Empty>No tracked play yet.</Empty>}
        </Frame>
      )
    case 'finish_rate': {
      const f = data.finish_rate
      return (
        <Figure
          square={square}
          tone="ink"
          label={title}
          visual={<Ring percent={f?.rate ?? 0}>{f?.rate != null ? `${f.rate}%` : '–'}</Ring>}
          note={f && f.stopped > 0 ? `${f.completed} of ${f.stopped} finished` : 'Nothing finished or dropped yet'}
        />
      )
    }
    case 'achievements': {
      const a = data.achievements
      const unlocked = a?.unlocked ?? 0
      const total = a?.total ?? 0
      return (
        <Figure
          square={square}
          tone="amber"
          label={title}
          value={unlocked.toLocaleString()}
          fill={total > 0 ? unlocked / total : 0}
          visual={total > 0 && (
            <p className="text-xs font-medium opacity-80 tabular-nums">{unlocked} of {total} unlocked · {Math.round((unlocked / total) * 100)}%</p>
          )}
          note={`${(a?.xp ?? 0).toLocaleString()} XP earned`}
        />
      )
    }
    case 'streak': {
      const s = data.streak
      return (
        <Figure
          square={square}
          tone="orange"
          label={title}
          value={`${s?.current ?? 0} ${s?.current === 1 ? 'day' : 'days'}`}
          visual={s && (
            <div className="flex gap-1.5" role="img" aria-label={`Played on ${s.week.filter(d => d.played).length} of the last 7 days`}>
              {s.week.map(d => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                  <span className="h-5 w-full rounded-md" style={{ backgroundColor: 'currentColor', opacity: d.played ? 0.9 : 0.15 }} />
                  <span className="text-[10px] font-medium opacity-70">{WEEKDAYS[new Date(`${d.day}T12:00:00Z`).getUTCDay()]}</span>
                </div>
              ))}
            </div>
          )}
          note={s && s.best > 0 ? `Best in the last year: ${s.best} ${s.best === 1 ? 'day' : 'days'}` : 'No tracked play yet'}
        />
      )
    }
    case 'completed_this_year': {
      const c = data.completed_this_year
      const top = Math.max(1, ...(c?.months ?? [0]))
      return (
        <Figure
          square={square}
          tone="plain"
          label={title}
          value={(c?.count ?? 0).toLocaleString()}
          visual={c && (
            <div className="flex h-12 items-end gap-1" role="img" aria-label={`Completions each month of ${c.year}`}>
              {c.months.map((n, i) => (
                <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span
                    className="w-full rounded-sm"
                    title={`${MONTH_NAMES[i]}: ${n}`}
                    style={{
                      height: `${n > 0 ? Math.max(18, (n / top) * 100) : 8}%`,
                      backgroundColor: n > 0 ? accent : 'currentColor',
                      opacity: n > 0 ? 1 : i > c.month ? 0.06 : 0.15,
                    }}
                  />
                  <span className="text-[9px] leading-none opacity-60">{MONTHS[i]}</span>
                </div>
              ))}
            </div>
          )}
          note={c ? `in ${c.year}` : undefined}
        />
      )
    }
    case 'platforms': {
      const p = data.platforms
      const items = p?.top ?? []
      const total = Math.max(1, p?.total ?? 0)
      const others = Math.max(0, (p?.total ?? 0) - items.reduce((sum, i) => sum + i.count, 0))
      // The top platform in the accent, the rest in lighter steps of it.
      const shade = [1, 0.7, 0.45, 0.28]
      return (
        <Frame title={title}>
          {items.length === 0 ? <Empty>Add a platform to your games to see them here.</Empty> : (
            <div className="flex flex-1 flex-col gap-3.5">
              <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={items.map(i => `${i.name} ${Math.round((i.count / total) * 100)}%`).join(', ')}>
                {items.map((item, i) => (
                  <span key={item.name} style={{ width: `${(item.count / total) * 100}%`, backgroundColor: accent, opacity: shade[i] }} />
                ))}
                {others > 0 && <span className="bg-surface-sunken" style={{ width: `${(others / total) * 100}%` }} />}
              </div>
              <ul className="space-y-2">
                {items.map((item, i) => (
                  <li key={item.name} className="flex items-center gap-3 text-sm">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-fg-base">
                      <PlatformIcon platform={item.name} />
                    </span>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent, opacity: shade[i] }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium text-fg-base">{item.name}</span>
                    <span className="tabular-nums text-fg-base">{item.count}</span>
                    <span className="w-10 text-right text-xs tabular-nums text-fg-muted">{Math.round((item.count / total) * 100)}%</span>
                  </li>
                ))}
              </ul>
              {others > 0 && <p className="mt-auto text-xs text-fg-muted">+{others} {others === 1 ? 'game' : 'games'} on other platforms</p>}
            </div>
          )}
        </Frame>
      )
    }
    case 'genres': {
      const items = data.genres ?? []
      const top = Math.max(1, ...items.map(i => i.count))
      return (
        <Frame title={title}>
          {items.length === 0 ? <Empty>Nothing to show yet.</Empty> : (
            <ul className="space-y-2.5">
              {items.map(item => (
                <li key={item.name} className="text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="truncate text-fg-base">{item.name}</span>
                    <span className="tabular-nums text-fg-muted">{item.count}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-surface-sunken" aria-hidden>
                    <div className="h-full rounded-full" style={{ width: `${(item.count / top) * 100}%`, backgroundColor: accent }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Frame>
      )
    }
  }
}
