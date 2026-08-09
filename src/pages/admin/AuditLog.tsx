import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  Search,
  ShieldCheck,
  Wrench,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import type { AuditLogEntry, Role } from '../../types'
import { generatePages } from '../../lib/pagination'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { Skeleton } from '../../components/ui/skeleton'

const PAGE_SIZE = 20

const ROLE_BADGE: Record<Role, string> = {
  admin: 'bg-sky-100 text-sky-700',
  technician: 'bg-violet-100 text-violet-700',
  manager: 'bg-emerald-100 text-emerald-700',
}

const ROLE_DOT: Record<Role, string> = {
  admin: 'bg-sky-400',
  technician: 'bg-violet-400',
  manager: 'bg-emerald-400',
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

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

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

function exportCSV(entries: AuditLogEntry[]) {
  const header = 'When,Order,Action,Role,Actor\n'
  const rows = entries
    .map((e) =>
      [
        new Date(e.created_at).toLocaleString(),
        e.orders?.order_no ?? '',
        `"${e.action.replace(/"/g, '""')}"`,
        e.actor_role,
        `"${e.actor_name.replace(/"/g, '""')}"`,
      ].join(','),
    )
    .join('\n')
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [summary, setSummary] = useState<Record<string, number>>({})

  const debouncedSearch = useDebounce(search, 300)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    supabase
      .from('audit_log')
      .select('actor_role')
      .then(({ data }) => {
        if (!data) return
        const counts: Record<string, number> = {}
        for (const row of data as { actor_role: string }[]) {
          counts[row.actor_role] = (counts[row.actor_role] ?? 0) + 1
        }
        setSummary(counts)
      })
  }, [])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, roleFilter, fromDate, toDate])

  function buildQuery() {
    let query = supabase.from('audit_log').select('*, orders ( order_no )', { count: 'exact' })

    if (debouncedSearch.trim()) {
      const term = debouncedSearch.trim().replace(/[,%]/g, '')
      query = query.or(`action.ilike.%${term}%,actor_name.ilike.%${term}%`)
    }
    if (roleFilter !== 'all') {
      query = query.eq('actor_role', roleFilter)
    }
    if (fromDate) {
      query = query.gte('created_at', new Date(fromDate).toISOString())
    }
    if (toDate) {
      const end = new Date(toDate)
      end.setHours(23, 59, 59, 999)
      query = query.lte('created_at', end.toISOString())
    }
    return query
  }

  useEffect(() => {
    async function load() {
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      const from = (page - 1) * PAGE_SIZE
      const { data, count } = await buildQuery()
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
        .abortSignal(controller.signal)

      if (controller.signal.aborted) return

      setEntries((data as unknown as AuditLogEntry[]) ?? [])
      setTotalCount(count ?? 0)
      setLoading(false)
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, roleFilter, fromDate, toDate, page])

  async function handleExport() {
    setExporting(true)
    try {
      const { data } = await buildQuery().order('created_at', { ascending: false })
      exportCSV((data as unknown as AuditLogEntry[]) ?? [])
    } finally {
      setExporting(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const pages = generatePages(page, totalPages)

  const summaryCards = [
    {
      label: 'Total Entries',
      value: Object.values(summary).reduce((a, b) => a + b, 0),
      icon: Activity,
      color: 'bg-blue-500',
      bgLight: 'bg-blue-50',
      textColor: 'text-blue-600',
    },
    {
      label: 'Admin',
      value: summary['admin'] ?? 0,
      icon: ShieldCheck,
      color: 'bg-sky-500',
      bgLight: 'bg-sky-50',
      textColor: 'text-sky-600',
    },
    {
      label: 'Technician',
      value: summary['technician'] ?? 0,
      icon: Wrench,
      color: 'bg-violet-500',
      bgLight: 'bg-violet-50',
      textColor: 'text-violet-600',
    },
    {
      label: 'Manager',
      value: summary['manager'] ?? 0,
      icon: ClipboardCheck,
      color: 'bg-emerald-500',
      bgLight: 'bg-emerald-50',
      textColor: 'text-emerald-600',
    },
  ]

  return (
    <div className="space-y-6 p-1">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summaryCards.map((card) => {
          const total = summaryCards[0].value
          const pct = total > 0 ? Math.round((card.value / total) * 100) : 0
          return (
            <Card key={card.label} className="p-4 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {card.label}
                </p>
                <div className={`flex size-8 items-center justify-center rounded-lg ${card.bgLight}`}>
                  <card.icon className={`size-4 ${card.textColor}`} />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900">{card.value}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="h-1.5 flex-1 rounded-full bg-gray-100">
                  <span
                    className={`block h-full rounded-full ${card.color}`}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="text-[10px] font-medium text-gray-400">{pct}% of total</span>
              </div>
            </Card>
          )
        })}
      </div>

      <Card className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search action or actor…"
                  className="pl-9 h-9 text-sm border-gray-200"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as Role | 'all')}>
                <SelectTrigger className="h-9 w-[150px] text-sm border-gray-200">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="technician">Technician</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
              <label className="flex flex-col gap-1 text-[11px] font-medium text-gray-500">
                From
                <Input
                  type="date"
                  className="h-9 text-sm border-gray-200"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium text-gray-500">
                To
                <Input
                  type="date"
                  className="h-9 text-sm border-gray-200"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </label>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-9 text-gray-600"
              disabled={exporting}
              onClick={() => void handleExport()}
            >
              <Download className="size-4" />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Search className="size-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">No audit entries match these filters.</p>
              <p className="text-xs mt-1">Try adjusting your search or filter criteria.</p>
            </div>
          ) : (
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    When
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Order
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Actor
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-gray-100 hover:bg-gray-50/70 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {new Date(e.created_at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm font-medium whitespace-nowrap">
                      {e.orders?.order_no ? (
                        <Link to={`/admin/orders/${e.order_id}`} className="text-primary hover:underline">
                          {e.orders.order_no}
                        </Link>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{e.action}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${getAvatarColor(e.actor_name)}`}
                        >
                          {getInitials(e.actor_name)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{e.actor_name}</p>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${ROLE_BADGE[e.actor_role]}`}
                          >
                            <span className={`size-1.5 rounded-full ${ROLE_DOT[e.actor_role]}`} />
                            {e.actor_role}
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!loading && entries.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of{' '}
              {totalCount} entries
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="h-8 w-8 p-0 border-gray-200"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                {pages.map((p, i) =>
                  p === 'ellipsis' ? (
                    <span
                      key={`e-${i}`}
                      className="flex size-8 items-center justify-center text-xs text-gray-400"
                    >
                      …
                    </span>
                  ) : (
                    <Button
                      key={p}
                      variant={p === page ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPage(p)}
                      className={`h-8 w-8 p-0 text-xs font-medium ${
                        p === page ? '' : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      {p}
                    </Button>
                  ),
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-8 w-8 p-0 border-gray-200"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
