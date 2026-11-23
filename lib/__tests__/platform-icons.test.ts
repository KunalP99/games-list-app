import { describe, it, expect } from 'vitest'
import { platformIcon } from '../platform-icons'
import { PLATFORM_GROUPS } from '../../components/games/PlatformSelect'

const icon = (p: string) => {
  const k = platformIcon(p)
  return 'brand' in k ? k.brand : `drawn:${k.drawn}`
}

describe('platformIcon', () => {
  it('gives the stores and PlayStation their brand icons', () => {
    expect(['Steam', 'Epic Games', 'EA App', 'GOG', 'Ubisoft Connect', 'Battle.net', 'Itch.io', 'Rockstar Games Launcher'].map(icon))
      .toEqual(['steam', 'epic', 'ea', 'gog', 'ubisoft', 'battlenet', 'itch', 'rockstar'])
    expect(['PS1', 'PS2', 'PS3', 'PS4', 'PS5', 'PSP', 'PS Vita'].map(icon))
      .toEqual(['playstation', 'playstation', 'playstation', 'playstation', 'playstation', 'playstation', 'playstation'])
    expect(icon('PlayStation Now')).toBe('drawn:cloud')
  })

  it('draws Nintendo and Microsoft platforms (no brand icons for them)', () => {
    expect(['Nintendo Switch', 'Nintendo Switch OLED', 'Nintendo 3DS', 'Nintendo DS', 'Game Boy Advance', 'Wii U', 'GameCube', 'SNES'].map(icon))
      .toEqual(['drawn:switch', 'drawn:switch', 'drawn:dual', 'drawn:dual', 'drawn:handheld', 'drawn:remote', 'drawn:cube', 'drawn:gamepad'])
    expect(['Xbox Series X/S', 'Xbox 360', 'PC (Windows)', 'Microsoft Store', 'Game Pass (PC)', 'Xbox App (PC)'].map(icon))
      .toEqual(['drawn:gamepad', 'drawn:gamepad', 'drawn:windows', 'drawn:windows', 'drawn:windows', 'drawn:windows'])
  })

  it('handles the rest, any case and spacing', () => {
    expect(['  mac ', 'LINUX', 'Browser', 'Mobile (iOS)', 'Mobile (Android)', 'Mobile (iOS/Android)', 'Sega Saturn', 'Game Gear', 'Atari 2600', 'Amiga'].map(icon))
      .toEqual(['apple', 'linux', 'drawn:globe', 'apple', 'android', 'drawn:phone', 'sega', 'drawn:handheld', 'atari', 'commodore'])
    expect(icon('Something homebrew')).toBe('drawn:gamepad')
  })

  it('has an icon for every platform in the picker', () => {
    for (const p of PLATFORM_GROUPS.flatMap(g => g.platforms)) expect(platformIcon(p), p).toBeTruthy()
  })
})
