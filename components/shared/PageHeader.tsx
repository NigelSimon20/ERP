import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRightRegular } from '@fluentui/react-icons';
interface Breadcrumb {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: string
  description?: string
  breadcrumbs?: Breadcrumb[]
  action?: ReactNode
  badge?: ReactNode
}

export function PageHeader({ title, description, breadcrumbs, action, badge }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-1.5 mb-1.5">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRightRegular className="h-2.5 w-2.5 text-border" />}
                {crumb.href ? (
                  <Link href={crumb.href} className="text-xs font-medium text-brand-muted-light hover:text-primary transition-colors">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-xs font-medium text-muted-foreground">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground leading-tight tracking-tight">{title}</h1>
          {badge && badge}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {action && (
        <div className="flex-shrink-0 flex items-center gap-2">{action}</div>
      )}
    </div>
  )
}
