'use client'

import { useEffect } from 'react'
import { applyAccentPalette } from '@/lib/accent'

export default function ThemeInitialiser({
  preference,
  accentColour,
}: {
  preference: 'light' | 'dark' | 'system'
  accentColour: string | null
}) {
  useEffect(() => {
    if (preference === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.classList.toggle('dark', prefersDark)
      localStorage.setItem('theme', prefersDark ? 'dark' : 'light')
    } else {
      document.documentElement.classList.toggle('dark', preference === 'dark')
      localStorage.setItem('theme', preference)
    }
    if (accentColour) applyAccentPalette(accentColour)
  }, [preference, accentColour])

  return null
}
