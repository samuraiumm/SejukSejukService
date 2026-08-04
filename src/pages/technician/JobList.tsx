import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import type { Order } from '../../types'
import StatusBadge from '../../components/StatusBadge'

export default function JobList() {
  const { session } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.technicianId) return
    void load(session.technicianId)
  }, [session])

  async function load(technicianId: string) {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('*, technicians ( id, name )')
      .eq('assigned_technician_id', technicianId)
      .in('status', ['Assigned', 'In Progress', 'Job Done'])
      .order('created_at', { ascending: true })
    setOrders((data as unknown as Order[]) ?? [])
    setLoading(false)
  }

  const active = orders.filter((o) => o.status !== 'Job Done')
  const done = orders.filter((o) => o.status === 'Job Done')

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold text-slate-900">My Jobs</h1>
      <p className="mt-1 text-sm text-slate-500">Assigned to {session?.name}</p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="mt-5 space-y-3">
            {active.length === 0 && (
              <p className="text-sm text-slate-500">No active jobs right now.</p>
            )}
            {active.map((o) => (
              <JobCard key={o.id} order={o} />
            ))}
          </div>

          {done.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-2 text-sm font-medium text-slate-500">Recently completed</h2>
              <div className="space-y-3">
                {done.map((o) => (
                  <JobCard key={o.id} order={o} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function JobCard({ order }: { order: Order }) {
  return (
    <Link
      to={`/technician/jobs/${order.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-medium text-slate-900">{order.order_no}</span>
        <StatusBadge status={order.status} />
      </div>
      <p className="mt-1 text-sm text-slate-700">{order.customer_name}</p>
      <p className="text-xs text-slate-500">{order.service_type}</p>
      <p className="mt-1 text-xs text-slate-400">{order.address}</p>
    </Link>
  )
}
