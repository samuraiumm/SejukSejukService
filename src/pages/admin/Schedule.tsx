import { Fragment, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import type { Order, OrderStatus } from '../../types'
import StatusBadge from '../../components/StatusBadge'
import { Card } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'

const STATUS_DOT: Record<OrderStatus, string> = {
  New: 'bg-slate-400',
  Assigned: 'bg-sky-400',
  'In Progress': 'bg-amber-400',
  'Job Done': 'bg-violet-400',
  Reviewed: 'bg-emerald-400',
  Closed: 'bg-slate-500',
  Cancelled: 'bg-red-400',
}

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-orange-100 text-orange-700',
  'bg-sky-100 text-sky-700',
]

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function Schedule() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from('orders')
      .select('*, technicians ( id, name )')
      .not('scheduled_at', 'is', null)
      .gte('scheduled_at', startOfToday.toISOString())
      .order('scheduled_at', { ascending: true })
    setOrders((data as unknown as Order[]) ?? [])
    setLoading(false)
  }

  const groups = new Map<string, Order[]>()
  for (const o of orders) {
    if (!o.scheduled_at) continue
    const key = dayKey(o.scheduled_at)
    const list = groups.get(key) ?? []
    list.push(o)
    groups.set(key, list)
  }

  const todayKey = dayKey(new Date().toISOString())

  return (
    <div className="space-y-6 p-1">
      <Card className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <CalendarClock className="size-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">No upcoming orders are scheduled.</p>
            <p className="text-xs mt-1">Set a scheduled date from an order's detail page.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Order No.
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Service
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Technician
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...groups.entries()].map(([day, dayOrders]) => (
                  <Fragment key={day}>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <td colSpan={6} className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-700">{day}</span>
                          {day === todayKey && (
                            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                              Today
                            </span>
                          )}
                          <span className="text-xs text-gray-400">
                            {dayOrders.length} job{dayOrders.length === 1 ? '' : 's'}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {dayOrders.map((o) => (
                      <tr
                        key={o.id}
                        className="border-b border-gray-100 hover:bg-gray-50/70 transition-colors cursor-pointer"
                        onClick={() => navigate(`/admin/orders/${o.id}`)}
                      >
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                          {new Date(o.scheduled_at!).toLocaleTimeString(undefined, {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-3 font-mono text-sm font-medium text-primary whitespace-nowrap">
                          {o.order_no}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${getAvatarColor(o.customer_name ?? '')}`}
                            >
                              {getInitials(o.customer_name ?? '')}
                            </div>
                            <span className="text-sm font-medium text-gray-900">
                              {o.customer_name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                            {o.service_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {o.technicians?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`size-2 rounded-full ${STATUS_DOT[o.status]}`} />
                            <StatusBadge status={o.status} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
