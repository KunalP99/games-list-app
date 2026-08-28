'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

type GameEntry = { title: string; image_url: string | null; cover_image_url?: string | null }
type YearData = { year: string; count: number; games: GameEntry[] }

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: YearData }[] }) {
  if (!active || !payload?.length) return null
  const { year, games } = payload[0].payload

  return (
    <div className="bg-surface-base border border-edge-base rounded-xl shadow-lg p-3 max-w-[360px]">
      <p className="text-xs font-semibold text-fg-base mb-2.5">
        {year} — {games.length} {games.length === 1 ? 'game' : 'games'}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {games.map((g, i) => {
          const cover = g.cover_image_url ?? g.image_url
          return (
            <div key={i} className="flex flex-col items-center gap-1 w-16">
              {cover ? (
                <img
                  src={cover}
                  alt={g.title}
                  className="w-16 aspect-[3/4] rounded-lg object-cover bg-surface-active border border-edge-subtle"
                />
              ) : (
                <div className="w-16 aspect-[3/4] rounded-lg bg-surface-active border border-edge-subtle flex items-center justify-center text-xl">
                  🎮
                </div>
              )}
              <p className="text-[10px] text-fg-muted text-center leading-tight w-full truncate">{g.title}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function GamesPerYearChart({ data, accentColor }: { data: YearData[]; accentColor?: string | null }) {
  if (data.length === 0) return null

  const barColor = accentColor ?? 'rgb(var(--brand-600))'

  return (
    <div className="relative z-10">
      <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-3">Games Completed Per Year</h2>
      <div className="bg-surface-base border border-edge-base rounded-xl p-5">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={barColor} stopOpacity={1} />
              <stop offset="100%" stopColor={barColor} stopOpacity={0.65} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-edge-subtle)" vertical={false} />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 12, fill: 'var(--color-fg-muted)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12, fill: 'var(--color-fg-muted)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'var(--color-surface-hover)' }}
            wrapperStyle={{ zIndex: 50 }}
          />
          <Bar dataKey="count" fill="url(#barGradient)" radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  )
}
