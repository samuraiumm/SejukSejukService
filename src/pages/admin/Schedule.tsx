import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import type { Order } from '../../types'
import StatusBadge from '../../components/StatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function Schedule() {
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
        <p className="text-sm text-muted-foreground">
          Upcoming orders with a booked date/time, from today onward.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            No upcoming orders have a scheduled date yet. Set one from an order's detail
            page.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([day, dayOrders]) => (
            <div key={day}>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">{day}</h2>
              <div className="space-y-2">
                {dayOrders.map((o) => (
                  <Link key={o.id} to={`/admin/orders/${o.id}`}>
                    <Card className="transition-colors hover:bg-accent/50">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="size-4" />
                            {new Date(o.scheduled_at!).toLocaleTimeString(undefined, {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                          <div>
                            <CardTitle className="font-mono text-sm">{o.order_no}</CardTitle>
                            <p className="text-sm text-muted-foreground">
                              {o.customer_name} &middot; {o.technicians?.name ?? 'Unassigned'}
                            </p>
                          </div>
                        </div>
                        <StatusBadge status={o.status} />
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
