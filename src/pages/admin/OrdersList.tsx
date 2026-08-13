import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  PackageCheck,
  PackageOpen,
  PlusCircle,
  Search,
  ShoppingBag,
  XCircle,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import type { Order, OrderStatus, Technician } from '../../types'
import { STATUS_ORDER } from '../../lib/orderStatus'
import { generatePages } from '../../lib/pagination'
import { useDebounce } from '../../hooks/useDebounce'
import { useAuth } from '../../context/AuthContext'
import { logAction } from '../../lib/audit'
import { notifyTechnician } from '../../lib/notifications'
import { getErrorMessage } from '../../lib/errors'
import StatusBadge from '../../components/StatusBadge'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import { Skeleton } from '../../components/ui/skeleton'

const PAGE_SIZE = 10

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

const STATUS_DOT: Record<OrderStatus, string> = {
  New: 'bg-slate-400',
  Assigned: 'bg-sky-400',
  'In Progress': 'bg-amber-400',
  'Job Done': 'bg-violet-400',
  Reviewed: 'bg-emerald-400',
  Closed: 'bg-slate-500',
  Cancelled: 'bg-red-400',
}

type SortField = 'created_at' | 'order_no' | 'customer_name' | 'service_type' | 'quoted_price' | 'status'
type SortDir = 'asc' | 'desc'

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

function exportCSV(orders: Order[], technicians: Technician[]) {
  const header = 'Order No.,Customer,Phone,Service,Technician,Quoted,Status,Created\n'
  const rows = orders
    .map((o) => {
      const tech = technicians.find((t) => t.id === o.assigned_technician_id)
      return [
        o.order_no,
        `"${(o.customer_name ?? '').replace(/"/g, '""')}"`,
        `"${(o.phone ?? '').replace(/"/g, '""')}"`,
        `"${(o.service_type ?? '').replace(/"/g, '""')}"`,
        tech?.name ?? '',
        Number(o.quoted_price).toFixed(2),
        o.status,
        o.created_at,
      ].join(',')
    })
    .join('\n')
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function OrdersList() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
  const [technicianFilter, setTechnicianFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [summary, setSummary] = useState<Record<string, number>>({})
  const [exporting, setExporting] = useState(false)

  const [bulkTechnicianId, setBulkTechnicianId] = useState('')
  const [bulkAssigning, setBulkAssigning] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)

  const debouncedSearch = useDebounce(search, 300)
  const abortRef = useRef<AbortController | null>(null)

  const prevFilters = useRef({ search: '', status: 'all' as OrderStatus | 'all', tech: 'all' })

  useEffect(() => {
    supabase
      .from('technicians')
      .select('id, name, phone, active')
      .order('name')
      .then(({ data }) => setTechnicians((data as Technician[]) ?? []))
  }, [])

  useEffect(() => {
    supabase
      .from('orders')
      .select('status')
      .then(({ data }) => {
        if (!data) return
        const counts: Record<string, number> = {}
        for (const row of data as { status: string }[]) {
          counts[row.status] = (counts[row.status] ?? 0) + 1
        }
        setSummary(counts)
      })
  }, [])

  const load = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    let query = supabase
      .from('orders')
      .select('*, technicians ( id, name )', { count: 'exact' })

    if (debouncedSearch.trim()) {
      const term = debouncedSearch.trim().replace(/[,%]/g, '')
      query = query.or(`order_no.ilike.%${term}%,customer_name.ilike.%${term}%`)
    }
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }
    if (technicianFilter === 'unassigned') {
      query = query.is('assigned_technician_id', null)
    } else if (technicianFilter !== 'all') {
      query = query.eq('assigned_technician_id', technicianFilter)
    }

    const from = (page - 1) * PAGE_SIZE
    const { data, count } = await query
      .order(sortField, { ascending: sortDir === 'asc' })
      .range(from, from + PAGE_SIZE - 1)
      .abortSignal(controller.signal)

    if (controller.signal.aborted) return

    setOrders((data as unknown as Order[]) ?? [])
    setTotalCount(count ?? 0)
    setSelectedIds(new Set())
    setLoading(false)
  }, [debouncedSearch, statusFilter, technicianFilter, page, sortField, sortDir])

  useEffect(() => {
    const filtersChanged =
      debouncedSearch !== prevFilters.current.search ||
      statusFilter !== prevFilters.current.status ||
      technicianFilter !== prevFilters.current.tech

    if (filtersChanged && page !== 1) {
      prevFilters.current = { search: debouncedSearch, status: statusFilter, tech: technicianFilter }
      setPage(1)
      return
    }

    prevFilters.current = { search: debouncedSearch, status: statusFilter, tech: technicianFilter }
    void load()
  }, [debouncedSearch, statusFilter, technicianFilter, page, sortField, sortDir, load])

  async function handleExportAll() {
    setExporting(true)
    try {
      let query = supabase.from('orders').select('*, technicians ( id, name )')

      if (debouncedSearch.trim()) {
        const term = debouncedSearch.trim().replace(/[,%]/g, '')
        query = query.or(`order_no.ilike.%${term}%,customer_name.ilike.%${term}%`)
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }
      if (technicianFilter === 'unassigned') {
        query = query.is('assigned_technician_id', null)
      } else if (technicianFilter !== 'all') {
        query = query.eq('assigned_technician_id', technicianFilter)
      }

      const { data } = await query.order(sortField, { ascending: sortDir === 'asc' })
      exportCSV((data as unknown as Order[]) ?? [], technicians)
    } finally {
      setExporting(false)
    }
  }

  async function handleBulkAssign() {
    if (!session || !bulkTechnicianId || selectedIds.size === 0) return
    setBulkAssigning(true)
    setBulkError(null)
    try {
      const technician = technicians.find((t) => t.id === bulkTechnicianId)
      const targets = orders.filter((o) => selectedIds.has(o.id))
      const failed: string[] = []

      for (const order of targets) {
        const statusBump = order.status === 'New' && !order.assigned_technician_id
        const { error } = await supabase
          .from('orders')
          .update({
            assigned_technician_id: bulkTechnicianId,
            ...(statusBump ? { status: 'Assigned' } : {}),
          })
          .eq('id', order.id)

        if (error) {
          failed.push(order.order_no)
          continue
        }

        await logAction({
          orderId: order.id,
          action: `Order assigned to ${technician?.name ?? 'technician'} (bulk)`,
          actorRole: 'admin',
          actorName: session.name,
        })
        await notifyTechnician(bulkTechnicianId, {
          title: 'Job assigned to you',
          body: `${order.order_no} — ${order.service_type} for ${order.customer_name}`,
          orderId: order.id,
          link: '/technician/jobs',
        })
      }

      if (failed.length > 0) {
        setBulkError(`Failed to assign: ${failed.join(', ')}`)
      } else {
        setBulkTechnicianId('')
      }
      await load()
    } catch (err) {
      setBulkError(getErrorMessage(err, 'Bulk assignment failed'))
    } finally {
      setBulkAssigning(false)
    }
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'created_at' ? 'desc' : 'asc')
    }
    setPage(1)
  }

  function toggleSelectAll() {
    if (selectedIds.size === orders.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(orders.map((o) => o.id)))
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedIds(next)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const pages = generatePages(page, totalPages)
  const allSelected = orders.length > 0 && selectedIds.size === orders.length

  const summaryCards = [
    {
      label: 'Total Orders',
      value: Object.values(summary).reduce((a, b) => a + b, 0),
      icon: ShoppingBag,
      color: 'bg-blue-500',
      bgLight: 'bg-blue-50',
      textColor: 'text-blue-600',
    },
    {
      label: 'New',
      value: summary['New'] ?? 0,
      icon: PackageOpen,
      color: 'bg-slate-500',
      bgLight: 'bg-slate-50',
      textColor: 'text-slate-600',
    },
    {
      label: 'In Progress',
      value:
        (summary['Assigned'] ?? 0) +
        (summary['In Progress'] ?? 0) +
        (summary['Job Done'] ?? 0) +
        (summary['Reviewed'] ?? 0),
      icon: Layers,
      color: 'bg-amber-500',
      bgLight: 'bg-amber-50',
      textColor: 'text-amber-600',
    },
    {
      label: 'Closed',
      value: summary['Closed'] ?? 0,
      icon: PackageCheck,
      color: 'bg-gray-500',
      bgLight: 'bg-gray-50',
      textColor: 'text-gray-600',
    },
    {
      label: 'Cancelled',
      value: summary['Cancelled'] ?? 0,
      icon: XCircle,
      color: 'bg-red-500',
      bgLight: 'bg-red-50',
      textColor: 'text-red-600',
    },
  ]

  return (
    <div className="space-y-6 p-1">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
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
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search order no. or customer…"
                  className="pl-9 h-9 text-sm border-gray-200"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as OrderStatus | 'all')}
              >
                <SelectTrigger className="h-9 w-[160px] text-sm border-gray-200">
                  <Filter className="size-3.5 text-gray-400" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={technicianFilter} onValueChange={setTechnicianFilter}>
                <SelectTrigger className="h-9 w-[160px] text-sm border-gray-200">
                  <Filter className="size-3.5 text-gray-400" />
                  <SelectValue placeholder="Technician" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All technicians</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {technicians.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 h-9 text-gray-600">
                    <Download className="size-4" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem disabled={exporting} onClick={() => void handleExportAll()}>
                    <FileSpreadsheet className="size-4" />
                    {exporting ? 'Exporting…' : 'Export CSV (all matching)'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => window.print()}>
                    <FileText className="size-4" />
                    Print current page
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button asChild size="sm" className="h-9">
                <Link to="/admin/new-order">
                  <PlusCircle className="size-4" />
                  New Order
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 bg-primary/5 px-4 py-2.5">
            <span className="text-sm font-medium text-gray-700">
              {selectedIds.size} selected
            </span>
            <Select value={bulkTechnicianId} onValueChange={setBulkTechnicianId}>
              <SelectTrigger className="h-8 w-[180px] text-sm border-gray-200 bg-white">
                <SelectValue placeholder="Assign technician…" />
              </SelectTrigger>
              <SelectContent>
                {technicians.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8"
              disabled={!bulkTechnicianId || bulkAssigning}
              onClick={() => void handleBulkAssign()}
            >
              {bulkAssigning ? 'Assigning…' : 'Assign'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-gray-200"
              disabled={bulkAssigning}
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
            {bulkError && <span className="text-sm text-red-600">{bulkError}</span>}
          </div>
        )}

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Search className="size-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">No orders match these filters.</p>
              <p className="text-xs mt-1">Try adjusting your search or filter criteria.</p>
            </div>
          ) : (
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <SortHeader
                    field="order_no"
                    label="Order No."
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortHeader
                    field="customer_name"
                    label="Customer"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortHeader
                    field="service_type"
                    label="Service"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Technician
                  </th>
                  <SortHeader
                    field="quoted_price"
                    label="Quoted"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortHeader
                    field="status"
                    label="Status"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortHeader
                    field="created_at"
                    label="Created"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                    className="hidden md:table-cell"
                  />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-gray-100 hover:bg-gray-50/70 transition-colors cursor-pointer"
                    onClick={() => navigate(`/admin/orders/${o.id}`)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="size-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                        checked={selectedIds.has(o.id)}
                        onChange={() => toggleSelect(o.id)}
                      />
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
                        <span className="text-sm font-medium text-gray-900">{o.customer_name}</span>
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
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                      RM {Number(o.quoted_price).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`size-2 rounded-full ${STATUS_DOT[o.status]}`} />
                        <StatusBadge status={o.status} />
                      </div>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {new Date(o.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!loading && orders.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of{' '}
              {totalCount} results
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
      className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100/70 transition-colors whitespace-nowrap ${className}`}
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
