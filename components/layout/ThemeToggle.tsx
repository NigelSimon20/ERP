'use client'

import { useEffect, useState } from 'react'
import { FaSun, FaMoon } from 'react-icons/fa'

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
      className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
      aria-label="Toggle dark mode"
    >
      {dark ? <FaSun className="h-4 w-4" /> : <FaMoon className="h-4 w-4" />}
      {dark ? 'Light Mode' : 'Dark Mode'}
    </button>
  )
}
