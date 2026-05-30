import type { ReactNode } from 'react'

interface Props {
  icon: ReactNode
  title: string
  action?: ReactNode
}

export function EmptyState({ icon, title, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="size-12 text-gray-300 dark:text-gray-600">{icon}</span>
      <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
      {action}
    </div>
  )
}
