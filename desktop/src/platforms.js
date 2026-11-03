// Mirrors PLATFORM_GROUPS in components/games/PlatformSelect.tsx — kept as
// plain strings, not fetched from the site, since this is the one list every
// game's platform value is drawn from and the agent needs it even while
// offline (filling in the platform-confirm prompt's dropdown).

export const PLATFORM_GROUPS = [
  {
    label: 'PC & Digital',
    platforms: [
      'Steam', 'Epic Games', 'EA App', 'GOG', 'Ubisoft Connect', 'Battle.net',
      'Xbox App (PC)', 'Microsoft Store', 'Itch.io', 'Rockstar Games Launcher',
      'Amazon Luna', 'Game Pass (PC)', 'PC (Windows)', 'Mac', 'Linux', 'Browser',
    ],
  },
  {
    label: 'PlayStation',
    platforms: ['PS1', 'PS2', 'PS3', 'PS4', 'PS5', 'PSP', 'PS Vita', 'PlayStation Now'],
  },
  {
    label: 'Xbox',
    platforms: ['Xbox', 'Xbox 360', 'Xbox One', 'Xbox Series X/S', 'Xbox Game Pass'],
  },
  {
    label: 'Nintendo',
    platforms: [
      'Nintendo Switch', 'Nintendo Switch Lite', 'Nintendo Switch OLED',
      'Wii U', 'Wii', 'GameCube', 'Nintendo 64', 'SNES', 'NES', 'Virtual Boy',
      'Nintendo 3DS', 'New Nintendo 3DS', 'Nintendo DSi', 'Nintendo DS',
      'Game Boy Advance', 'Game Boy Color', 'Game Boy',
    ],
  },
  {
    label: 'Sega',
    platforms: ['Sega Dreamcast', 'Sega Saturn', 'Sega Mega Drive / Genesis', 'Sega Master System', 'Sega CD', 'Sega 32X', 'Game Gear'],
  },
  {
    label: 'Atari',
    platforms: ['Atari 2600', 'Atari 5200', 'Atari 7800', 'Atari Jaguar', 'Atari Lynx', 'Atari ST'],
  },
  {
    label: 'Other',
    platforms: [
      'Mobile (iOS)', 'Mobile (Android)', 'Mobile (iOS/Android)',
      'Arcade', 'Neo Geo', 'Neo Geo Pocket', 'TurboGrafx-16 / PC Engine',
      'Commodore 64', 'Amiga', 'Cracked', 'Other',
    ],
  },
]

/** Fill a <select> with one <optgroup> per group, selecting `current` if given. */
export function populatePlatformSelect(select, current) {
  select.innerHTML = ''
  for (const group of PLATFORM_GROUPS) {
    const optgroup = document.createElement('optgroup')
    optgroup.label = group.label
    for (const platform of group.platforms) {
      const opt = document.createElement('option')
      opt.value = platform
      opt.textContent = platform
      optgroup.appendChild(opt)
    }
    select.appendChild(optgroup)
  }
  if (current && PLATFORM_GROUPS.some(g => g.platforms.includes(current))) {
    select.value = current
  }
}
