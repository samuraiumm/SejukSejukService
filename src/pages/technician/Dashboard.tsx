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
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
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

function getGreeting(): { text: string; emoji: string; message: string } {
  const hour = new Date().getHours()
  if (hour < 12) return { text: 'Good morning', emoji: '☀️', message: "Let's have a productive day!" }
  if (hour < 17) return { text: 'Good afternoon', emoji: '🌤', message: 'Hope your day is going well.' }
  return { text: 'Good evening', emoji: '🌙', message: 'Almost time to wrap up.' }
}

function ProgressRing({ value, max, size = 72 }: { value: number; max: number; size?: number }) {
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
          stroke="var(--color-chart-1)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="absolute text-sm font-bold">{Math.round(pct)}%</span>
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
      <Card className="overflow-hidden border-0 bg-gradient-to-r from-primary/5 via-accent/50 to-transparent shadow-sm">
        <CardContent className="flex items-center justify-between p-5">
          <div>
            <p className="text-lg font-semibold">
              {greeting.emoji} {greeting.text}, <span className="capitalize">{session?.name ?? 'Technician'}</span>
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
            <p className="mt-2 text-xs text-muted-foreground">
              <Sparkles className="inline size-3" /> All-time: {allTimeStats.total} jobs completed, RM{' '}
              {allTimeStats.revenue.toFixed(2)} earned
            </p>
          </div>
          <ProgressRing value={weeklyProgress.completed} max={weeklyProgress.total} />
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
            />
            <StatCard
              icon={CheckCircle2}
              label="Completed This Month"
              value={stats.completedMonth.toString()}
              trend={trendLabel(stats.jobsTrend)}
              to="/technician/history"
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
            />
            <StatCard
              icon={Clock}
              label="Avg Time Per Job"
              value={stats.avgDurationMin != null ? `${stats.avgDurationMin}m` : '—'}
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
                  <div className="h-64">
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
                          label={({ name, value }) => `${name} (${value})`}
                          labelLine={false}
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
                <Table>
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
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  to,
}: {
  icon: typeof Briefcase
  label: string
  value: string
  trend?: React.ReactNode
  to?: string
}) {
  const content = (
    <Card className={to ? 'transition-colors hover:bg-accent/50' : ''}>
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold">
            {value}
            {trend}
          </p>
        </div>
        <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-5" />
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
