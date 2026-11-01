import { describe, it, expect } from 'vitest'
import { describeKnownSoftware } from '../known-software'

describe('describeKnownSoftware', () => {
  it('recognises the software people actually mislink', () => {
    // brave.exe really was linked to a game during testing, and the agent
    // dutifully logged browsing as play time until it was spotted.
    expect(describeKnownSoftware('brave.exe')).toBe('web browser')
    expect(describeKnownSoftware('chrome.exe')).toBe('web browser')
    expect(describeKnownSoftware('discord.exe')).toBe('chat app')
  })

  it('calls out launchers, which look plausible but are not games', () => {
    expect(describeKnownSoftware('steam.exe')).toContain('launcher')
    expect(describeKnownSoftware('epicgameslauncher.exe')).toContain('launcher')
  })

  it('ignores case and surrounding space', () => {
    expect(describeKnownSoftware('  CHROME.EXE ')).toBe('web browser')
  })

  it('says nothing about anything it does not recognise', () => {
    // Silence must not imply approval — most real games land here.
    expect(describeKnownSoftware('hades.exe')).toBeNull()
    expect(describeKnownSoftware('splitfiction.exe')).toBeNull()
    expect(describeKnownSoftware('')).toBeNull()
  })
})
