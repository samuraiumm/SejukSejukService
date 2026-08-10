import { Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../hooks/useNotifications'
import { Button } from './ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from './ui/dropdown-menu'
import { NotificationDropdownContent } from './NotificationDropdownContent'
import type { AppNotification } from '../types'

export function NotificationBell() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(
    session?.userId ?? null,
  )

  async function handleSelect(n: AppNotification) {
    if (!n.read) await markRead(n.id)
    if (n.link) navigate(n.link)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative">
          <Bell />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-medium text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <NotificationDropdownContent
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkAllRead={() => void markAllRead()}
          onSelect={(n) => void handleSelect(n)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
