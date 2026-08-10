import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Search,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import type { Order, ServiceCompletion, CompletionAttachment } from '../../types'
import CompletionAttachmentsGallery from '../../components/CompletionAttachmentsGallery'
import { Card, CardContent } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Skeleton } from '../../components/ui/skeleton'

const SERVICE_INITIAL_COLORS: Record<string, string> = {
  'Aircond cleaning': 'bg-blue-100 text-blue-700',
  'Aircond repair': 'bg-emerald-100 text-emerald-700',
  'Gas refill': 'bg-amber-100 text-amber-700',
  Installation: 'bg-violet-100 text-violet-700',
  Inspection: 'bg-rose-100 text-rose-700',
}

function serviceColor(serviceType: string): string {
  return SERVICE_INITIAL_COLORS[serviceType] ?? 'bg-gray-100 text-gray-700'
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

type HistoryEntry = ServiceCompletion & {
  orders: Pick<Order, 'order_no' | 'customer_name' | 'service_type' | 'address'>
  completion_attachments: Pick<CompletionAttachment, 'file_url' | 'file_type'>[]
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(startedAt: string | null, completedAt: string): string {
  if (!startedAt) return '—'
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 0) return '—'
  const totalMin = Math.round(ms / 60000)
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export default function JobHistory() {
  const { session } = useAuth()
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!session?.technicianId) return
    void load()
  }, [session])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('service_completions')
      .select(
        '*, orders!inner(order_no, customer_name, service_type, address), completion_attachments(file_url, file_type)',
      )
      .order('completed_at', { ascending: false })
    setEntries((data as unknown as HistoryEntry[]) ?? [])
    setLoading(false)
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const filteredEntries = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return entries
    return entries.filter(
      (e) =>
        e.orders.order_no.toLowerCase().includes(term) ||
        e.orders.customer_name.toLowerCase().includes(term),
    )
  }, [entries, search])

  return (
    <div className="mx-auto max-w-lg md:max-w-5xl">
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-emerald-700">
          <CheckCircle2 className="size-3.5" />
          <span className="text-sm font-semibold">{entries.length}</span>
          <span className="text-xs opacity-80">Completed</span>
        </div>
      </div>

      {!loading && entries.length > 0 && (
        <div className="relative mt-3 md:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search order no. or customer…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {loading ? (
        <div className="mt-3 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border py-6 text-muted-foreground">
          <Clock className="mb-2 size-8 opacity-40" />
          <p className="text-sm font-medium">No completed jobs yet.</p>
          <p className="mt-1 text-xs">Finished jobs will show up here.</p>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border py-6 text-muted-foreground">
          <Search className="mb-2 size-8 opacity-40" />
          <p className="text-sm font-medium">No jobs match "{search}".</p>
        </div>
      ) : (
        <>
          {/* Mobile: expandable cards */}
          <div className="mt-3 space-y-3 md:hidden">
            {filteredEntries.map((entry) => {
              const isOpen = expanded[entry.id] ?? false
              return (
                <Card key={entry.id}>
                  <button
                    onClick={() => toggleExpand(entry.id)}
                    className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-accent/50"
                  >
                    <div
                      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${serviceColor(entry.orders.service_type)}`}
                    >
                      {entry.orders.service_type.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-medium">
                          {entry.orders.order_no}
                        </span>
                        <div className="flex items-center gap-2">
                          {entry.started_at && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="size-3" />
                              {formatDuration(entry.started_at, entry.completed_at)}
                            </span>
                          )}
                          {isOpen ? (
                            <ChevronUp className="size-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="size-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      <p className="mt-1 text-sm">{entry.orders.customer_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.orders.service_type}
                        {' — '}
                        {formatDate(entry.completed_at)}
                      </p>
                    </div>
                  </button>

                  {isOpen && (
                    <CardContent className="border-t px-4 pb-4 pt-0">
                      <EntryDetails entry={entry} />
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </div>

          {/* Desktop: table with expandable rows */}
          <HistoryTable entries={filteredEntries} expanded={expanded} onToggle={toggleExpand} />
        </>
      )}
    </div>
  )
}

type SortField = 'order_no' | 'customer_name' | 'final_amount' | 'completed_at'
type SortDir = 'asc' | 'desc'

function HistoryTable({
  entries,
  expanded,
  onToggle,
}: {
  entries: HistoryEntry[]
  expanded: Record<string, boolean>
  onToggle: (id: string) => void
}) {
  const [sortField, setSortField] = useState<SortField>('completed_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const sorted = useMemo(() => {
    const copy = [...entries]
    copy.sort((a, b) => {
      const av = sortField === 'order_no' || sortField === 'customer_name' ? a.orders[sortField] : a[sortField]
      const bv = sortField === 'order_no' || sortField === 'customer_name' ? b.orders[sortField] : b[sortField]
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [entries, sortField, sortDir])

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'completed_at' ? 'desc' : 'asc')
    }
  }

  if (entries.length === 0) return null

  return (
    <div className="mt-3 hidden overflow-hidden rounded-xl border border-gray-200 shadow-sm md:block">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50/80">
            <SortHeader field="order_no" label="Order No." sortField={sortField} sortDir={sortDir} onSort={handleSort} />
            <SortHeader field="customer_name" label="Customer" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Service
            </th>
            <SortHeader field="final_amount" label="Amount" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Duration
            </th>
            <SortHeader field="completed_at" label="Completed" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="whitespace-nowrap" />
            <th className="w-10 px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry) => {
            const isOpen = expanded[entry.id] ?? false
            return (
              <Fragment key={entry.id}>
                <tr
                  className="cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50/70"
                  onClick={() => onToggle(entry.id)}
                >
                  <td className="px-4 py-3 font-mono text-sm font-medium text-primary whitespace-nowrap">
                    {entry.orders.order_no}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${getAvatarColor(entry.orders.customer_name)}`}
                      >
                        {getInitials(entry.orders.customer_name)}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{entry.orders.customer_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                      {entry.orders.service_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                    RM {entry.final_amount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {formatDuration(entry.started_at, entry.completed_at)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {formatDate(entry.completed_at)}
                  </td>
                  <td className="px-4 py-3">
                    {isOpen ? (
                      <ChevronUp className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-gray-100 bg-gray-50/40">
                    <td colSpan={7} className="px-6 py-4">
                      <EntryDetails entry={entry} />
                    </td>
                  </tr>
                )}
              </Fragment>
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

function EntryDetails({ entry }: { entry: HistoryEntry }) {
  return (
    <div className="space-y-4 pt-4">
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Work Done</p>
        <p className="whitespace-pre-wrap text-sm">{entry.work_done}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Quoted</p>
          <p>
            RM{' '}
            {entry.extra_charges > 0
              ? (entry.final_amount - entry.extra_charges).toFixed(2)
              : entry.final_amount.toFixed(2)}
          </p>
        </div>
        {entry.extra_charges > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Extra Charges</p>
            <p>RM {entry.extra_charges.toFixed(2)}</p>
          </div>
        )}
        <div>
          <p className="text-xs font-medium text-muted-foreground">Final Amount</p>
          <p className="font-medium">RM {entry.final_amount.toFixed(2)}</p>
        </div>
        {entry.payment_amount != null && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Payment</p>
            <p>
              RM {entry.payment_amount.toFixed(2)}
              {entry.payment_method ? ` (${entry.payment_method})` : ''}
            </p>
          </div>
        )}
      </div>

      {entry.remarks && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Remarks</p>
          <p className="text-sm">{entry.remarks}</p>
        </div>
      )}

      <CompletionAttachmentsGallery
        attachments={entry.completion_attachments}
        receiptPhotoUrl={entry.receipt_photo_url}
      />
    </div>
  )
}
