import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { AppSidebar } from './AppSidebar'
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
  '/manager/dashboard': 'KPI Dashboard',
  '/manager/ai': 'Ask AI',
}

export default function DashboardLayout() {
  const { loading } = useAuth()
  const location = useLocation()
  const [dynamicTitle, setDynamicTitle] = useState<string | null>(null)

  const title = dynamicTitle ?? TITLE_MAP[location.pathname] ?? 'Internal Operations System'

  const context: LayoutContext = {
    setPageTitle: (t: string) => setDynamicTitle(t),
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
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
        </header>
        <main className="flex-1 p-6">
          <Outlet context={context} />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
