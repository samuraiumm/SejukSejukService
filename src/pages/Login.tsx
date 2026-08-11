import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck, CheckCircle2, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { getErrorMessage } from '../lib/errors'
import type { Role } from '../types'

const ROLE_HOME: Record<Role, string> = {
  admin: '/admin/dashboard',
  technician: '/technician/dashboard',
  manager: '/manager/dashboard',
}

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { error: loginError } = await login(email, password)
      if (loginError) {
        setError(loginError)
        return
      }
      // AuthContext's onAuthStateChange listener updates session state
      // asynchronously, so redirect using a fresh lookup rather than
      // reading context state right after this call.
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession()
      if (!authSession) {
        setError('Signed in, but no session was returned. Please try again.')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', authSession.user.id)
        .single()
      if (!profile) {
        setError('Signed in, but no profile is set up for this account. Contact an admin.')
        return
      }
      navigate(ROLE_HOME[profile.role as Role])
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to sign in'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl bg-card shadow-xl lg:grid-cols-2">
        <div className="flex flex-col justify-center px-8 py-12 sm:px-12 lg:px-14">
          <div className="mb-10 flex items-center gap-2.5">
            <img src="/logo.svg" alt="Sejuk Sejuk Service" className="size-9 rounded-lg" />
            <div>
              <p className="text-sm font-semibold text-foreground">Sejuk Sejuk Service</p>
              <p className="text-xs text-muted-foreground">Operations System</p>
            </div>
          </div>

          <h1 className="text-2xl font-semibold text-foreground">Welcome back</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Sign in to manage jobs, technicians, and reviews.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">Email</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  required
                  type="email"
                  autoComplete="username"
                  className="h-11 w-full rounded-full border border-input bg-transparent pr-4 pl-10 text-sm outline-none transition focus:border-sidebar-primary focus:ring-2 focus:ring-sidebar-primary/20"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">Password</span>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="h-11 w-full rounded-full border border-input bg-transparent pr-11 pl-10 text-sm outline-none transition focus:border-sidebar-primary focus:ring-2 focus:ring-sidebar-primary/20"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute top-1/2 right-3.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-6! h-11 w-full rounded-full bg-sidebar-primary text-sm font-semibold text-white shadow-sm transition hover:bg-sidebar-accent disabled:opacity-50"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Trouble signing in? Contact your administrator.
          </p>
        </div>

        <div className="relative hidden overflow-hidden bg-gradient-to-br from-sidebar via-sidebar to-sidebar-accent p-10 lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute -top-16 -right-16 size-64 rounded-full bg-sidebar-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 size-56 rounded-full bg-sidebar-primary/10 blur-3xl" />

          <div />

          <div className="relative flex flex-1 items-center justify-center">
            <div className="relative flex size-52 items-center justify-center">
              <div className="absolute inset-0 rounded-full border border-sidebar-primary/20" />
              <div className="absolute inset-6 rounded-full border border-sidebar-primary/25" />
              <div className="absolute inset-12 rounded-full border border-sidebar-primary/30" />
              <div className="flex size-24 items-center justify-center rounded-full bg-sidebar-primary shadow-lg shadow-sidebar-primary/30">
                <svg viewBox="0 0 512 512" className="size-11" aria-hidden="true">
                  <g transform="translate(256,256)" fill="#F7FDFF">
                    <path d="M0,-14 C40,-70 60,-120 40,-166 C74,-140 92,-92 78,-40 C68,-4 34,-6 0,-14 Z" />
                    <path
                      d="M0,-14 C40,-70 60,-120 40,-166 C74,-140 92,-92 78,-40 C68,-4 34,-6 0,-14 Z"
                      transform="rotate(120)"
                    />
                    <path
                      d="M0,-14 C40,-70 60,-120 40,-166 C74,-140 92,-92 78,-40 C68,-4 34,-6 0,-14 Z"
                      transform="rotate(240)"
                    />
                  </g>
                </svg>
              </div>
            </div>

            <div className="absolute top-8 left-2 w-48 -rotate-6 rounded-xl bg-white p-3 shadow-lg">
              <div className="flex items-center gap-2">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-gray-900">Job Completed</p>
                  <p className="truncate text-[11px] text-gray-500">ORDER1042 · Aircond repair</p>
                </div>
              </div>
            </div>

            <div className="absolute right-0 bottom-2 rotate-3 rounded-xl bg-white p-3 shadow-lg">
              <p className="mb-1.5 text-[11px] font-medium text-gray-500">Technicians online</p>
              <div className="flex items-center">
                <div className="flex -space-x-2">
                  <div className="flex size-7 items-center justify-center rounded-full border-2 border-white bg-blue-100 text-[10px] font-semibold text-blue-700">
                    A
                  </div>
                  <div className="flex size-7 items-center justify-center rounded-full border-2 border-white bg-amber-100 text-[10px] font-semibold text-amber-700">
                    B
                  </div>
                  <div className="flex size-7 items-center justify-center rounded-full border-2 border-white bg-violet-100 text-[10px] font-semibold text-violet-700">
                    J
                  </div>
                </div>
                <span className="ml-2 text-xs font-semibold text-gray-900">+4</span>
              </div>
            </div>

            <div className="absolute top-1/2 -right-2 flex -translate-y-1/2 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 shadow-lg">
              <CalendarCheck className="size-3.5 text-sidebar-primary" />
              <span className="text-xs font-semibold text-gray-900">8 jobs today</span>
            </div>
          </div>

          <div className="relative">
            <p className="text-lg font-semibold text-sidebar-foreground">
              Every job, technician, and customer — in one place.
            </p>
            <p className="mt-1.5 text-sm text-sidebar-foreground/60">
              Track service orders from assignment to completion, with real-time updates for your
              whole team.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
