'use client'

import { useState, useRef, useEffect } from 'react'
import { PiRobotBold } from 'react-icons/pi'
import { FaShieldAlt } from 'react-icons/fa'
import { MdSend, MdAutoAwesome, MdClear } from 'react-icons/md'
import { RiSparkling2Fill } from 'react-icons/ri'
import { TbBrandHipchat } from 'react-icons/tb'
import { formatDateTime } from '@/lib/utils'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const STARTER_QUESTIONS = [
  'How many guards are currently active?',
  'What is our total outstanding receivables?',
  'How many open incidents do we have?',
  "What is today's attendance count?",
]

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className={`typing-dot typing-dot-${i + 1}`}
        />
      ))}
    </div>
  )
}

export default function AIHelpdeskPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function autoResize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 96)}px` // max 4 rows ≈ 96px
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: trimmed, timestamp: new Date() }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setLoading(true)

    try {
      const res = await fetch('/api/ai-helpdesk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const json = await res.json()
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: res.ok ? json.response : (json.error ?? 'Something went wrong. Please try again.'),
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: 'Network error. Please try again.', timestamp: new Date() }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-h-[800px]">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-[#0D1B2A] p-2">
            <PiRobotBold size={22} className="text-[#CC0000]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-lg font-bold text-[#0D1B2A]">Ravenshield AI Assistant</h1>
              <RiSparkling2Fill size={15} className="text-[#CC0000]" />
            </div>
            <p className="text-xs text-gray-500">Ask me anything about your company data</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors px-2 py-1.5 rounded-md hover:bg-gray-100"
            aria-label="Clear conversation"
          >
            <MdClear size={15} />
            Clear conversation
          </button>
        )}
      </div>

      {/* Message area */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div className="rounded-full bg-[#0D1B2A] p-5">
              <FaShieldAlt size={32} className="text-[#CC0000]" />
            </div>
            <div>
              <p className="font-semibold text-[#0D1B2A]">How can I help you today?</p>
              <p className="text-sm text-gray-400 mt-1">I have live access to your company data.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {STARTER_QUESTIONS.map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendMessage(q)}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-left text-gray-600 hover:border-[#25D366] hover:text-[#CC0000] hover:bg-green-50 transition-colors"
                >
                  <TbBrandHipchat size={14} className="shrink-0 text-gray-400" />
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="shrink-0 h-7 w-7 rounded-full bg-[#0D1B2A] flex items-center justify-center mt-0.5">
                    <FaShieldAlt size={12} className="text-[#CC0000]" />
                  </div>
                )}
                <div className={`max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-[#CC0000] text-white rounded-tr-sm'
                      : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
                  }`}>
                    {msg.content}
                  </div>
                  <p className="text-xs text-gray-400 px-1">{formatDateTime(msg.timestamp)}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2 justify-start">
                <div className="shrink-0 h-7 w-7 rounded-full bg-[#0D1B2A] flex items-center justify-center mt-0.5">
                  <FaShieldAlt size={12} className="text-[#CC0000]" />
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm">
                  <TypingDots />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 pt-3 bg-white">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => { setInput(e.target.value); autoResize() }}
            onKeyDown={handleKeyDown}
            placeholder="Ask about guards, sites, invoices, incidents…"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm min-h-[42px] focus:outline-none focus:ring-2 focus:ring-[#CC0000] focus:border-transparent"
            aria-label="Chat input"
          />
          <button
            type="button"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="shrink-0 h-10 w-10 rounded-xl bg-[#CC0000] hover:bg-[#AA0000] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            aria-label="Send message"
          >
            <MdSend size={18} className="text-white" />
          </button>
        </div>
        <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
          <MdAutoAwesome size={12} />
          AI-powered · Enter to send · Shift+Enter for new line
        </div>
      </div>
    </div>
  )
}
