import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Briefcase, CheckCircle2, Clock, DollarSign, RefreshCw, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { getGreeting } from '../../lib/greeting'
import type { Order, ServiceCompletion, Technician } from '../../types'
import { STATUS_ORDER } from '../../lib/orderStatus'
import StatusBadge from '../../components/StatusBadge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table'
import { Skeleton } from '../../components/ui/skeleton'

type Range = '7' | '30' | 'all'

const STATUS_COLORS: Record<string, string> = {
  New: 'var(--chart-3)',
  Assigned: 'var(--chart-1)',
  'In Progress': 'var(--chart-4)',
  'Job Done': 'var(--chart-2)',
  Reviewed: '#0891b2',
  Closed: '#6b7280',
  Cancelled: 'var(--chart-5)',
}

const STATUS_GRADIENT = {
  id: (name: string) => `grad${name.replace(/\s/g, '')}`,
  // Deliberately much lighter than STATUS_COLORS (which stays flat/mid-tone
  // for badges and legend dots) — a mid-tone-to-dark spread is too subtle a
  // shift to read as a gradient at a glance, especially on narrow bar segments.
  stops: (name: string): [string, string] => {
    const light: Record<string, string> = {
      New: '#fcd34d',
      Assigned: '#93c5fd',
      'In Progress': '#c4b5fd',
      'Job Done': '#6ee7b7',
      Reviewed: '#67e8f9',
      Closed: '#d1d5db',
      Cancelled: '#fca5a5',
    }
    const dark: Record<string, string> = {
      New: '#d97706',
      Assigned: '#2563eb',
      'In Progress': '#7c3aed',
      'Job Done': '#059669',
      Reviewed: '#0e7490',
      Closed: '#4b5563',
      Cancelled: '#dc2626',
    }
    return [light[name] ?? '#e5e7eb', dark[name] ?? '#4b5563']
  },
}

const STACK_SEGMENTS = [
  { key: 'Assigned', label: 'Assigned', color: 'var(--chart-1)' },
  { key: 'In Progress', label: 'In Progress', color: 'var(--chart-4)' },
  { key: 'Job Done', label: 'Job Done (this period)', color: 'var(--chart-2)' },
] as const

export default function Dashboard() {
  const { session } = useAuth()
  const greeting = useMemo(() => getGreeting(), [])
  const [range, setRange] = useState<Range>('7')
  const [orders, setOrders] = useState<Order[]>([])
  const [completions, setCompletions] = useState<ServiceCompletion[]>([])
  const [allOrders, setAllOrders] = useState<Order[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const pieTotal = useMemo(
    () => orders.reduce((sum) => sum + 1, 0),
    [orders],
  )

  const load = useCallback(async (r: Range) => {
    setLoading(true)

    const since = r === 'all'
      ? new Date(0).toISOString()
      : (() => {
        const d = new Date()
        d.setDate(d.getDate() - Number(r))
        return d.toISOString()
      })()

    const [{ data: orderData }, { data: completionData }, { data: allOrderData }, { data: techData }] =
      await Promise.all([
        supabase
          .from('orders')
          .select('status, assigned_technician_id, scheduled_at, created_at')
          .gte('created_at', since),
        supabase
          .from('service_completions')
          .select('final_amount, completed_at, technician_name')
          .gte('completed_at', since),
        supabase
          .from('orders')
          .select('id, order_no, customer_name, status, assigned_technician_id, scheduled_at'),
        supabase.from('technicians').select('id, name, active'),
      ])

    setOrders((orderData as Order[]) ?? [])
    setCompletions((completionData as ServiceCompletion[]) ?? [])
    setAllOrders((allOrderData as unknown as Order[]) ?? [])
    setTechnicians((techData as Technician[]) ?? [])
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    void load(range)
  }, [range, load])

  function handleRefresh() {
    setRefreshing(true)
    void load(range)
  }

  const stats = useMemo(() => {
    const totalOrders = orders.length
    const totalRevenue = completions.reduce((sum, c) => sum + Number(c.final_amount), 0)
    const activeTechs = technicians.filter((t) => t.active).length
    const pendingJobs = allOrders.filter(
      (o) => o.status === 'New' || o.status === 'Assigned' || o.status === 'In Progress',
    ).length
    const awaitingReview = allOrders.filter((o) => o.status === 'Job Done').length

    return { totalOrders, totalRevenue, activeTechs, pendingJobs, awaitingReview }
  }, [orders, completions, allOrders, technicians])

  const statusData = useMemo(() => {
    const counts = new Map<string, number>()
    for (const o of orders) {
      counts.set(o.status, (counts.get(o.status) ?? 0) + 1)
    }
    return STATUS_ORDER.filter((s) => counts.has(s)).map((s) => ({
      name: s,
      value: counts.get(s) ?? 0,
    }))
  }, [orders])

  const techWorkload = useMemo(() => {
    const map = new Map<string, { Assigned: number; 'In Progress': number; 'Job Done': number }>()
    for (const o of allOrders) {
      if (!o.assigned_technician_id) continue
      const tech = technicians.find((t) => t.id === o.assigned_technician_id)
      const name = tech?.name ?? 'Unknown'
      if (!map.has(name)) {
        map.set(name, { Assigned: 0, 'In Progress': 0, 'Job Done': 0 })
      }
      const entry = map.get(name)!
      if (o.status === 'Assigned') entry.Assigned += 1
      else if (o.status === 'In Progress') entry['In Progress'] += 1
      else if (o.status === 'Job Done') entry['Job Done'] += 1
    }
    return [...map.entries()]
      .map(([name, stacks]) => ({ name, ...stacks }))
      .sort((a, b) => (b.Assigned + b['In Progress'] + b['Job Done']) - (a.Assigned + a['In Progress'] + a['Job Done']))
  }, [allOrders, technicians])

  const revenueTrend = useMemo(() => {
    // Day-level granularity for the 7d/30d ranges — grouping by month there
    // would collapse the whole window into a single point, since a week or
    // month rarely crosses a calendar-month boundary.
    const byDay = range !== 'all'
    const buckets = new Map<string, number>()
    for (const c of completions) {
      const d = new Date(c.completed_at)
      const key = byDay
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      buckets.set(key, (buckets.get(key) ?? 0) + Number(c.final_amount))
    }
    const sorted = [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, amount]) => {
        if (byDay) {
          const [y, m, day] = key.split('-')
          const label = new Date(Number(y), Number(m) - 1, Number(day)).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })
          return { month: label, amount }
        }
        const [y, m] = key.split('-')
        const label = new Date(Number(y), Number(m) - 1).toLocaleDateString(undefined, {
          month: 'short',
          year: '2-digit',
        })
        return { month: label, amount }
      })
    return sorted.slice(byDay ? -30 : -12)
  }, [completions, range])

  const upcomingSchedule = useMemo(() => {
    const now = new Date()
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    return allOrders
      .filter((o) => {
        if (!o.scheduled_at) return false
        const d = new Date(o.scheduled_at)
        return d >= now && d <= nextWeek
      })
      .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime())
      .slice(0, 10)
  }, [allOrders])

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden border border-sidebar-primary/20 bg-gradient-to-br from-sidebar-primary/15 via-sidebar-primary/5 to-white shadow-sm">
        <div className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-gradient-to-br from-sidebar-primary/25 to-sidebar/10 blur-2xl" />
        <CardContent className="relative flex flex-col items-center gap-5 p-6 text-center sm:flex-row sm:justify-center sm:gap-8 sm:text-left">
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sidebar-primary/30 via-sidebar-primary/15 to-transparent text-2xl">
              {greeting.emoji}
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900">
                {greeting.text},{' '}
                <span className="capitalize text-sidebar-primary">{session?.name ?? 'Admin'}</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {new Date().toLocaleDateString('en-MY', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                {' — '}
                {greeting.message}
              </p>
            </div>
          </div>

          <div className="hidden h-12 w-px bg-sidebar-primary/20 sm:block" />

          <div className="flex items-center gap-3">
            <GreetingStat icon={Clock} value={stats.pendingJobs} label="Pending Jobs" />
            <GreetingStat icon={CheckCircle2} value={stats.awaitingReview} label="Awaiting Review" />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
        <p className="text-sm font-medium text-gray-700">Overview</p>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
            {(['7', '30', 'all'] as Range[]).map((r) => (
              <Button
                key={r}
                size="sm"
                variant={range === r ? 'default' : 'ghost'}
                onClick={() => setRange(r)}
              >
                {r === 'all' ? 'All' : `Last ${r}d`}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-80 w-full" />
            <Skeleton className="h-80 w-full" />
          </div>
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              icon={Briefcase}
              label="Total Orders"
              value={stats.totalOrders.toString()}
              to="/admin/orders"
              tone="from-brand-500 to-brand-600"
              wash="from-brand-500/25 to-transparent"
            />
            <StatCard
              icon={DollarSign}
              label="Total Revenue"
              value={`RM ${stats.totalRevenue.toFixed(2)}`}
              tone="from-emerald-500 to-emerald-600"
              wash="from-emerald-500/25 to-transparent"
            />
            <StatCard
              icon={Users}
              label="Active Technicians"
              value={stats.activeTechs.toString()}
              to="/admin/technicians"
              tone="from-violet-500 to-violet-600"
              wash="from-violet-500/25 to-transparent"
            />
            <StatCard
              icon={Clock}
              label="Pending Jobs"
              value={stats.pendingJobs.toString()}
              to="/admin/orders"
              tone="from-amber-500 to-amber-600"
              wash="from-amber-500/25 to-transparent"
            />
            <StatCard
              icon={CheckCircle2}
              label="Awaiting Review"
              value={stats.awaitingReview.toString()}
              to="/admin/orders"
              tone="from-sky-500 to-sky-600"
              wash="from-sky-500/25 to-transparent"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Orders by Status</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                {orders.length === 0 ? (
                  <p className="py-8 text-sm text-muted-foreground">No orders in this period.</p>
                ) : (
                  <>
                    <div className="h-72 w-full">
                      <ResponsiveContainer>
                        <PieChart>
                          <defs>
                            {STATUS_ORDER.map((s) => {
                              const [light, dark] = STATUS_GRADIENT.stops(s)
                              return (
                                <linearGradient
                                  key={STATUS_GRADIENT.id(s)}
                                  id={STATUS_GRADIENT.id(s)}
                                  x1="0"
                                  y1="0"
                                  x2="1"
                                  y2="1"
                                >
                                  <stop offset="0%" stopColor={light} />
                                  <stop offset="100%" stopColor={dark} />
                                </linearGradient>
                              )
                            })}
                          </defs>
                          <Pie
                            data={statusData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={90}
                            paddingAngle={3}
                            labelLine={false}
                            label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                              const RADIAN = Math.PI / 180
                              const pct = percent ?? 0
                              const angle = midAngle ?? 0
                              const cxN = cx as number
                              const cyN = cy as number
                              const innerR = innerRadius as number
                              const outerR = outerRadius as number
                              const pctLabel = `${(pct * 100).toFixed(0)}%`

                              // Big enough slice: percentage fits inside it, same as before.
                              if (pct * 100 >= 8) {
                                const radius = innerR + (outerR - innerR) * 0.6
                                const x = cxN + radius * Math.cos(-angle * RADIAN)
                                const y = cyN + radius * Math.sin(-angle * RADIAN)
                                return (
                                  <text
                                    x={x}
                                    y={y}
                                    fill="white"
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    style={{ fontSize: 12, fontWeight: 600, pointerEvents: 'none' }}
                                  >
                                    {pctLabel}
                                  </text>
                                )
                              }

                              // Slice too thin for text to fit inside it: draw the percentage just
                              // outside the ring instead, connected back to its slice by a short
                              // leader line — so every status still shows its number on the chart
                              // itself, not only in the legend below.
                              const start = {
                                x: cxN + outerR * Math.cos(-angle * RADIAN),
                                y: cyN + outerR * Math.sin(-angle * RADIAN),
                              }
                              const bend = {
                                x: cxN + (outerR + 14) * Math.cos(-angle * RADIAN),
                                y: cyN + (outerR + 14) * Math.sin(-angle * RADIAN),
                              }
                              const isRight = bend.x >= cxN
                              const labelX = bend.x + (isRight ? 8 : -8)
                              return (
                                <g style={{ pointerEvents: 'none' }}>
                                  <path
                                    d={`M${start.x},${start.y} L${bend.x},${bend.y} L${labelX},${bend.y}`}
                                    stroke="var(--muted-foreground)"
                                    strokeWidth={1}
                                    fill="none"
                                  />
                                  <text
                                    x={labelX + (isRight ? 2 : -2)}
                                    y={bend.y}
                                    textAnchor={isRight ? 'start' : 'end'}
                                    dominantBaseline="central"
                                    className="fill-foreground"
                                    style={{ fontSize: 11, fontWeight: 600 }}
                                  >
                                    {pctLabel}
                                  </text>
                                </g>
                              )
                            }}
                            activeShape={(props: unknown) => {
                              const p = props as Record<string, unknown>
                              return (
                                <Sector
                                  cx={p.cx as number}
                                  cy={p.cy as number}
                                  innerRadius={(p.innerRadius as number) - 4}
                                  outerRadius={(p.outerRadius as number) + 8}
                                  startAngle={p.startAngle as number}
                                  endAngle={p.endAngle as number}
                                  fill={p.fill as string}
                                  cornerRadius={4}
                                />
                              )
                            }}
                            animationBegin={0}
                            animationDuration={800}
                            isAnimationActive={false}
                          >
                            {statusData.map((entry) => (
                              <Cell
                                key={entry.name}
                                fill={`url(#${STATUS_GRADIENT.id(entry.name)})`}
                                stroke="var(--background)"
                                strokeWidth={1}
                              />
                            ))}
                            <Label
                              position="center"
                              content={({ viewBox }) => {
                                // This Recharts version hands a Cartesian plot-area rectangle here
                                // ({x, y, width, height}), not a polar {cx, cy} pair — the donut's
                                // actual center has to be derived from it. Using vb.cx/vb.cy directly
                                // (both always undefined) is what produced NaN coordinates before.
                                if (
                                  !viewBox ||
                                  !('x' in viewBox) ||
                                  !('y' in viewBox) ||
                                  !('width' in viewBox) ||
                                  !('height' in viewBox)
                                ) {
                                  return null
                                }
                                const vb = viewBox as { x: number; y: number; width: number; height: number }
                                const cx = vb.x + vb.width / 2
                                const cy = vb.y + vb.height / 2
                                return (
                                  <g>
                                    <text
                                      x={cx}
                                      y={cy - 8}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                      className="fill-muted-foreground"
                                      style={{ fontSize: 12 }}
                                    >
                                      Total
                                    </text>
                                    <text
                                      x={cx}
                                      y={cy + 14}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                      className="fill-foreground"
                                      style={{ fontSize: 24, fontWeight: 700 }}
                                    >
                                      {pieTotal}
                                    </text>
                                  </g>
                                )
                              }}
                            />
                          </Pie>
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null
                              const item = payload[0]
                              const pct = pieTotal > 0
                                ? ((Number(item.value) / pieTotal) * 100).toFixed(1)
                                : '0'
                              return (
                                <div
                                  style={{
                                    backgroundColor: 'var(--card)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 'var(--radius-md)',
                                    padding: '8px 12px',
                                    fontSize: 13,
                                  }}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className="size-2 rounded-full"
                                      style={{ backgroundColor: item.payload.fill }}
                                    />
                                    <span className="font-medium">{item.name}</span>
                                  </div>
                                  <div className="mt-1 text-muted-foreground">
                                    {item.value} order{Number(item.value) !== 1 ? 's' : ''} ({pct}%)
                                  </div>
                                </div>
                              )
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-4 flex flex-wrap justify-center gap-3">
                      {statusData.map((s) => {
                        const pct = pieTotal > 0 ? ((s.value / pieTotal) * 100).toFixed(0) : '0'
                        return (
                          <div key={s.name} className="flex items-center gap-1.5 text-xs">
                            <span
                              className="size-2.5 rounded-full"
                              style={{ backgroundColor: STATUS_COLORS[s.name] ?? '#6b7280' }}
                            />
                            {s.name}: {s.value} ({pct}%)
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Technician Workload</CardTitle>
              </CardHeader>
              <CardContent>
                {techWorkload.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No orders assigned yet.
                  </p>
                ) : (
                  <>
                    <div className="h-64">
                      <ResponsiveContainer>
                        <BarChart data={techWorkload} layout="vertical">
                          <defs>
                            {STACK_SEGMENTS.map((seg) => {
                              const [light, dark] = STATUS_GRADIENT.stops(seg.key)
                              return (
                                <linearGradient
                                  key={STATUS_GRADIENT.id(seg.key)}
                                  id={STATUS_GRADIENT.id(seg.key)}
                                  x1="0"
                                  y1="0"
                                  x2="1"
                                  y2="0"
                                >
                                  <stop offset="0%" stopColor={light} />
                                  <stop offset="100%" stopColor={dark} />
                                </linearGradient>
                              )
                            })}
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                          <YAxis
                            type="category"
                            dataKey="name"
                            tick={{ fontSize: 12 }}
                            width={70}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'var(--card)',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-md)',
                              fontSize: 13,
                            }}
                          />
                          {STACK_SEGMENTS.map((seg) => (
                            <Bar
                              key={seg.key}
                              dataKey={seg.key}
                              stackId="a"
                              fill={`url(#${STATUS_GRADIENT.id(seg.key)})`}
                              radius={0}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-3 flex flex-wrap justify-center gap-3">
                      {STACK_SEGMENTS.map((seg) => {
                        const [light, dark] = STATUS_GRADIENT.stops(seg.key)
                        return (
                          <div key={seg.key} className="flex items-center gap-1.5 text-xs">
                            <span
                              className="size-2.5 rounded-full"
                              style={{ background: `linear-gradient(90deg, ${light}, ${dark})` }}
                            />
                            {seg.label}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue Trend</CardTitle>
            </CardHeader>
            <CardContent>
              {revenueTrend.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No completed jobs in this period.
                </p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer>
                    <AreaChart data={revenueTrend}>
                      <defs>
                        <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="revenueStroke" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="var(--chart-1)" />
                          <stop offset="100%" stopColor="var(--chart-2)" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--card)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          fontSize: 13,
                        }}
                        formatter={(value) => [`RM ${Number(value).toFixed(2)}`, 'Revenue']}
                      />
                      <Area
                        type="monotone"
                        dataKey="amount"
                        stroke="url(#revenueStroke)"
                        fill="url(#revenueGradient)"
                        strokeWidth={2.5}
                        dot={{ r: 3, strokeWidth: 2, stroke: 'var(--chart-2)', fill: 'var(--card)' }}
                        activeDot={{ r: 5, strokeWidth: 0, fill: 'var(--chart-2)' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upcoming Schedule (Next 7 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              {loading && upcomingSchedule.length === 0 ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : upcomingSchedule.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming jobs scheduled.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Scheduled</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcomingSchedule.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-sm">
                          <Link
                            to={`/admin/orders/${o.id}`}
                            className="text-primary hover:underline"
                          >
                            {o.order_no}
                          </Link>
                        </TableCell>
                        <TableCell>{o.customer_name}</TableCell>
                        <TableCell className="text-sm">
                          {new Date(o.scheduled_at!).toLocaleDateString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={o.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function GreetingStat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Briefcase
  value: number
  label: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-sidebar-primary/20 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sidebar-primary to-sidebar-primary/70 shadow-sm">
        <Icon className="size-5 text-white" />
      </div>
      <div className="text-left">
        <p className="text-xl leading-none font-bold text-gray-900">{value}</p>
        <p className="mt-1 text-xs whitespace-nowrap text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  to,
  tone = 'from-slate-500 to-slate-600',
  wash = 'from-slate-500/15 to-transparent',
}: {
  icon: typeof Briefcase
  label: string
  value: string
  to?: string
  tone?: string
  wash?: string
}) {
  const content = (
    <Card
      className={`relative overflow-hidden border border-gray-200 ${to ? 'transition-shadow hover:shadow-md' : ''}`}
    >
      <div
        className={`pointer-events-none absolute -top-8 -right-8 size-28 rounded-full bg-gradient-to-br ${wash} blur-2xl`}
      />
      <CardContent className="relative flex items-center justify-between py-5">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br shadow-sm ${tone}`}
        >
          <Icon className="size-5 text-white" />
        </div>
      </CardContent>
    </Card>
  )

  if (to) {
    return (
      <Link to={to} className="block">
        {content}
      </Link>
    )
  }
  return <>{content}</>
}
