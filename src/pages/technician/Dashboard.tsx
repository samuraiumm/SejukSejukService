import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowUpRight,
  Briefcase,
  CheckCircle2,
  Clock,
  DollarSign,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { getGreeting } from '../../lib/greeting'
import type { Order, ServiceCompletion } from '../../types'
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

const SERVICE_COLORS: Record<string, string> = {
  'Aircond cleaning': 'var(--chart-1)',
  'Aircond repair': 'var(--chart-2)',
  'Gas refill': 'var(--chart-3)',
  Installation: 'var(--chart-4)',
  Inspection: 'var(--chart-5)',
  'Aircond Cleaning': 'var(--chart-1)',
}

type CompletionRow = ServiceCompletion & {
  orders: {
    customer_name: string
    service_type: string
    order_no: string
  } | null
}

function formatDuration(startedAt: string | null, completedAt: string): string {
  if (!startedAt) return '—'
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 0) return '—'
  const totalMin = Math.round(ms / 60000)
  if (totalMin < 60) return `${totalMin}m`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function isThisMonth(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

function isLastMonth(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return d.getFullYear() === lastMonth.getFullYear() && d.getMonth() === lastMonth.getMonth()
}

function isToday(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

function getWeekRange(): { start: Date; end: Date } {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? 6 : day - 1 // Monday = 0
  const start = new Date(now)
  start.setDate(now.getDate() - diff)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 7)
  return { start, end }
}

function isThisWeek(iso: string): boolean {
  const d = new Date(iso)
  const { start, end } = getWeekRange()
  return d >= start && d < end
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}

function ProgressRing({
  value,
  max,
  size = 72,
  labelClassName = 'text-sm',
}: {
  value: number
  max: number
  size?: number
  labelClassName?: string
}) {
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const offset = circumference - (pct / 100) * circumference

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth="6"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--sidebar-primary)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className={`absolute font-bold ${labelClassName} ${max > 0 ? '' : 'text-muted-foreground'}`}>
        {max > 0 ? `${Math.round(pct)}%` : '—'}
      </span>
    </div>
  )
}

export default function TechnicianDashboard() {
  const { session } = useAuth()
  const [range, setRange] = useState<Range>('7')
  const [activeJobs, setActiveJobs] = useState<Order[]>([])
  const [completions, setCompletions] = useState<CompletionRow[]>([])
  const [allCompletions, setAllCompletions] = useState<CompletionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const inProgressJob = useMemo(
    () => activeJobs.find((o) => o.status === 'In Progress') ?? null,
    [activeJobs],
  )

  useEffect(() => {
    if (!inProgressJob) return
    const key = `sejuk-job-started-${inProgressJob.id}`
    const saved = localStorage.getItem(key)
    if (!saved) return
    const ts = Number(saved)
    setElapsed(Math.floor((Date.now() - ts) / 1000))
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - ts) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [inProgressJob])

  const load = async (r: Range) => {
    setLoading(true)
    const since =
      r === 'all'
        ? new Date(0).toISOString()
        : (() => {
            const d = new Date()
            d.setDate(d.getDate() - Number(r))
            return d.toISOString()
          })()

    const [{ data: activeData }, { data: rangeData }, { data: allData }] = await Promise.all([
      supabase
        .from('orders')
        .select('id, order_no, customer_name, status, service_type, created_at, address')
        .in('status', ['Assigned', 'In Progress'])
        .order('created_at', { ascending: true }),
      supabase
        .from('service_completions')
        .select('*, orders!inner(customer_name, service_type, order_no)')
        .gte('completed_at', since)
        .order('completed_at', { ascending: false }),
      supabase
        .from('service_completions')
        .select('*, orders!inner(customer_name, service_type, order_no)')
        .order('completed_at', { ascending: false }),
    ])

    setActiveJobs((activeData as unknown as Order[]) ?? [])
    setCompletions((rangeData as unknown as CompletionRow[]) ?? [])
    setAllCompletions((allData as unknown as CompletionRow[]) ?? [])
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    void load(range)
  }, [range])

  function handleRefresh() {
    setRefreshing(true)
    void load(range)
  }

  const greeting = useMemo(() => getGreeting(), [])

  const stats = useMemo(() => {
    const activeCount = activeJobs.length
    const completedThisMonth = allCompletions.filter((c) => isThisMonth(c.completed_at))
    const completedLastMonth = allCompletions.filter((c) => isLastMonth(c.completed_at))
    const completedMonth = completedThisMonth.length
    const revenueMonth = completedThisMonth.reduce((sum, c) => sum + Number(c.final_amount), 0)
    const revenueLastMonth = completedLastMonth.reduce((sum, c) => sum + Number(c.final_amount), 0)
    const withDuration = allCompletions.filter((c) => c.started_at)
    const avgDurationMin =
      withDuration.length > 0
        ? Math.round(
            withDuration.reduce((sum, c) => {
              const ms =
                new Date(c.completed_at).getTime() - new Date(c.started_at!).getTime()
              return sum + (ms > 0 ? ms : 0)
            }, 0) /
              withDuration.length /
              60000,
          )
        : null

    const revenueTrend =
      revenueLastMonth > 0
        ? Math.round(((revenueMonth - revenueLastMonth) / revenueLastMonth) * 100)
        : null
    const jobsTrend =
      completedLastMonth.length > 0
        ? completedMonth - completedLastMonth.length
        : null

    return { activeCount, completedMonth, revenueMonth, avgDurationMin, revenueTrend, jobsTrend }
  }, [activeJobs, allCompletions])

  const todayStats = useMemo(() => {
    const today = allCompletions.filter((c) => isToday(c.completed_at))
    return {
      jobs: today.length,
      revenue: today.reduce((sum, c) => sum + Number(c.final_amount), 0),
      hours: today.reduce((sum, c) => {
        if (!c.started_at) return sum
        const ms = new Date(c.completed_at).getTime() - new Date(c.started_at).getTime()
        return sum + (ms > 0 ? ms : 0)
      }, 0) / 3600000,
    }
  }, [allCompletions])

  const weeklyProgress = useMemo(() => {
    const completedThisWeek = allCompletions.filter((c) => isThisWeek(c.completed_at)).length
    const totalThisWeek = completedThisWeek + activeJobs.length
    return { completed: completedThisWeek, total: totalThisWeek }
  }, [allCompletions, activeJobs])

  const allTimeStats = useMemo(() => {
    const total = allCompletions.length
    const revenue = allCompletions.reduce((sum, c) => sum + Number(c.final_amount), 0)
    return { total, revenue }
  }, [allCompletions])

  const weeklyData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      d.setHours(0, 0, 0, 0)
      return d
    })

    return days.map((day) => {
      const dayEnd = new Date(day)
      dayEnd.setDate(dayEnd.getDate() + 1)
      const count = completions.filter((c) => {
        const cd = new Date(c.completed_at)
        return cd >= day && cd < dayEnd
      }).length
      return {
        day: day.toLocaleDateString('en-MY', { weekday: 'short' }),
        jobs: count,
      }
    })
  }, [completions])

  const serviceTypeData = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of allCompletions) {
      const type = c.orders?.service_type ?? 'Unknown'
      map.set(type, (map.get(type) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [allCompletions])

  const nextJob = useMemo(() => {
    return activeJobs.find((o) => o.status === 'Assigned') ?? null
  }, [activeJobs])

  const recentCompletions = useMemo(() => {
    return allCompletions.slice(0, 5)
  }, [allCompletions])

  const completionTotal = useMemo(() => completions.length, [completions])

  const trendLabel = (delta: number | null) => {
    if (delta == null) return null
    if (delta > 0)
      return (
        <span className="ml-1 inline-flex items-center text-xs text-emerald-600">
          <TrendingUp className="size-3" />
          {delta}
        </span>
      )
    if (delta < 0)
      return (
        <span className="ml-1 inline-flex items-center text-xs text-destructive">
          <TrendingDown className="size-3" />
          {Math.abs(delta)}
        </span>
      )
    return <span className="ml-1 text-xs text-muted-foreground">—</span>
  }

  return (
    <div className="space-y-4">
      {/* Greeting banner */}
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
                <span className="capitalize text-sidebar-primary">{session?.name ?? 'Technician'}</span>
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

          <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto sm:items-center">
            <GreetingStat icon={Briefcase} value={allTimeStats.total} label="Jobs Completed (All-Time)" />
            <GreetingStat
              icon={DollarSign}
              value={`RM ${allTimeStats.revenue.toFixed(2)}`}
              label="Earned (All-Time)"
            />
            <div className="col-span-2 flex items-center justify-center gap-3 rounded-xl border border-sidebar-primary/20 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm sm:col-span-1 sm:justify-start">
              <ProgressRing
                value={weeklyProgress.completed}
                max={weeklyProgress.total}
                size={52}
                labelClassName="text-xs"
              />
              <div className="text-left">
                <p className="text-lg leading-none font-bold text-gray-900">
                  {weeklyProgress.total > 0 ? `${weeklyProgress.completed}/${weeklyProgress.total}` : 'No jobs yet'}
                </p>
                <p className="mt-1 text-[11px] whitespace-nowrap text-muted-foreground">This Week</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* In-progress indicator */}
      {inProgressJob && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium text-amber-900">Job in progress</p>
              <p className="text-sm text-amber-800">
                {inProgressJob.order_no} — {inProgressJob.customer_name}
              </p>
              <p className="text-xs text-amber-700">
                {inProgressJob.service_type} &middot;{' '}
                <span className="font-mono">{formatElapsed(elapsed)}</span> elapsed
              </p>
            </div>
            <Button size="sm" asChild>
              <Link to={`/technician/jobs/${inProgressJob.id}`}>
                Resume <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Date range filter */}
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
            size="icon-sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <Skeleton className="h-16 w-full" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Briefcase}
              label="Active Jobs"
              value={stats.activeCount.toString()}
              to="/technician/jobs"
              tone="from-brand-500 to-brand-600"
              wash="from-brand-500/25 to-transparent"
            />
            <StatCard
              icon={CheckCircle2}
              label="Completed This Month"
              value={stats.completedMonth.toString()}
              trend={trendLabel(stats.jobsTrend)}
              to="/technician/history"
              tone="from-emerald-500 to-emerald-600"
              wash="from-emerald-500/25 to-transparent"
            />
            <StatCard
              icon={DollarSign}
              label="Revenue This Month"
              value={`RM ${stats.revenueMonth.toFixed(2)}`}
              trend={
                stats.revenueTrend != null ? (
                  <span
                    className={`ml-1 text-xs ${stats.revenueTrend >= 0 ? 'text-emerald-600' : 'text-destructive'}`}
                  >
                    {stats.revenueTrend >= 0 ? '+' : ''}
                    {stats.revenueTrend}% vs last
                  </span>
                ) : null
              }
              tone="from-violet-500 to-violet-600"
              wash="from-violet-500/25 to-transparent"
            />
            <StatCard
              icon={Clock}
              label="Avg Time Per Job"
              value={stats.avgDurationMin != null ? `${stats.avgDurationMin}m` : '—'}
              tone="from-amber-500 to-amber-600"
              wash="from-amber-500/25 to-transparent"
            />
          </div>

          {/* Today's snapshot */}
          <div className="flex gap-4 overflow-x-auto rounded-xl border bg-card p-4 text-sm">
            <div className="flex-1 text-center">
              <p className="text-xs text-muted-foreground uppercase">Today's Jobs</p>
              <p className="mt-1 text-xl font-semibold">{todayStats.jobs}</p>
            </div>
            <div className="w-px shrink-0 bg-border" />
            <div className="flex-1 text-center">
              <p className="text-xs text-muted-foreground uppercase">Today's Revenue</p>
              <p className="mt-1 text-xl font-semibold">RM {todayStats.revenue.toFixed(2)}</p>
            </div>
            <div className="w-px shrink-0 bg-border" />
            <div className="flex-1 text-center">
              <p className="text-xs text-muted-foreground uppercase">Hours on Site</p>
              <p className="mt-1 text-xl font-semibold">{todayStats.hours.toFixed(1)}h</p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Jobs Completed ({completionTotal})</CardTitle>
              </CardHeader>
              <CardContent>
                {weeklyData.every((d) => d.jobs === 0) ? (
                  <p className="text-sm text-muted-foreground">No completed jobs in this period.</p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weeklyData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'var(--card)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 13,
                          }}
                        />
                        <Bar dataKey="jobs" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Service Types</CardTitle>
              </CardHeader>
              <CardContent>
                {serviceTypeData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data yet.</p>
                ) : (
                  <>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={serviceTypeData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            innerRadius={50}
                          >
                            {serviceTypeData.map((entry) => (
                              <Cell
                                key={entry.name}
                                fill={SERVICE_COLORS[entry.name] ?? 'var(--chart-3)'}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'var(--card)',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-md)',
                              fontSize: 13,
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-3 flex flex-wrap justify-center gap-3">
                      {serviceTypeData.map((s) => (
                        <div key={s.name} className="flex items-center gap-1.5 text-xs">
                          <span
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: SERVICE_COLORS[s.name] ?? 'var(--chart-3)' }}
                          />
                          {s.name} ({s.value})
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Next job */}
          {nextJob && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Next Job</CardTitle>
              </CardHeader>
              <CardContent>
                <Link
                  to={`/technician/jobs/${nextJob.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent/50"
                >
                  <div>
                    <p className="font-mono text-sm font-medium">{nextJob.order_no}</p>
                    <p className="text-sm">{nextJob.customer_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {nextJob.service_type} &middot; {nextJob.address?.slice(0, 40)}
                      {(nextJob.address?.length ?? 0) > 40 ? '…' : ''}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-primary">Start Job &rarr;</span>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Recent completions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Completions</CardTitle>
            </CardHeader>
            <CardContent>
              {recentCompletions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No completed jobs yet.</p>
              ) : (
                <>
                  {/* Stacked list on mobile — avoids a 4-column table needing horizontal
                      scroll to reach "Duration" on a narrow screen. */}
                  <div className="space-y-2 sm:hidden">
                    {recentCompletions.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-medium">{c.orders?.order_no ?? '—'}</p>
                          <p className="truncate text-muted-foreground">
                            {c.orders?.customer_name ?? '—'}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-medium">RM {Number(c.final_amount).toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDuration(c.started_at, c.completed_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Table className="hidden sm:table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentCompletions.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">
                          {c.orders?.order_no ?? '—'}
                        </TableCell>
                        <TableCell>{c.orders?.customer_name ?? '—'}</TableCell>
                        <TableCell>RM {Number(c.final_amount).toFixed(2)}</TableCell>
                        <TableCell>{formatDuration(c.started_at, c.completed_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </>
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
  value: string | number
  label: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-sidebar-primary/20 bg-white/80 px-3 py-3 shadow-sm backdrop-blur-sm">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sidebar-primary to-sidebar-primary/70 shadow-sm">
        <Icon className="size-5 text-white" />
      </div>
      <div className="min-w-0 text-left">
        <p className="text-xl leading-none font-bold text-gray-900">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  to,
  tone = 'from-slate-500 to-slate-600',
  wash = 'from-slate-500/15 to-transparent',
}: {
  icon: typeof Briefcase
  label: string
  value: string
  trend?: React.ReactNode
  to?: string
  tone?: string
  wash?: string
}) {
  const content = (
    <Card
      className={`relative overflow-hidden border border-gray-200 ${to ? 'transition-colors hover:bg-accent/50' : ''}`}
    >
      <div
        className={`pointer-events-none absolute -top-8 -right-8 size-28 rounded-full bg-gradient-to-br ${wash} blur-2xl`}
      />
      <CardContent className="relative flex items-center justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold">
            {value}
            {trend}
          </p>
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
