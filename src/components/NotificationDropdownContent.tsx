import { CheckCheck } from 'lucide-react'
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from './ui/dropdown-menu'
import type { AppNotification } from '../types'

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function NotificationDropdownContent({
  notifications,
  unreadCount,
  onMarkAllRead,
  onSelect,
}: {
  notifications: AppNotification[]
  unreadCount: number
  onMarkAllRead: () => void
  onSelect: (n: AppNotification) => void
}) {
  return (
    <>
      <div className="flex items-center justify-between px-2 py-1.5">
        <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
        {unreadCount > 0 && (
          <button
            onClick={onMarkAllRead}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <CheckCheck className="size-3.5" />
            Mark all read
          </button>
        )}
      </div>
      <DropdownMenuSeparator />
      {notifications.length === 0 ? (
        <p className="px-2 py-4 text-center text-sm text-muted-foreground">
          You're all caught up.
        </p>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          {notifications.map((n) => (
            <DropdownMenuItem
              key={n.id}
              onSelect={() => onSelect(n)}
              className="flex-col items-start gap-0.5 whitespace-normal py-2"
            >
              <div className="flex w-full items-center gap-2">
                {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                <span className={`text-sm ${n.read ? 'font-normal' : 'font-medium'}`}>{n.title}</span>
              </div>
              <p className="pl-3.5 text-xs text-muted-foreground">{n.body}</p>
              <p className="pl-3.5 text-xs text-muted-foreground/70">{timeAgo(n.created_at)}</p>
            </DropdownMenuItem>
          ))}
        </div>
      )}
    </>
  )
}
