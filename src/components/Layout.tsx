import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Admin/Manager use the sidebar-based DashboardLayout instead — this simple
// top-bar layout now only serves the mobile-first Technician role and Login.
const NAV_BY_ROLE: Record<string, { to: string; label: string }[]> = {
  technician: [{ to: '/technician/jobs', label: 'My Jobs' }],
}

export default function Layout() {
  const { session, loading, logout } = useAuth()
  const navigate = useNavigate()

  if (loading) {
    return <div className="p-6 text-sm text-slate-400">Loading…</div>
  }

  if (!session) return <Outlet />

  const links = NAV_BY_ROLE[session.role] ?? []

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="font-semibold text-slate-900">Sejuk Sejuk Service</span>
            <nav className="flex gap-1">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-1.5 text-sm font-medium ${
                      isActive
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span className="rounded-full bg-slate-100 px-3 py-1 capitalize">
              {session.role} &middot; {session.name}
            </span>
            <button
              onClick={async () => {
                await logout()
                navigate('/')
              }}
              className="font-medium text-slate-500 hover:text-slate-800"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
