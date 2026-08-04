import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { getErrorMessage } from '../lib/errors'
import type { Role } from '../types'

const ROLE_HOME: Record<Role, string> = {
  admin: '/admin/orders',
  technician: '/technician/jobs',
  manager: '/manager/review',
}

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Sejuk Sejuk Service</h1>
        <p className="mt-1 text-sm text-slate-500">Internal Operations System</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4 rounded-xl bg-white p-6 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
          <input
            required
            type="email"
            autoComplete="username"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
          <input
            required
            type="password"
            autoComplete="current-password"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
