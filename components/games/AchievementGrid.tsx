'use client'

import { useState } from 'react'
import type { RawgAchievement } from '@/lib/rawg'

const INITIAL_COUNT = 4

export default function AchievementGrid({ achievements }: { achievements: RawgAchievement[] }) {
  const [expanded, setExpanded] = useState(false)

  // Sort common first (highest % = most players = most common)
  const sorted = [...achievements].sort((a, b) => parseFloat(b.percent) - parseFloat(a.percent))
  const visible = expanded ? sorted : sorted.slice(0, INITIAL_COUNT)
  const remaining = sorted.length - INITIAL_COUNT

  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
      {visible.map((a) => {
        const pct = parseFloat(a.percent)
        const isVeryRare = pct < 5
        const isUncommon = pct >= 5 && pct < 20
        const pctColor = isVeryRare
          ? 'text-amber-500 dark:text-amber-400'
          : isUncommon
          ? 'text-blue-500 dark:text-blue-400'
          : 'text-fg-subtle'

        return (
          <div key={a.id} className="flex flex-col items-center gap-1.5">
            <div className="relative w-14 h-14 shrink-0">
              {/* Spinning border wrapper for very rare achievements */}
              {isVeryRare ? (
                <div className="rare-achievement-border p-[2px] w-full h-full rounded-xl">
                  {a.image ? (
                    <img
                      src={a.image}
                      alt={a.name}
                      title={`${a.name}${a.description ? ` — ${a.description}` : ''}`}
                      className="w-full h-full rounded-[10px] object-cover bg-surface-active block"
                    />
                  ) : (
                    <div className="w-full h-full rounded-[10px] bg-surface-active flex items-center justify-center text-2xl">
                      🏆
                    </div>
                  )}
                </div>
              ) : isUncommon ? (
                <div className="uncommon-achievement-border p-[2px] w-full h-full rounded-xl">
                  {a.image ? (
                    <img
                      src={a.image}
                      alt={a.name}
                      title={`${a.name}${a.description ? ` — ${a.description}` : ''}`}
                      className="w-full h-full rounded-[10px] object-cover bg-surface-active block"
                    />
                  ) : (
                    <div className="w-full h-full rounded-[10px] bg-surface-active flex items-center justify-center text-2xl">
                      🏆
                    </div>
                  )}
                </div>
              ) : (
                a.image ? (
                  <img
                    src={a.image}
                    alt={a.name}
                    title={`${a.name}${a.description ? ` — ${a.description}` : ''}`}
                    className="w-full h-full rounded-xl object-cover bg-surface-active border border-edge-subtle"
                  />
                ) : (
                  <div className="w-full h-full rounded-xl bg-surface-active border border-edge-subtle flex items-center justify-center text-2xl">
                    🏆
                  </div>
                )
              )}

              {/* Unlock % badge */}
              <span className={`absolute -bottom-1 -right-1 text-[9px] font-semibold tabular-nums leading-none bg-surface-base border border-edge-base rounded-full px-1 py-0.5 ${pctColor}`}>
                {pct.toFixed(0)}%
              </span>
            </div>

            <p className="text-[10px] text-fg-muted text-center leading-tight line-clamp-2 w-full px-0.5">
              {a.name}
            </p>
          </div>
        )
      })}

      {!expanded && remaining > 0 && (
        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={() => setExpanded(true)}
            className="w-14 h-14 rounded-xl border border-dashed border-edge-base bg-surface-hover hover:bg-surface-active transition-colors flex flex-col items-center justify-center gap-0.5 text-fg-muted hover:text-fg-secondary"
          >
            <span className="text-base leading-none">+{remaining}</span>
            <span className="text-[9px] leading-none">more</span>
          </button>
          <p className="text-[10px] text-fg-muted text-center leading-tight">View all</p>
        </div>
      )}

      {expanded && (
        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={() => setExpanded(false)}
            className="w-14 h-14 rounded-xl border border-dashed border-edge-base bg-surface-hover hover:bg-surface-active transition-colors flex flex-col items-center justify-center text-fg-muted hover:text-fg-secondary"
          >
            <span className="text-[10px] leading-tight text-center px-1">Show less</span>
          </button>
          <p className="text-[10px] text-transparent select-none">·</p>
        </div>
      )}
    </div>
  )
}
