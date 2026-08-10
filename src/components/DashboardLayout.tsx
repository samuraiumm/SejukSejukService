import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks/use-mobile'
import { AppSidebar } from './AppSidebar'
import { MobileTechnicianNav } from './MobileTechnicianNav'
import { NotificationBell } from './NotificationBell'
import { SidebarInset, SidebarProvider, SidebarTrigger } from './ui/sidebar'
import { Separator } from './ui/separator'

type LayoutContext = { setPageTitle: (t: string) => void }

const TITLE_MAP: Record<string, string> = {
  '/admin/dashboard': 'Dashboard',
  '/admin/orders': 'Orders',
  '/admin/calendar': 'Calendar',
  '/admin/new-order': 'Create Order',
  '/admin/technicians': 'Technicians',
  '/admin/schedule': 'Schedule',
  '/admin/audit-log': 'Audit Log',
  '/manager/review': 'Review Queue',
  '/manager/dashboard': 'Dashboard',
  '/manager/ai': 'Ask AI',
  '/technician/dashboard': 'Dashboard',
  '/technician/jobs': 'My Jobs',
  '/technician/history': 'History',
}

export default function DashboardLayout() {
  const { loading, session } = useAuth()
  const location = useLocation()
  const [dynamicTitle, setDynamicTitle] = useState<string | null>(null)
  const isMobile = useIsMobile()

  const title = dynamicTitle ?? TITLE_MAP[location.pathname] ?? 'Internal Operations System'

  const context: LayoutContext = {
    setPageTitle: (t: string) => setDynamicTitle(t),
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  }

  if (session?.role === 'technician' && isMobile) {
    // No NotificationBell here — MobileTechnicianNav's "Alerts" button already
    // covers it, and both mounting at once double-subscribes the same Realtime
    // channel name, which Supabase rejects and crashes the page.
    return (
      <div className="flex min-h-svh flex-col bg-background">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-4">
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h1>
        </header>
        <main className="flex-1 p-4 pb-20">
          <Outlet context={context} />
        </main>
        <MobileTechnicianNav />
      </div>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{title}</h1>
          </div>
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 p-6">
          <Outlet context={context} />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
