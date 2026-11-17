import type { UserStats } from '@/lib/user-stats'
import {
  formatDayRange, formatHoursRough, formatMinutes, scoreRounds, splitShare,
  type Round, type WrappedExtras,
} from '@/lib/stats-wrapped'
import { Big, Kicker, PALETTE, PartsBar, hoursLabel, readableOnDark, type SectionColours } from './shared'

type Side = { stats: UserStats; extras: WrappedExtras; accent: string; name: string }

/**
 * The head-to-head Stats page — "Wrapped", you against one friend. Same
 * sections, colours and order as StatsSolo; each stat becomes a round, its
 * band split between you (bright shade, left) and them (deep shade, right),
 * sized by the result. On phones each band becomes two bars instead, since a
 * split band leaves too little room for big numbers. The final score — rounds
 * won — comes last. A round where either of you has no data (no tracker,
 * nothing finished) is left out and counts for no one.
 */
export default function StatsVersus({ me, friend }: { me: Side; friend: Side }) {
  const a = me.stats, b = friend.stats
  const ta = me.extras.tracked, tb = friend.extras.tracked
  const netA = me.extras.tickets.earned - me.extras.tickets.lost
  const netB = friend.extras.tickets.earned - friend.extras.tickets.lost
  const youDot = me.accent
  const friendDot = friend.accent
  const friendText = readableOnDark(friend.accent)
  const fname = friend.name

  const { rounds, you: youWins, friend: friendWins } = scoreRounds([
    { key: 'hours', you: Math.round(a.totalHours), friend: Math.round(b.totalHours) },
    { key: 'games', you: a.completedCount, friend: b.completedCount },
    { key: 'finish', you: a.completionRate, friend: b.completionRate },
    { key: 'most', you: ta.mostPlayed?.minutes ?? null, friend: tb.mostPlayed?.minutes ?? null },
    { key: 'session', you: ta.longestSession?.minutes ?? null, friend: tb.longestSession?.minutes ?? null },
    { key: 'streak', you: ta.streak?.days ?? null, friend: tb.streak?.days ?? null },
    { key: 'tickets', you: netA, friend: netB },
    { key: 'perfect', you: a.perfectedCount, friend: b.perfectedCount },
    { key: 'xp', you: a.profile.xp, friend: b.profile.xp },
  ])
  const round = (key: string) => rounds.find(r => r.key === key)!
  const lead = (r: Round) => (r.winner === 'you' ? 'You' : fname)
  const verdict = (r: Round, by: (diff: number) => string) =>
    r.winner === 'tie' ? 'Dead even' : `${lead(r)} ${by(r.diff)}`
  const headline = youWins > friendWins ? 'You take it' : friendWins > youWins ? `${fname} takes it` : 'A dead heat'

  const band = (r: Round, colours: SectionColours, label: string, show: (v: number) => string, by: (d: number) => string, captions?: [string | undefined, string | undefined]) =>
    r.winner == null ? null : (
      <VersusBand
        colours={colours}
        label={label}
        round={r}
        you={show(r.you!)}
        friend={show(r.friend!)}
        youCaption={captions?.[0]}
        friendCaption={captions?.[1]}
        verdict={verdict(r, by)}
        friendName={fname}
        youDot={youDot}
        friendDot={friendDot}
      />
    )

  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`

  return (
    <div className="rounded-3xl overflow-hidden text-white bg-[#0A0A0F]">
      {band(round('hours'), PALETTE.hours, 'Hours played', v => v.toLocaleString('en-GB'), d => `by ${d.toLocaleString('en-GB')}h`)}
      {band(round('games'), PALETTE.games, 'Games finished', v => String(v), d => `by ${d}`)}
      {band(round('finish'), PALETTE.finish, 'Finish rate', v => `${v}%`, d => `+${d} points`)}
      {band(round('most'), PALETTE.most, 'Most played', formatHoursRough, d => `by ${formatHoursRough(d)}`, [ta.mostPlayed?.title, tb.mostPlayed?.title])}
      {band(round('session'), PALETTE.session, 'Longest session', formatMinutes, d => `by ${formatMinutes(d)}`, [ta.longestSession?.title, tb.longestSession?.title])}
      {band(round('streak'), PALETTE.streak, 'Longest streak', days, d => `by ${days(d)}`,
        [ta.streak ? formatDayRange(ta.streak.from, ta.streak.to) : undefined, tb.streak ? formatDayRange(tb.streak.from, tb.streak.to) : undefined])}

      <VersusTickets me={me} friend={friend} netA={netA} netB={netB} round={round('tickets')} verdict={verdict(round('tickets'), d => `came out ${d} ahead`)} youDot={youDot} friendDot={friendDot} />

      <VersusHighlights a={a} b={b} fname={fname} youDot={youDot} friendDot={friendDot} />

      {band(round('perfect'), PALETTE.perfect, 'Perfectionist · games at 100%', v => String(v), d => `by ${d}`)}
      {band(round('xp'), PALETTE.xp, 'XP', v => (v >= 10000 ? `${(v / 1000).toFixed(1)}K` : v.toLocaleString('en-GB')), d => `by ${d.toLocaleString('en-GB')} XP`)}

      {/* Genres */}
      {(a.genreData[0] || b.genreData[0]) && (
        <section className="px-5 py-8 md:px-16 md:py-12 bg-[#D9F99D] text-[#14210A] grid md:grid-cols-2 gap-6 md:gap-12">
          {[{ who: 'You play', g: a.genreData }, { who: `${fname} plays`, g: b.genreData }].map(({ who, g }) => (
            <div key={who}>
              <Kicker className="mb-1.5">{who}</Kicker>
              <Big className="text-5xl md:text-[72px] uppercase break-words">{g[0]?.genre ?? '—'}</Big>
              {g.length > 1 && (
                <p className="m-0 mt-3 text-base md:text-lg font-bold text-[#3F6212]">then {g.slice(1, 3).map(x => `${x.genre} ${x.count}`).join(' · ')}</p>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Final score — always last */}
      <section className="px-5 py-10 md:px-16 md:py-14 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <Kicker className="text-zinc-400">Final score</Kicker>
          <p className="m-0 mt-2 font-display text-4xl md:text-7xl uppercase leading-none">{headline}</p>
        </div>
        <p className="m-0 font-display text-[110px] md:text-[180px] leading-[0.9] whitespace-nowrap">
          <span style={{ color: readableOnDark(me.accent) }}>{youWins}</span>
          <span className="text-zinc-600"> – </span>
          <span style={{ color: friendText }}>{friendWins}</span>
        </p>
      </section>
    </div>
  )
}

/**
 * A dot in a person's own accent colour, so you can tell who's who on any
 * band. The ring is a border — inside the dot's own box — not a box-shadow:
 * the captions truncate long game names, and that clipping cut a shadow ring
 * off at the sides.
 */
function Dot({ colour, ring }: { colour: string; ring: string }) {
  return (
    <span
      className="inline-block w-3.5 h-3.5 md:w-4 md:h-4 rounded-full shrink-0 box-border border-2"
      style={{ backgroundColor: colour, borderColor: ring }}
    />
  )
}

function VersusBand({
  colours, label, round, you, friend, youCaption, friendCaption, verdict, friendName, youDot, friendDot,
}: {
  colours: SectionColours
  label: string
  round: Round
  you: string
  friend: string
  youCaption?: string
  friendCaption?: string
  verdict: string
  friendName: string
  youDot: string
  friendDot: string
}) {
  const higher = round.higherWins ?? true
  const share = splitShare(round.you!, round.friend!, higher)
  const long = Math.max(you.length, friend.length) > 5
  const numClass = long ? 'md:text-[64px] lg:text-[96px] xl:text-[120px]' : 'md:text-[80px] lg:text-[128px] xl:text-[160px]'
  const max = Math.max(round.you!, round.friend!, 1)
  // Phone bars: the bigger value full width, the other to scale but never so
  // short its number and name won't fit on one line.
  const barWidth = (v: number) => `${Math.max(0.65, v / max) * 100}%`
  const youCap = youCaption ? `You · ${youCaption}` : 'You'
  const friendCap = friendCaption ? `${friendName} · ${friendCaption}` : friendName

  return (
    <section>
      {/* Tablet and up: one band split between you, sized by the result */}
      <div className="hidden md:flex relative min-h-[300px] lg:min-h-[340px]">
        <div className="flex flex-col justify-between p-8 lg:p-12 min-w-0" style={{ width: `${share * 100}%`, backgroundColor: colours.main, color: colours.onMain }}>
          <div className="flex items-center gap-3">
            <Kicker>{label}</Kicker>
            {round.winner === 'you' && <Ahead bg={colours.onMain} fg={colours.main} />}
          </div>
          <div className="min-w-0">
            <Big className={`whitespace-nowrap ${numClass}`}>{you}</Big>
            <p className="m-0 mt-7 text-base lg:text-lg font-bold flex items-center gap-2 truncate"><Dot colour={youDot} ring={colours.onMain} />{youCap}</p>
          </div>
        </div>
        <div className="flex-1 flex flex-col justify-between items-end text-right p-8 lg:p-12 min-w-0 text-white" style={{ backgroundColor: colours.deep }}>
          <div className="min-h-[26px]">{round.winner === 'friend' && <Ahead bg="#FFFFFF" fg={colours.deep} />}</div>
          <div className="min-w-0">
            <Big className={`whitespace-nowrap ${numClass}`}>{friend}</Big>
            <p className="m-0 mt-7 text-base lg:text-lg font-bold flex items-center justify-end gap-2 truncate">{friendCap}<Dot colour={friendDot} ring="#FFFFFF" /></p>
          </div>
        </div>
        <span className="absolute bottom-8 lg:bottom-10 -translate-x-1/2 rounded-full bg-[#0A0A0F] text-white px-4 py-2 text-sm font-bold whitespace-nowrap" style={{ left: `${share * 100}%` }}>
          {verdict}
        </span>
      </div>

      {/* Phone: two bars, the leader's full width */}
      <div className="md:hidden px-5 py-6 flex flex-col gap-2.5" style={{ backgroundColor: colours.main, color: colours.onMain }}>
        <div className="flex items-center justify-between gap-3">
          <Kicker>{label}</Kicker>
          <span className="text-xs font-bold rounded-full bg-[#0A0A0F] text-white px-2.5 py-1.5 whitespace-nowrap">{verdict}</span>
        </div>
        <Bar width={barWidth(round.you!)} bg={colours.deep} fg="#FFFFFF" value={you} who="You" dot={youDot} long={long} />
        <Bar width={barWidth(round.friend!)} bg={colours.light} fg={colours.onLight} value={friend} who={friendName} dot={friendDot} long={long} />
        {(youCaption || friendCaption) && (
          <p className="m-0 mt-0.5 text-sm font-medium">You: {youCaption ?? '—'} · {friendName}: {friendCaption ?? '—'}</p>
        )}
      </div>
    </section>
  )
}

function Ahead({ bg, fg }: { bg: string; fg: string }) {
  return <span className="text-[11px] font-bold tracking-widest rounded-md px-2 py-1" style={{ backgroundColor: bg, color: fg }}>AHEAD</span>
}

function Bar({ width, bg, fg, value, who, dot, long }: { width: string; bg: string; fg: string; value: string; who: string; dot: string; long: boolean }) {
  return (
    <div className="rounded-2xl px-4 py-2.5 flex items-baseline justify-between gap-2" style={{ width, backgroundColor: bg, color: fg }}>
      <span className={`font-display leading-none whitespace-nowrap ${long ? 'text-[40px]' : 'text-5xl'}`}>{value}</span>
      <span className="text-sm font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 min-w-0">
        <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />
        <span className="truncate">{who}</span>
      </span>
    </div>
  )
}

/** Tickets: earned and lost together, decided on net — who came out further ahead. */
function VersusTickets({
  me, friend, netA, netB, round, verdict, youDot, friendDot,
}: {
  me: Side; friend: Side; netA: number; netB: number; round: Round; verdict: string; youDot: string; friendDot: string
}) {
  const c = PALETTE.tickets
  const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)
  const ta = me.extras.tickets, tb = friend.extras.tickets
  const earnedMax = Math.max(ta.earned, tb.earned, 1)
  const lostMax = Math.max(ta.lost, tb.lost, 1)
  const w = (v: number, max: number) => `${Math.max(0.65, v / max) * 100}%`

  const half = (t: typeof ta, onDeep: boolean) => (
    <div className="grid grid-cols-2 gap-6 lg:gap-8 items-start text-left w-full">
      <div className="flex flex-col gap-2.5">
        <Big className="text-6xl lg:text-[96px] xl:text-[110px]">+{t.earned}</Big>
        <Kicker>Earned</Kicker>
        <PartsBar parts={t.earnedParts} onDeep={onDeep} />
      </div>
      <div className="flex flex-col gap-2.5">
        <Big className="text-6xl lg:text-[96px] xl:text-[110px]">−{t.lost}</Big>
        <Kicker>Lost</Kicker>
        <PartsBar parts={t.lostParts} onDeep={onDeep} />
      </div>
    </div>
  )

  return (
    <section>
      <div className="hidden md:flex relative">
        <div className="w-1/2 flex flex-col justify-between gap-8 p-8 lg:p-12" style={{ backgroundColor: c.main, color: c.onMain }}>
          <div className="flex items-center gap-3">
            <Kicker>Tickets</Kicker>
            {round.winner === 'you' && <Ahead bg={c.onMain} fg={c.main} />}
          </div>
          {half(ta, false)}
          <p className="m-0 text-base lg:text-lg font-bold flex items-center gap-2"><Dot colour={youDot} ring={c.onMain} />You · net {signed(netA)}</p>
        </div>
        <div className="flex-1 flex flex-col justify-between items-end gap-8 p-8 lg:p-12 text-white" style={{ backgroundColor: c.deep }}>
          <div className="min-h-[26px]">{round.winner === 'friend' && <Ahead bg="#FFFFFF" fg={c.deep} />}</div>
          {half(tb, true)}
          <p className="m-0 text-base lg:text-lg font-bold flex items-center gap-2">{friend.name} · net {signed(netB)}<Dot colour={friendDot} ring="#FFFFFF" /></p>
        </div>
        <span className="absolute left-1/2 bottom-8 lg:bottom-10 -translate-x-1/2 rounded-full bg-[#0A0A0F] text-white px-4 py-2 text-sm font-bold whitespace-nowrap">{verdict}</span>
      </div>

      <div className="md:hidden px-5 py-6 flex flex-col gap-2.5" style={{ backgroundColor: c.main, color: c.onMain }}>
        <div className="flex items-center justify-between gap-3">
          <Kicker>Tickets</Kicker>
          <span className="text-xs font-bold rounded-full bg-[#0A0A0F] text-white px-2.5 py-1.5 whitespace-nowrap">{verdict}</span>
        </div>
        <Kicker className="mt-2 !text-[11px]">Earned</Kicker>
        <Bar width={w(ta.earned, earnedMax)} bg={c.deep} fg="#FFFFFF" value={`+${ta.earned}`} who="You" dot={youDot} long={false} />
        <div style={{ width: w(ta.earned, earnedMax) }}><PartsBar parts={ta.earnedParts} thin /></div>
        <Bar width={w(tb.earned, earnedMax)} bg={c.light} fg={c.onLight} value={`+${tb.earned}`} who={friend.name} dot={friendDot} long={false} />
        <div style={{ width: w(tb.earned, earnedMax) }}><PartsBar parts={tb.earnedParts} thin /></div>
        <Kicker className="mt-2 !text-[11px]">Lost</Kicker>
        <Bar width={w(ta.lost, lostMax)} bg={c.deep} fg="#FFFFFF" value={`−${ta.lost}`} who="You" dot={youDot} long={false} />
        <div style={{ width: w(ta.lost, lostMax) }}><PartsBar parts={ta.lostParts} thin /></div>
        <Bar width={w(tb.lost, lostMax)} bg={c.light} fg={c.onLight} value={`−${tb.lost}`} who={friend.name} dot={friendDot} long={false} />
        <div style={{ width: w(tb.lost, lostMax) }}><PartsBar parts={tb.lostParts} thin /></div>
        <p className="m-0 mt-1 text-sm font-bold">Net: You {signed(netA)} · {friend.name} {signed(netB)}</p>
      </div>
    </section>
  )
}

/** Longest clear, quickest, best month — you and them side by side. Not a round. */
function VersusHighlights({ a, b, fname, youDot, friendDot }: { a: UserStats; b: UserStats; fname: string; youDot: string; friendDot: string }) {
  const rows = [
    {
      label: 'Longest clear', big: true,
      you: a.longestGame && { v: `${a.longestGame.hours_played}h`, sub: a.longestGame.title },
      them: b.longestGame && { v: `${b.longestGame.hours_played}h`, sub: b.longestGame.title },
    },
    {
      label: 'Quickest', big: false,
      you: a.shortestGame && { v: `${a.shortestGame.hours_played}h`, sub: a.shortestGame.title },
      them: b.shortestGame && { v: `${b.shortestGame.hours_played}h`, sub: b.shortestGame.title },
    },
    {
      label: 'Best month', big: false,
      you: a.mostProlificMonth && { v: String(a.mostProlificMonth.count), sub: `games · ${a.mostProlificMonth.label}` },
      them: b.mostProlificMonth && { v: String(b.mostProlificMonth.count), sub: `games · ${b.mostProlificMonth.label}` },
    },
  ].filter(r => r.you || r.them)
  if (rows.length === 0) return null

  const cell = (x: { v: string; sub: string } | null, big: boolean, colour?: string) => (
    <div className="min-w-0">
      <Big className={big ? 'text-5xl md:text-[96px]' : 'text-5xl md:text-[64px]'}>{x ? <span style={colour ? { color: colour } : undefined}>{x.v}</span> : '—'}</Big>
      {x && <p className="m-0 mt-1.5 text-sm md:text-lg font-bold truncate">{x.sub}</p>}
    </div>
  )

  return (
    <section className="px-5 py-8 md:px-16 md:py-14 bg-[#F5F0E6] text-[#141413] flex flex-col">
      <div className="grid grid-cols-2 md:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 md:gap-8 pb-4 md:pb-5 text-xs md:text-sm font-bold tracking-[0.25em] uppercase text-stone-600">
        <span className="hidden md:block" />
        <span className="flex items-center gap-2"><Dot colour={youDot} ring="#F5F0E6" />You</span>
        <span className="flex items-center gap-2"><Dot colour={friendDot} ring="#F5F0E6" />{fname}</span>
      </div>
      {rows.map(r => (
        <div key={r.label} className="grid grid-cols-2 md:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 md:gap-8 gap-y-2 items-start border-t-2 border-[#141413] py-5 md:py-7">
          <Kicker className="col-span-2 md:col-span-1 text-stone-600">{r.label}</Kicker>
          {cell(r.you, r.big, r.big ? '#C2410C' : undefined)}
          {cell(r.them, r.big, r.big ? '#6D28D9' : undefined)}
        </div>
      ))}
    </section>
  )
}
