'use client'

import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  PieChart, Pie, Cell, Tooltip, Legend,
} from 'recharts'

type GenreEntry = { genre: string; count: number }
type PlatformEntry = { platform: string; count: number }

const PLATFORM_COLORS: Record<string, string> = {
  // PC & Digital
  'Steam':                       '#0c3c73',
  'Epic Games':                  '#2F2D2E',
  'EA App':                      '#FF4545',
  'GOG':                         '#C10DE4',
  'Ubisoft Connect':             '#000000',
  'Battle.net':                  '#148EFF',
  'Xbox App (PC)':               '#107C11',
  'Microsoft Store':             '#0078D7',
  'Itch.io':                     '#FA5C5C',
  'Rockstar Games Launcher':     '#FFAB00',
  'Amazon Luna':                 '#00A8E8',
  'Game Pass (PC)':              '#107C10',
  'PC (Windows)':                '#0078D7',
  'Mac':                         '#636366',
  'Linux':                       '#E95420',
  'Browser':                     '#4285F4',
  // PlayStation
  'PS1':                         '#0070D1',
  'PS2':                         '#665cbe',
  'PS3':                         '#000000',
  'PS4':                         '#003791',
  'PS5':                         '#003791',
  'PSP':                         '#003791',
  'PS Vita':                     '#003791',
  'PlayStation Now':             '#003791',
  // Xbox
  'Xbox':                        '#107C11',
  'Xbox 360':                    '#107C11',
  'Xbox One':                    '#107C11',
  'Xbox Series X/S':             '#107C10',
  'Xbox Game Pass':              '#107C10',
  // Nintendo
  'Nintendo Switch':             '#E70009',
  'Nintendo Switch Lite':        '#E70009',
  'Nintendo Switch OLED':        '#E70009',
  'Wii U':                       '#009AC7',
  'Wii':                         '#C0C0C0',
  'GameCube':                    '#6A0DAD',
  'Nintendo 64':                 '#003B8E',
  'SNES':                        '#9B59B6',
  'NES':                         '#E60012',
  'Virtual Boy':                 '#CC0000',
  'Nintendo 3DS':                '#CC0000',
  'New Nintendo 3DS':            '#CC0000',
  'Nintendo DSi':                '#555555',
  'Nintendo DS':                 '#555555',
  'Game Boy Advance':            '#8B6DD8',
  'Game Boy Color':              '#8B6DD8',
  'Game Boy':                    '#8B956D',
  // Sega
  'Sega Dreamcast':              '#FF6B00',
  'Sega Saturn':                 '#1B64B3',
  'Sega Mega Drive / Genesis':   '#1B64B3',
  'Sega Master System':          '#1B64B3',
  'Sega CD':                     '#1B64B3',
  'Sega 32X':                    '#1B64B3',
  'Game Gear':                   '#1B64B3',
  // Atari
  'Atari 2600':                  '#E0252A',
  'Atari 5200':                  '#E0252A',
  'Atari 7800':                  '#E0252A',
  'Atari Jaguar':                '#E0252A',
  'Atari Lynx':                  '#E0252A',
  'Atari ST':                    '#E0252A',
  // Other
  'Mobile (iOS)':                '#007AFF',
  'Mobile (Android)':            '#3DDC84',
  'Mobile (iOS/Android)':        '#007AFF',
  'Arcade':                      '#FF6B00',
  'Neo Geo':                     '#CC0000',
  'Neo Geo Pocket':              '#CC0000',
  'TurboGrafx-16 / PC Engine':   '#CC6600',
  'Commodore 64':                '#4169E1',
  'Amiga':                       '#AA0000',
  'Cracked':                     '#fe7eff',
  'Other':                       '#888888',
}

const FALLBACK_COLOR = '#888888'

const PLATFORM_COLORS_LOWER: Record<string, string> = Object.fromEntries(
  Object.entries(PLATFORM_COLORS).map(([k, v]) => [k.toLowerCase(), v])
)

function getPlatformColor(platform: string): string {
  return PLATFORM_COLORS[platform] ?? PLATFORM_COLORS_LOWER[platform.toLowerCase()] ?? FALLBACK_COLOR
}

function PlatformTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface-base border border-edge-base rounded-lg shadow-lg px-3 py-2 text-xs text-fg-secondary">
      {payload[0].name}: <span className="font-semibold text-fg-base">{payload[0].value}</span>
    </div>
  )
}

export default function GenreAndPlatformCharts({
  genreData,
  platformData,
}: {
  genreData: GenreEntry[]
  platformData: PlatformEntry[]
}) {
  const hasGenres = genreData.length > 0
  const hasPlatforms = platformData.length > 0
  if (!hasGenres && !hasPlatforms) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Radar — genres */}
      {hasGenres && (
        <div className="bg-surface-base border border-edge-base rounded-xl p-5">
          <p className="text-xs text-fg-muted font-medium uppercase tracking-wider mb-3">Genres Played</p>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={genreData} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
              <PolarGrid stroke="var(--color-edge-base)" />
              <PolarAngleAxis
                dataKey="genre"
                tick={{ fontSize: 10, fill: 'var(--color-fg-muted)' }}
              />
              <Radar
                dataKey="count"
                stroke="rgb(var(--brand-600))"
                fill="rgb(var(--brand-600))"
                fillOpacity={0.25}
                strokeWidth={1.5}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Pie — platforms */}
      {hasPlatforms && (
        <div className="bg-surface-base border border-edge-base rounded-xl p-5">
          <p className="text-xs text-fg-muted font-medium uppercase tracking-wider mb-3">Platforms</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={platformData}
                dataKey="count"
                nameKey="platform"
                cx="50%"
                cy="45%"
                outerRadius={70}
                strokeWidth={0}
              >
                {platformData.map((entry, i) => (
                  <Cell key={i} fill={getPlatformColor(entry.platform)} />
                ))}
              </Pie>
              <Tooltip content={<PlatformTooltip />} />
              <Legend
                iconType="circle"
                iconSize={7}
                formatter={(value) => (
                  <span style={{ fontSize: '11px', color: 'var(--color-fg-muted)' }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
