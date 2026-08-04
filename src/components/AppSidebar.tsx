import {
  Bot,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  Users,
  Wind,
} from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from './ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Avatar, AvatarFallback } from './ui/avatar'

const NAV_BY_ROLE = {
  admin: [
    { to: '/admin/orders', label: 'Orders', icon: ClipboardList },
    { to: '/admin/new-order', label: 'New Order', icon: PlusCircle },
    { to: '/admin/schedule', label: 'Schedule', icon: CalendarClock },
    { to: '/admin/technicians', label: 'Technicians', icon: Users },
    { to: '/admin/audit-log', label: 'Audit Log', icon: History },
  ],
  manager: [
    { to: '/manager/review', label: 'Review Queue', icon: ClipboardCheck },
    { to: '/manager/dashboard', label: 'KPI Dashboard', icon: LayoutDashboard },
    { to: '/manager/ai', label: 'Ask AI', icon: Bot },
  ],
} as const

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function AppSidebar() {
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const links = session?.role === 'admin' || session?.role === 'manager' ? NAV_BY_ROLE[session.role] : []

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Wind className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Sejuk Sejuk Service</span>
                <span className="truncate text-xs text-muted-foreground">Operations System</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="capitalize">{session?.role}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {links.map((link) => {
                const Icon = link.icon
                const isActive =
                  location.pathname === link.to ||
                  location.pathname.startsWith(`${link.to}/`)
                return (
                  <SidebarMenuItem key={link.to}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={link.label}>
                      <NavLink to={link.to}>
                        <Icon />
                        <span>{link.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">
                      {session ? initials(session.name) : '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{session?.name}</span>
                    <span className="truncate text-xs text-muted-foreground capitalize">
                      {session?.role}
                    </span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuItem
                  onClick={async () => {
                    await logout()
                    navigate('/')
                  }}
                >
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
