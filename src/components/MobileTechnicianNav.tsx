import { Bell, ClipboardList, History, LayoutDashboard, LogOut } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../hooks/useNotifications'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from './ui/dropdown-menu'
import { NotificationDropdownContent } from './NotificationDropdownContent'
import type { AppNotification } from '../types'

const LINKS = [
  { to: '/technician/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/technician/jobs', label: 'My Jobs', icon: ClipboardList },
  { to: '/technician/history', label: 'History', icon: History },
] as const

const itemClass = (active: boolean) =>
  `flex flex-1 flex-col items-center gap-1 rounded-xl py-1 text-[11px] font-medium transition-colors ${
    active ? 'text-sidebar-primary' : 'text-sidebar-foreground/55'
  }`

function IconPill({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`relative flex size-9 items-center justify-center rounded-full transition-colors ${
        active ? 'bg-sidebar-primary/20' : ''
      }`}
    >
      {children}
    </span>
  )
}

export function MobileTechnicianNav() {
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(
    session?.userId ?? null,
  )

  async function handleSelect(n: AppNotification) {
    if (!n.read) await markRead(n.id)
    if (n.link) navigate(n.link)
  }

  async function handleLogout() {
    await logout()
    navigate('/')
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-sidebar-primary/15 bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground shadow-[0_-8px_24px_-6px_rgba(0,0,0,0.25)]">
      <div className="flex items-center justify-around px-1 pt-2 pb-1.5">
        {LINKS.map((link) => {
          const Icon = link.icon
          return (
            <NavLink key={link.to} to={link.to} className={({ isActive }) => itemClass(isActive)}>
              {({ isActive }) => (
                <>
                  <IconPill active={isActive}>
                    <Icon className="size-5" />
                  </IconPill>
                  {link.label}
                </>
              )}
            </NavLink>
          )
        })}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={itemClass(false)}>
              <IconPill active={false}>
                <Bell className="size-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-medium text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </IconPill>
              Alerts
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-80">
            <NotificationDropdownContent
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkAllRead={() => void markAllRead()}
              onSelect={(n) => void handleSelect(n)}
            />
          </DropdownMenuContent>
        </DropdownMenu>

        <button className={itemClass(false)} onClick={() => void handleLogout()}>
          <IconPill active={false}>
            <LogOut className="size-5" />
          </IconPill>
          Logout
        </button>
      </div>
    </nav>
  )
}
