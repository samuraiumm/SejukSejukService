import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../types'

export default function RequireRole({
  role,
  children,
}: {
  role: Role
  children: ReactNode
}) {
  const { session, loading } = useAuth()
  if (loading) {
    return <div className="p-6 text-sm text-slate-400">Loading…</div>
  }
  if (!session) return <Navigate to="/" replace />
  if (session.role !== role) return <Navigate to="/" replace />
  return <>{children}</>
}
