'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { FaSearch, FaTimes, FaSpinner } from 'react-icons/fa'

interface ResultItem { id: string; label: string; sub: string; href: string }
type Results = Record<string, ResultItem[]>

export function SearchPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Results>({})
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    else { setQuery(''); setResults({}) }
  }, [open])

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults({}); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const json = await res.json()
      setResults(json.results ?? {})
    } catch { setResults({}) }
    finally { setLoading(false) }
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setQuery(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(val), 300)
  }

  function navigate(href: string) {
    setOpen(false)
    router.push(href)
  }

  const hasResults = Object.keys(results).length > 0
  const totalCount = Object.values(results).reduce((s, arr) => s + arr.length, 0)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        aria-label="Search (Ctrl+K)"
      >
        <FaSearch className="h-4 w-4" />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="hidden sm:inline text-[10px] bg-white border border-gray-300 rounded px-1 py-0.5 font-mono">⌃K</kbd>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          {loading ? (
            <FaSpinner className="h-5 w-5 text-gray-400 animate-spin shrink-0" />
          ) : (
            <FaSearch className="h-5 w-5 text-gray-400 shrink-0" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={handleChange}
            placeholder="Search guards, sites, customers, invoices…"
            className="flex-1 text-sm outline-none bg-transparent text-gray-900 placeholder:text-gray-400"
            aria-label="Search"
          />
          {query && (
            <button type="button" onClick={() => { setQuery(''); setResults({}); inputRef.current?.focus() }} aria-label="Clear search">
              <FaTimes className="h-4 w-4 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!hasResults && query.length >= 2 && !loading && (
            <p className="text-sm text-gray-400 text-center py-10">No results for &ldquo;{query}&rdquo;</p>
          )}
          {!hasResults && query.length < 2 && (
            <p className="text-xs text-gray-400 text-center py-8">Type at least 2 characters to search</p>
          )}
          {hasResults && (
            <div className="py-2">
              {Object.entries(results).map(([group, items]) => (
                <div key={group}>
                  <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    {group}
                  </p>
                  {items.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigate(item.href)}
                      className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="mt-0.5 h-2 w-2 rounded-full bg-[#CC0000] shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.label}</p>
                        {item.sub && <p className="text-xs text-gray-500 truncate">{item.sub}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              ))}
              <p className="px-4 pt-2 pb-3 text-[11px] text-gray-400 border-t border-gray-100 mt-1">
                {totalCount} result{totalCount !== 1 ? 's' : ''} · Press Esc to close
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
