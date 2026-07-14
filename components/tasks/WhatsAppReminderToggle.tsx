'use client'

import { format } from 'date-fns'
import { Switch } from '@/components/ui/switch'
import { ChatRegular, ClockRegular, WarningRegular } from '@fluentui/react-icons';

interface Props {
  value: boolean
  reminderTime: Date | null
  onToggle: (v: boolean) => void
  onTimeChange: (d: Date | null) => void
  assigneeWhatsApp: string | null
}

export function WhatsAppReminderToggle({ value, reminderTime, onToggle, onTimeChange, assigneeWhatsApp }: Props) {
  const datetimeValue = reminderTime ? format(reminderTime, "yyyy-MM-dd'T'HH:mm") : ''

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChatRegular fontSize={18} className="text-[#25D366]" />
          <span className="text-sm font-medium">WhatsApp Reminder</span>
        </div>
        <Switch checked={value} onCheckedChange={onToggle} />
      </div>

      {value && (
        <div className="mt-3 space-y-2 pl-6 border-l-2 border-[#25D366]">
          {!assigneeWhatsApp && (
            <p className="text-amber-600 text-sm flex items-center gap-1">
              <WarningRegular fontSize={15} />
              Assignee has no WhatsApp number on file. Add it in their profile to enable reminders.
            </p>
          )}
          <label className="text-xs text-muted-foreground flex items-center gap-1">
            <ClockRegular fontSize={13} /> Reminder Date &amp; Time
          </label>
          <input
            type="datetime-local"
            aria-label="Reminder date and time"
            value={datetimeValue}
            onChange={(e) => onTimeChange(e.target.value ? new Date(e.target.value) : null)}
            className="w-full rounded-md border border-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]"
          />
          <p className="text-xs text-brand-muted-light flex items-center gap-1">
            <ChatRegular fontSize={12} className="text-[#25D366]" />
            Will be sent to {assigneeWhatsApp ?? 'assignee'} via WhatsApp
          </p>
        </div>
      )}
    </div>
  )
}
