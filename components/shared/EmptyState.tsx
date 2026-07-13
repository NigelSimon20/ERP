import type { ElementType, ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  icon: ElementType
  title: string
  description?: string
  action?: ReactNode | { label: string; onClick: () => void }
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="bg-brand-light rounded-full p-4 mb-4">
        <Icon className="h-8 w-8 text-brand-muted" />
      </div>
      <h3 className="text-sm font-semibold text-brand-navy">{title}</h3>
      {description && <p className="text-sm text-brand-muted mt-1 max-w-xs">{description}</p>}
      {action && (
        <div className="mt-4">
          {typeof action === 'object' && 'label' in action ? (
            <Button onClick={action.onClick} className="bg-brand-red hover:bg-brand-red-dark text-white">
              {action.label}
            </Button>
          ) : (
            action
          )}
        </div>
      )}
    </div>
  )
}
