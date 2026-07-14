'use client'

import { useEffect, useState } from 'react'
import { WeatherMoonRegular, WeatherSunnyRegular } from '@fluentui/react-icons';
const STORAGE_KEY = 'ravenshield-theme'

export function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const isDark = stored === 'dark'
    setDark(isDark)
    document.documentElement.classList.toggle('dark', isDark)
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-foreground hover:bg-muted rounded-md transition-colors duration-200"
      aria-label="Toggle dark mode"
    >
      {dark ? <WeatherSunnyRegular className="h-4 w-4" /> : <WeatherMoonRegular className="h-4 w-4" />}
      {dark ? 'Light Mode' : 'Dark Mode'}
    </button>
  )
}
