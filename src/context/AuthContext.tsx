import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Role } from '../types'

interface AppSession {
  userId: string
  role: Role
  name: string
  /** Only set when role === 'technician' — their row in the `technicians` table. */
  technicianId: string | null
}

interface AuthContextValue {
  session: AppSession | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ error: string | null }>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function loadAppSession(userId: string): Promise<AppSession | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, name')
    .eq('user_id', userId)
    .single()
  if (!profile) return null

  let technicianId: string | null = null
  if (profile.role === 'technician') {
    const { data: technician } = await supabase
      .from('technicians')
      .select('id')
      .eq('user_id', userId)
      .single()
    technicianId = technician?.id ?? null
  }

  return { userId, role: profile.role as Role, name: profile.name, technicianId }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AppSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function syncFromUserId(userId: string | null) {
      if (!userId) {
        if (!cancelled) {
          setSession(null)
          setLoading(false)
        }
        return
      }
      const appSession = await loadAppSession(userId)
      if (!cancelled) {
        setSession(appSession)
        setLoading(false)
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      void syncFromUserId(data.session?.user.id ?? null)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, authSession) => {
      setLoading(true)
      void syncFromUserId(authSession?.user.id ?? null)
    })

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      login: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return { error: error?.message ?? null }
      },
      logout: async () => {
        await supabase.auth.signOut()
      },
    }),
    [session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
