import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Briefcase,
  CheckCircle2,
  MapPin,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import type { Order, OrderStatus } from '../../types'
import StatusBadge from '../../components/StatusBadge'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import { cn } from '../../lib/utils'

const STATUS_ACCENT: Record<OrderStatus, string> = {
  New: 'border-l-slate-400',
  Assigned: 'border-l-sky-400',
  'In Progress': 'border-l-amber-400',
  'Job Done': 'border-l-violet-400',
  Reviewed: 'border-l-emerald-400',
  Closed: 'border-l-slate-500',
  Cancelled: 'border-l-red-400',
}

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
    <div className="mx-auto max-w-lg md:max-w-5xl">
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CountPill icon={Briefcase} value={active.length} label="Active" tone="border-sky-200 bg-sky-50 text-sky-700" />
          <CountPill icon={CheckCircle2} value={done.length} label="Done" tone="border-violet-200 bg-violet-50 text-violet-700" />
        </div>
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
          <div className="mt-3">
            {active.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border py-6 text-muted-foreground">
                <CheckCircle2 className="mb-2 size-8 opacity-40" />
                <p className="text-sm font-medium">You're all caught up.</p>
                <p className="mt-1 text-xs">New assignments will show up here.</p>
              </div>
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {active.map((o) => (
                    <JobCard key={o.id} order={o} />
                  ))}
                </div>
                <JobsTable orders={active} />
              </>
            )}
          </div>

          {done.length > 0 && (
            <div className="mt-8">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-medium text-muted-foreground">Recently completed</h2>
                <Link to="/technician/history" className="text-xs font-medium text-primary hover:underline">
                  View all &rarr;
                </Link>
              </div>
              <div className="space-y-3 md:hidden">
                {done.map((o) => (
                  <JobCard key={o.id} order={o} />
                ))}
              </div>
              <JobsTable orders={done} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CountPill({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: LucideIcon
  value: number
  label: string
  tone: string
}) {
  return (
    <div className={cn('flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5', tone)}>
      <Icon className="size-3.5" />
      <span className="text-sm font-semibold">{value}</span>
      <span className="text-xs opacity-80">{label}</span>
    </div>
  )
}

type SortField = 'order_no' | 'customer_name' | 'created_at'
type SortDir = 'asc' | 'desc'

function JobsTable({ orders }: { orders: Order[] }) {
  const navigate = useNavigate()
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const sorted = useMemo(() => {
    const copy = [...orders]
    copy.sort((a, b) => {
      const av = sortField === 'created_at' ? a.created_at : a[sortField] ?? ''
      const bv = sortField === 'created_at' ? b.created_at : b[sortField] ?? ''
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [orders, sortField, sortDir])

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  if (orders.length === 0) return null

  return (
    <div className="hidden overflow-hidden rounded-xl border border-gray-200 shadow-sm md:block">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50/80">
            <SortHeader field="order_no" label="Order No." sortField={sortField} sortDir={sortDir} onSort={handleSort} />
            <SortHeader field="customer_name" label="Customer" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Service
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Address
            </th>
            <SortHeader field="created_at" label="Date" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="whitespace-nowrap" />
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((o) => {
            const isDone = o.status === 'Job Done'
            const date = new Date(o.created_at).toLocaleDateString('en-MY', {
              day: 'numeric',
              month: 'short',
            })
            return (
              <tr
                key={o.id}
                className={cn(
                  'cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50/70',
                  isDone && 'opacity-60',
                )}
                onClick={() => navigate(`/technician/jobs/${o.id}`)}
              >
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
                    <span className="text-sm font-medium text-gray-900">{o.customer_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                    {o.service_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{o.address}</td>
                <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{date}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${STATUS_DOT[o.status]}`} />
                    <StatusBadge status={o.status} />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SortHeader({
  field,
  label,
  sortField,
  sortDir,
  onSort,
  className = '',
}: {
  field: SortField
  label: string
  sortField: SortField
  sortDir: SortDir
  onSort: (field: SortField) => void
  className?: string
}) {
  const active = sortField === field
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100/70 transition-colors ${className}`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1.5">
        {label}
        {active ? (
          sortDir === 'asc' ? (
            <ArrowUp className="size-3.5 text-gray-700" />
          ) : (
            <ArrowDown className="size-3.5 text-gray-700" />
          )
        ) : (
          <ArrowUpDown className="size-3.5 text-gray-400/50" />
        )}
      </div>
    </th>
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
          'border-l-4 p-4 transition-colors',
          STATUS_ACCENT[order.status],
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
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1 truncate text-xs font-medium text-gray-600">
              <MapPin className="size-3 shrink-0 text-gray-400" />
              <span className="truncate">{order.address}</span>
            </p>
            <span className="shrink-0 text-xs text-muted-foreground">{date}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
