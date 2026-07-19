'use client'

import { Suspense, useState, useEffect, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useMessages } from '@/hooks/useMessages'
import { useThreadMessages } from '@/hooks/useThreadMessages'
import { cn, timeAgo, formatDateTime } from '@/lib/utils'
import { ChatRegular, SendRegular, SearchRegular, DismissRegular, PersonAddRegular } from '@fluentui/react-icons'

interface DirectoryUser { id: string; name: string; role: string }

function initialsOf(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function MessagesPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const { threads, refresh: refreshThreads } = useMessages(user?.companyId)

  const [activeUserId, setActiveUserId] = useState<string | null>(searchParams.get('with'))
  const [composeOpen, setComposeOpen] = useState(searchParams.get('compose') === '1')

  useEffect(() => {
    const withParam = searchParams.get('with')
    if (withParam) {
      setActiveUserId(withParam)
      setComposeOpen(false)
    } else if (searchParams.get('compose') === '1') {
      setComposeOpen(true)
    }
  }, [searchParams])

  const [directory, setDirectory] = useState<DirectoryUser[]>([])
  const [directoryLoaded, setDirectoryLoaded] = useState(false)
  const [directoryQuery, setDirectoryQuery] = useState('')

  useEffect(() => {
    if (!composeOpen || directoryLoaded) return
    fetch('/api/messages/directory')
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => { setDirectory(d.users ?? []); setDirectoryLoaded(true) })
      .catch(() => setDirectoryLoaded(true))
  }, [composeOpen, directoryLoaded])

  const { messages, counterpart, sending, send } = useThreadMessages(activeUserId, user?.companyId)
  const [draft, setDraft] = useState('')

  async function handleSend() {
    if (!draft.trim()) return
    const text = draft
    setDraft('')
    const ok = await send(text)
    if (ok) refreshThreads()
  }

  function selectThread(userId: string) {
    setComposeOpen(false)
    setActiveUserId(userId)
    router.replace(`/messages?with=${encodeURIComponent(userId)}`)
  }

  const filteredDirectory = useMemo(() => {
    const q = directoryQuery.trim().toLowerCase()
    if (!q) return directory
    return directory.filter((d) => d.name.toLowerCase().includes(q))
  }, [directory, directoryQuery])

  return (
    <div className="flex h-[calc(100vh-8rem)] rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Thread list */}
      <div className="w-80 flex-shrink-0 border-r border-border flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h1 className="text-sm font-semibold text-foreground">Messages</h1>
          <button
            type="button"
            onClick={() => { setComposeOpen(true); setActiveUserId(null); router.replace('/messages?compose=1') }}
            className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors"
            title="New message"
          >
            <PersonAddRegular className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-10 px-4">
              No conversations yet. Start one with the button above.
            </p>
          )}
          {threads.map((t) => (
            <button
              key={t.userId}
              onClick={() => selectThread(t.userId)}
              className={cn(
                'w-full text-left px-4 py-3 border-b border-border/60 hover:bg-muted/50 transition-colors',
                activeUserId === t.userId && !composeOpen && 'bg-primary/5'
              )}
            >
              <div className="flex items-start gap-3">
                <div className="relative flex-shrink-0">
                  <div className="h-9 w-9 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                    {initialsOf(t.name)}
                  </div>
                  <span
                    className={cn(
                      'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card',
                      t.online ? 'bg-green-500' : 'bg-muted-foreground/30'
                    )}
                    title={t.online ? 'Online' : 'Offline'}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{timeAgo(t.lastMessageAt)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {t.lastMessageFromMe && <span className="text-muted-foreground/70">You: </span>}
                    {t.lastMessage}
                  </p>
                </div>
                {t.unreadCount > 0 && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary flex-shrink-0" />}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Conversation / compose panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {composeOpen ? (
          <>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">New message</p>
              <button type="button" onClick={() => setComposeOpen(false)} className="p-1 rounded text-muted-foreground hover:text-foreground">
                <DismissRegular className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">
                <SearchRegular className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <input
                  value={directoryQuery}
                  onChange={(e) => setDirectoryQuery(e.target.value)}
                  placeholder="Search coworkers…"
                  className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredDirectory.map((u) => (
                <button
                  key={u.id}
                  onClick={() => selectThread(u.id)}
                  className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-3"
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                    {initialsOf(u.name)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{u.name}</p>
                    <p className="text-xs text-muted-foreground">{u.role.replace(/_/g, ' ')}</p>
                  </div>
                </button>
              ))}
              {directoryLoaded && filteredDirectory.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">No coworkers found</p>
              )}
            </div>
          </>
        ) : activeUserId ? (
          <>
            <div className="px-4 py-3 border-b border-border flex items-center gap-3">
              <div className="relative flex-shrink-0">
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                  {counterpart ? initialsOf(counterpart.name) : ''}
                </div>
                {counterpart && (
                  <span
                    className={cn(
                      'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card',
                      counterpart.online ? 'bg-green-500' : 'bg-muted-foreground/30'
                    )}
                    title={counterpart.online ? 'Online' : 'Offline'}
                  />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{counterpart?.name ?? '…'}</p>
                <p className="text-xs text-muted-foreground">
                  {counterpart ? (counterpart.online ? 'Online' : 'Offline') : ''}
                  {counterpart?.role ? ` · ${counterpart.role.replace(/_/g, ' ')}` : ''}
                </p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => (
                <div key={m.id} className={cn('flex', m.senderId === user?.id ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[70%] rounded-2xl px-3.5 py-2 text-sm',
                      m.senderId === user?.id ? 'bg-primary text-white rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm'
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={cn('text-[10px] mt-1', m.senderId === user?.id ? 'text-white/70' : 'text-muted-foreground')}>
                      {formatDateTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
              {messages.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-10">No messages yet. Say hello!</p>
              )}
            </div>
            <div className="p-3 border-t border-border flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="Type a message…"
                className="flex-1 px-3.5 py-2.5 text-sm bg-muted rounded-lg outline-none text-foreground placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !draft.trim()}
                className="p-2.5 rounded-lg bg-primary text-white hover:bg-brand-red-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                aria-label="Send message"
              >
                <SendRegular className="h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
            <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
              <ChatRegular className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Select a conversation or start a new one</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="flex h-[calc(100vh-8rem)] items-center justify-center text-sm text-muted-foreground">Loading messages…</div>}>
      <MessagesPageInner />
    </Suspense>
  )
}
