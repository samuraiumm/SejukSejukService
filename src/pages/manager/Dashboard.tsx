import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  Briefcase,
  ClipboardCheck,
  Crown,
  DollarSign,
  Flame,
  Users,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import type { CompletionAttachment, Order, ServiceCompletion } from '../../types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Avatar, AvatarFallback } from '../../components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table'
import { Skeleton } from '../../components/ui/skeleton'

type Range = '7' | '30'

interface TechStats {
  name: string
  jobsCompleted: number
  totalAmount: number
}

// A fixed identity color per seeded technician, so the same person is always
// the same color across the bar chart and the leaderboard avatars. Red/rose
// is deliberately left out of this palette — it's reserved for the
// "Overloaded" badge below, so a technician's own color never reads as a
// warning by coincidence.
const TECH_COLORS: Record<string, string> = {
  Ali: '#0e8fd9',
  John: '#10b981',
  Bala: '#8b5cf6',
  Yusoff: '#f59e0b',
}
const FALLBACK_TECH_COLORS = ['#14b8a6', '#ec4899', '#6366f1', '#84cc16']

function colorForTechnician(name: string, index: number) {
  return TECH_COLORS[name] ?? FALLBACK_TECH_COLORS[index % FALLBACK_TECH_COLORS.length]
}

// Same "overloaded" heuristic as the AI Operational Insight query
// (server/aiQueryCore.ts) — surfaced directly on the leaderboard so a
// manager sees it while scanning, without having to ask the AI assistant.
const OVERLOAD_RATIO = 1.4
const MIN_JOBS_FOR_OVERLOAD = 3

const RANK_STYLES = [
  'bg-amber-100 text-amber-700', // 1st
  'bg-slate-200 text-slate-600', // 2nd
  'bg-orange-100 text-orange-700', // 3rd
]

interface RescheduleRow {
  orders: { technicians: { name: string } | null } | null
}

type ReviewOrder = Order & {
  service_completions: (ServiceCompletion & { completion_attachments: CompletionAttachment[] })[]
}

export default function Dashboard() {
  const [completions, setCompletions] = useState<ServiceCompletion[]>([])
  const [rescheduleCounts, setRescheduleCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<Range>('7')
  const [pendingReview, setPendingReview] = useState(0)
  const [flaggedCount, setFlaggedCount] = useState(0)

  useEffect(() => {
    void loadReviewQueueStats()
  }, [])

  async function loadReviewQueueStats() {
    const { data } = await supabase
      .from('orders')
      .select('*, service_completions ( *, completion_attachments ( * ) )')
      .eq('status', 'Job Done')
    const orders = (data as unknown as ReviewOrder[]) ?? []
    setPendingReview(orders.length)
    const flagged = orders.filter((o) => {
      const completion = o.service_completions?.[0]
      if (!completion) return false
      const overQuote = Number(completion.final_amount) > Number(o.quoted_price) * 1.3
      const noPhotos = (completion.completion_attachments?.length ?? 0) === 0
      return overQuote || noPhotos
    })
    setFlaggedCount(flagged.length)
  }

  useEffect(() => {
    void load(range)
  }, [range])

  async function load(days: Range) {
    setLoading(true)
    const since = new Date()
    since.setDate(since.getDate() - Number(days))

    const [{ data: completionData }, { data: rescheduleData }] = await Promise.all([
      supabase.from('service_completions').select('*').gte('completed_at', since.toISOString()),
      supabase
        .from('order_reschedules')
        .select('orders ( technicians ( name ) )')
        .gte('created_at', since.toISOString()),
    ])

    setCompletions((completionData as ServiceCompletion[]) ?? [])

    const counts: Record<string, number> = {}
    for (const r of (rescheduleData as unknown as RescheduleRow[]) ?? []) {
      const name = r.orders?.technicians?.name
      if (!name) continue
      counts[name] = (counts[name] ?? 0) + 1
    }
    setRescheduleCounts(counts)

    setLoading(false)
  }

  const stats = useMemo<TechStats[]>(() => {
    const byTech = new Map<string, TechStats>()
    for (const c of completions) {
      const entry = byTech.get(c.technician_name) ?? {
        name: c.technician_name,
        jobsCompleted: 0,
        totalAmount: 0,
      }
      entry.jobsCompleted += 1
      entry.totalAmount += Number(c.final_amount)
      byTech.set(c.technician_name, entry)
    }
    return [...byTech.values()].sort((a, b) => b.jobsCompleted - a.jobsCompleted)
  }, [completions])

  const totals = useMemo(
    () => ({
      jobs: completions.length,
      amount: completions.reduce((sum, c) => sum + Number(c.final_amount), 0),
    }),
    [completions],
  )

  const overloadedNames = useMemo(() => {
    if (stats.length < 2) return new Set<string>()
    const average = totals.jobs / stats.length
    return new Set(
      stats
        .filter((s) => s.jobsCompleted >= MIN_JOBS_FOR_OVERLOAD && s.jobsCompleted > average * OVERLOAD_RATIO)
        .map((s) => s.name),
    )
  }, [stats, totals.jobs])

  const maxJobs = stats[0]?.jobsCompleted ?? 0
  const periodLabel = `Last ${range} days`

  const dailyStats = useMemo(() => {
    const days = Number(range)
    const buckets = new Map<string, number>()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      buckets.set(d.toISOString().slice(0, 10), 0)
    }
    for (const c of completions) {
      const key = c.completed_at.slice(0, 10)
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1)
    }
    return [...buckets.entries()].map(([key, jobs]) => ({
      label: new Date(key).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      jobs,
    }))
  }, [completions, range])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div />
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          {(['7', '30'] as Range[]).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? 'default' : 'ghost'}
              onClick={() => setRange(r)}
            >
              Last {r} days
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              icon={ClipboardCheck}
              label="Awaiting Review"
              value={pendingReview.toString()}
              to="/manager/review"
              tone="bg-sky-50 text-sky-600"
            />
            <StatCard
              icon={AlertTriangle}
              label="Flagged"
              value={flaggedCount.toString()}
              to="/manager/review"
              tone="bg-red-50 text-red-600"
            />
            <StatCard
              icon={Briefcase}
              label="Jobs Completed"
              value={totals.jobs.toString()}
              tone="bg-brand-50 text-brand-600"
            />
            <StatCard
              icon={DollarSign}
              label="Total Amount"
              value={`RM ${totals.amount.toFixed(2)}`}
              tone="bg-emerald-50 text-emerald-600"
            />
            <StatCard
              icon={Users}
              label="Active Technicians"
              value={stats.length.toString()}
              tone="bg-violet-50 text-violet-600"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Jobs Completed by Technician</CardTitle>
                <CardDescription>{periodLabel}</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No completed jobs in this period.</p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats} margin={{ top: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <Tooltip
                          cursor={{ fill: 'var(--accent)' }}
                          contentStyle={{
                            backgroundColor: 'var(--card)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 13,
                          }}
                        />
                        <Bar dataKey="jobsCompleted" radius={[6, 6, 0, 0]} maxBarSize={56}>
                          <LabelList
                            dataKey="jobsCompleted"
                            position="top"
                            className="fill-foreground text-xs font-medium"
                          />
                          {stats.map((s, i) => (
                            <Cell key={s.name} fill={colorForTechnician(s.name, i)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Jobs Completed Over Time</CardTitle>
                <CardDescription>{periodLabel}</CardDescription>
              </CardHeader>
              <CardContent>
                {totals.jobs === 0 ? (
                  <p className="text-sm text-muted-foreground">No completed jobs in this period.</p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dailyStats} margin={{ top: 20 }}>
                        <defs>
                          <linearGradient id="jobsTrendFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 12 }}
                          interval={range === '30' ? 3 : 0}
                        />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={28} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'var(--card)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 13,
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="jobs"
                          stroke="var(--color-chart-1)"
                          strokeWidth={2}
                          fill="url(#jobsTrendFill)"
                          dot={dailyStats.length <= 14}
                          activeDot={{ r: 4 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Leaderboard</CardTitle>
              <CardDescription>{periodLabel}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Technician</TableHead>
                    <TableHead>Jobs Completed</TableHead>
                    <TableHead>Total Amount</TableHead>
                    <TableHead>Postpone / Reschedule</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.map((s, i) => (
                    <TableRow key={s.name}>
                      <TableCell>
                        {i < 3 ? (
                          <span
                            className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${RANK_STYLES[i]}`}
                          >
                            {i === 0 ? <Crown className="size-3.5" /> : i + 1}
                          </span>
                        ) : (
                          <span className="pl-2 text-muted-foreground">{i + 1}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar size="sm">
                            <AvatarFallback
                              style={{
                                backgroundColor: `${colorForTechnician(s.name, i)}1a`,
                                color: colorForTechnician(s.name, i),
                              }}
                            >
                              {s.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{s.name}</span>
                          {overloadedNames.has(s.name) && (
                            <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-red-600">
                              <Flame className="size-3" />
                              Overloaded
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="tabular-nums">{s.jobsCompleted}</span>
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${maxJobs > 0 ? (s.jobsCompleted / maxJobs) * 100 : 0}%`,
                                backgroundColor: colorForTechnician(s.name, i),
                              }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">RM {s.totalAmount.toFixed(2)}</TableCell>
                      <TableCell className="tabular-nums">{rescheduleCounts[s.name] ?? 0}</TableCell>
                    </TableRow>
                  ))}
                  {stats.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No data for this period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
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
  to,
  tone = 'bg-accent text-accent-foreground',
}: {
  icon: typeof Briefcase
  label: string
  value: string
  to?: string
  tone?: string
}) {
  const content = (
    <Card className={to ? 'transition-shadow hover:shadow-md' : ''}>
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <div className={`flex size-10 items-center justify-center rounded-lg ${tone}`}>
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
