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
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-200"
      aria-label="Toggle dark mode"
    >
      {dark ? <WeatherSunnyRegular className="h-5 w-5" /> : <WeatherMoonRegular className="h-5 w-5" />}
    </button>
  )
}
