import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Briefcase, DollarSign, Users } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import type { ServiceCompletion } from '../../types'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
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

interface RescheduleRow {
  orders: { technicians: { name: string } | null } | null
}

export default function Dashboard() {
  const [completions, setCompletions] = useState<ServiceCompletion[]>([])
  const [rescheduleCounts, setRescheduleCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<Range>('7')

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
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard icon={Briefcase} label="Jobs Completed" value={totals.jobs.toString()} />
            <StatCard
              icon={DollarSign}
              label="Total Amount"
              value={`RM ${totals.amount.toFixed(2)}`}
            />
            <StatCard icon={Users} label="Active Technicians" value={stats.length.toString()} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Jobs Completed by Technician</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.length === 0 ? (
                <p className="text-sm text-muted-foreground">No completed jobs in this period.</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--card)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          fontSize: 13,
                        }}
                      />
                      <Bar dataKey="jobsCompleted" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Leaderboard</CardTitle>
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
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.jobsCompleted}</TableCell>
                      <TableCell>RM {s.totalAmount.toFixed(2)}</TableCell>
                      <TableCell>{rescheduleCounts[s.name] ?? 0}</TableCell>
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
}: {
  icon: typeof Briefcase
  label: string
  value: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  )
}
