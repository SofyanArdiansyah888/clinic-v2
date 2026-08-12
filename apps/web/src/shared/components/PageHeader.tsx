import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn'

type PageHeaderProps = {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 border-b border-slate-200 pb-2 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 self-start">{actions}</div> : null}
    </div>
  )
}

export function PageHeaderAction(props: ComponentProps<typeof Button>) {
  return <Button {...props} />
}
