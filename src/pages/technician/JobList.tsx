import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import type { Order } from '../../types'
import StatusBadge from '../../components/StatusBadge'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import { cn } from '../../lib/utils'

export default function JobList() {
  const { session } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

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

  async function handleRefresh() {
    if (!session?.technicianId) return
    setRefreshing(true)
    await load(session.technicianId)
    setRefreshing(false)
  }

  const active = orders.filter((o) => o.status !== 'Job Done')
  const done = orders.filter((o) => o.status === 'Job Done')

  return (
    <div className="mx-auto max-w-lg">
      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? 'Loading…' : `${orders.length} job${orders.length === 1 ? '' : 's'}`}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={loading || refreshing}
        >
          <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="mt-3 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-3 space-y-3">
            {active.length === 0 && (
              <p className="text-sm text-muted-foreground">No active jobs right now.</p>
            )}
            {active.map((o) => (
              <JobCard key={o.id} order={o} />
            ))}
          </div>

          {done.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">Recently completed</h2>
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
  const isDone = order.status === 'Job Done'
  const date = new Date(order.created_at).toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'short',
  })

  return (
    <Link to={`/technician/jobs/${order.id}`} className="block">
      <Card
        className={cn(
          'p-4 transition-colors',
          isDone ? 'opacity-60' : 'hover:bg-accent/50 active:bg-accent',
        )}
      >
        <CardContent className="p-0">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm font-medium">{order.order_no}</span>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-1 text-sm">{order.customer_name}</p>
          <p className="text-xs text-muted-foreground">{order.service_type}</p>
          <div className="mt-1 flex items-center justify-between">
            <p className="truncate text-xs text-muted-foreground">{order.address}</p>
            <span className="ml-2 shrink-0 text-xs text-muted-foreground">{date}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
