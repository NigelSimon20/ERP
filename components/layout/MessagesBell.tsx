'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn, timeAgo } from '@/lib/utils'
import { useMessages } from '@/hooks/useMessages'
import { useAuth } from '@/hooks/useAuth'
import { ChatRegular, EditRegular } from '@fluentui/react-icons'

function initialsOf(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

export function MessagesBell() {
  const router = useRouter()
  const { user } = useAuth()
  const { threads, totalUnread } = useMessages(user?.companyId)
  const [open, setOpen] = useState(false)

  function openThread(userId: string) {
    setOpen(false)
    router.push(`/messages?with=${encodeURIComponent(userId)}`)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative p-2 rounded-lg hover:bg-border text-muted-foreground hover:text-foreground transition-colors"
          aria-label={`Messages${totalUnread > 0 ? ` (${totalUnread} unread)` : ''}`}
        >
          <ChatRegular className="h-5 w-5" />
          {totalUnread > 0 && (
            <span className="absolute top-1 right-1 h-4 w-4 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-96 p-0 shadow-xl border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <ChatRegular className="h-4 w-4 text-primary" />
            <p className="font-semibold text-sm text-foreground">Messages</p>
            {totalUnread > 0 && (
              <span className="h-5 px-1.5 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {totalUnread}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setOpen(false); router.push('/messages?compose=1') }}
            className="flex items-center gap-1 text-xs text-primary hover:text-brand-red-dark font-medium transition-colors"
            title="New message"
          >
            <EditRegular className="h-3.5 w-3.5" />
            New
          </button>
        </div>

        <div className="max-h-[380px] overflow-y-auto">
          {threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="h-12 w-12 rounded-2xl bg-border flex items-center justify-center">
                <ChatRegular className="h-5 w-5 text-brand-muted-light" />
              </div>
              <p className="text-sm text-brand-muted-light font-medium">No messages yet</p>
            </div>
          ) : (
            threads.map((t) => (
              <button
                key={t.userId}
                type="button"
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-muted/50 transition-colors cursor-pointer',
                  t.unreadCount > 0 && 'bg-primary/5'
                )}
                onClick={() => openThread(t.userId)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                    {initialsOf(t.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-sm font-medium leading-tight text-foreground truncate">{t.name}</p>
                      <span className="text-[10px] text-brand-muted-light flex-shrink-0">{timeAgo(t.lastMessageAt)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {t.lastMessageFromMe && <span className="text-muted-foreground/70">You: </span>}
                      {t.lastMessage}
                    </p>
                  </div>
                  {t.unreadCount > 0 && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary flex-shrink-0" />}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="border-t border-border px-4 py-2.5 bg-muted/50 flex items-center justify-between">
          <button
            type="button"
            onClick={() => { setOpen(false); router.push('/messages') }}
            className="text-xs text-primary hover:text-brand-red-dark font-semibold transition-colors"
          >
            View all messages
          </button>
          <span className="text-[10px] text-brand-muted-light">Live — updates automatically</span>
        </div>
      </PopoverContent>
    </Popover>
  )
}
