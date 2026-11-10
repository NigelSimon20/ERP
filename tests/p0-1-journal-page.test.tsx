// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import JournalEntriesPage from '@/app/(dashboard)/finance/journal-entries/page'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('P0-1 Journal Entries page', () => {
  it('renders a row whose date is null instead of crashing the page', async () => {
    const errors: unknown[] = []
    vi.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a) })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const body = String(url).startsWith('/api/finance/journal-entries')
        ? { entries: [{ id: 'je1', reference: 'JE-IMPORT-1', date: null, description: 'Imported opening entry', status: 'POSTED', totalDebit: 100, totalCredit: 100 }], total: 1, page: 1 }
        : { accounts: [] }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    }))

    render(<JournalEntriesPage />)

    expect(await screen.findByText('JE-IMPORT-1')).toBeTruthy()
    expect(screen.getByText('Imported opening entry')).toBeTruthy()
    const row = screen.getByText('JE-IMPORT-1').closest('tr')!
    expect(row.textContent).toContain('—')
    expect(errors.filter((e) => String(e).includes('Invalid time value'))).toHaveLength(0)
  })
})
