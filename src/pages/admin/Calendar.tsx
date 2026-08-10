import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import type { Order, OrderStatus, Technician } from '../../types'
import { STATUS_ORDER } from '../../lib/orderStatus'
import StatusBadge from '../../components/StatusBadge'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { Badge } from '../../components/ui/badge'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

// Hex (not CSS vars) so chip backgrounds can append an alpha suffix, e.g. `${color}1a`.
// Matches --chart-1..5 in index.css.
const TECH_COLORS = ['#0e8fd9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444']

const UNASSIGNED_COLOR = '#9ca3af'

// Matches STATUS_DOT in OrdersList.tsx (slate-400, sky-400, amber-400, violet-400, emerald-400, slate-500, red-400).
const STATUS_COLORS: Record<OrderStatus, string> = {
  New: '#94a3b8',
  Assigned: '#38bdf8',
  'In Progress': '#fbbf24',
  'Job Done': '#a78bfa',
  Reviewed: '#34d399',
  Closed: '#64748b',
  Cancelled: '#f87171',
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

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function getMonthDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = []

  for (let i = 0; i < firstDay; i++) {
    cells.push(null)
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d)
  }
  while (cells.length % 7 !== 0) {
    cells.push(null)
  }
  return cells
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function today() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export default function Calendar() {
  const now = new Date()
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [weekStart, setWeekStart] = useState(() => startOfWeek(now))
  const [orders, setOrders] = useState<Order[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const rangeStart =
      viewMode === 'month' ? new Date(year, month, 1) : new Date(weekStart)
    const rangeEnd =
      viewMode === 'month'
        ? new Date(year, month + 1, 0, 23, 59, 59)
        : new Date(addDays(weekStart, 6).setHours(23, 59, 59, 999))

    const [{ data: orderData }, { data: techData }] = await Promise.all([
      supabase
        .from('orders')
        .select('*, technicians ( id, name )')
        .not('scheduled_at', 'is', null)
        .gte('scheduled_at', rangeStart.toISOString())
        .lte('scheduled_at', rangeEnd.toISOString())
        .order('scheduled_at', { ascending: true }),
      supabase.from('technicians').select('id, name, active').order('name'),
    ])

    setOrders((orderData as unknown as Order[]) ?? [])
    setTechnicians((techData as Technician[]) ?? [])
    setLoading(false)
  }, [viewMode, year, month, weekStart])

  useEffect(() => {
    void load()
  }, [load])

  const visibleOrders = useMemo(() => {
    if (!selectedTechnicianId) return orders
    return orders.filter((o) => o.assigned_technician_id === selectedTechnicianId)
  }, [orders, selectedTechnicianId])

  const ordersByDay = useMemo(() => {
    const map = new Map<string, Order[]>()
    for (const o of visibleOrders) {
      if (!o.scheduled_at) continue
      const key = new Date(o.scheduled_at).toDateString()
      const list = map.get(key) ?? []
      list.push(o)
      map.set(key, list)
    }
    return map
  }, [visibleOrders])

  const technicianColors = useMemo(() => {
    const map = new Map<string, string>()
    technicians.forEach((t, i) => {
      map.set(t.id, TECH_COLORS[i % TECH_COLORS.length])
    })
    return map
  }, [technicians])

  const technicianJobCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of orders) {
      if (!o.assigned_technician_id) continue
      map.set(o.assigned_technician_id, (map.get(o.assigned_technician_id) ?? 0) + 1)
    }
    return map
  }, [orders])

  const weekRows = useMemo(() => {
    const rows = technicians.map((t) => ({
      id: t.id,
      name: t.name,
      orders: orders.filter((o) => o.assigned_technician_id === t.id),
    }))
    const unassigned = orders.filter((o) => !o.assigned_technician_id)
    if (unassigned.length > 0) {
      rows.push({ id: 'unassigned', name: 'Unassigned', orders: unassigned })
    }
    return rows
  }, [technicians, orders])

  function goToToday() {
    const n = new Date()
    setMonth(n.getMonth())
    setYear(n.getFullYear())
    setWeekStart(startOfWeek(n))
  }

  function prevMonth() {
    if (month === 0) {
      setMonth(11)
      setYear(year - 1)
    } else {
      setMonth(month - 1)
    }
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0)
      setYear(year + 1)
    } else {
      setMonth(month + 1)
    }
  }

  function prevWeek() {
    setWeekStart((w) => addDays(w, -7))
  }

  function nextWeek() {
    setWeekStart((w) => addDays(w, 7))
  }

  const cells = getMonthDays(year, month)
  const todayDate = today()

  function techColorFor(technicianId: string | null) {
    if (technicianId && technicianColors.has(technicianId)) {
      return technicianColors.get(technicianId) as string
    }
    return UNASSIGNED_COLOR
  }

  const selectedDayOrders = useMemo(() => {
    if (!selectedDate) return []
    return ordersByDay.get(selectedDate.toDateString()) ?? []
  }, [selectedDate, ordersByDay])

  const weekEnd = addDays(weekStart, 6)
  const weekRangeLabel =
    weekStart.getMonth() === weekEnd.getMonth()
      ? `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getDate()} – ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`
      : `${MONTH_NAMES[weekStart.getMonth()].slice(0, 3)} ${weekStart.getDate()} – ${MONTH_NAMES[weekEnd.getMonth()].slice(0, 3)} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {viewMode === 'month' ? `${MONTH_NAMES[month]} ${year}` : weekRangeLabel}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-gray-500">
            {viewMode === 'month' ? (
              selectedTechnicianId ? (
                <>
                  Showing only {technicians.find((t) => t.id === selectedTechnicianId)?.name}
                  ’s jobs this month.
                  <button
                    type="button"
                    onClick={() => setSelectedTechnicianId(null)}
                    className="text-teal-600 underline-offset-2 hover:underline"
                  >
                    Clear
                  </button>
                </>
              ) : (
                'Jobs scheduled this month, by technician.'
              )
            ) : (
              'This week’s schedule, by technician.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-gray-200 bg-gray-50 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                viewMode === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              Month
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('week')
                setSelectedTechnicianId(null)
              }}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                viewMode === 'week' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              Week
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
            className="border-gray-200 text-gray-600"
          >
            Today
          </Button>
          <div className="flex items-center overflow-hidden rounded-md border border-gray-200">
            <Button
              variant="ghost"
              size="icon"
              onClick={viewMode === 'month' ? prevMonth : prevWeek}
              className="rounded-none text-gray-500 hover:bg-gray-50"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="h-5 w-px bg-gray-200" />
            <Button
              variant="ghost"
              size="icon"
              onClick={viewMode === 'month' ? nextMonth : nextWeek}
              className="rounded-none text-gray-500 hover:bg-gray-50"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {viewMode === 'week' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {STATUS_ORDER.map((s) => (
            <span key={s} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: STATUS_COLORS[s] }}
              />
              {s}
            </span>
          ))}
        </div>
      )}

      <div className={`grid gap-5 ${viewMode === 'month' ? 'lg:grid-cols-[1fr_260px]' : ''}`}>
      {loading ? (
        <Skeleton className="h-[500px] w-full rounded-xl" />
      ) : viewMode === 'week' ? (
        <Card className="rounded-xl border-gray-200 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {/* Mobile: vertical day-by-day agenda. The technician × day grid
                below needs 860px+ to be readable at all — even with horizontal
                scroll, comparing one technician's week means constantly
                swiping back and forth, so it's replaced entirely on mobile
                rather than just shrunk. */}
            <div className="divide-y divide-gray-100 sm:hidden">
              {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => {
                const dayOrders = orders.filter(
                  (o) => o.scheduled_at && sameDay(new Date(o.scheduled_at), d),
                )
                const isToday = sameDay(d, todayDate)
                return (
                  <div key={d.toDateString()} className={`p-3 ${isToday ? 'bg-teal-50/60' : ''}`}>
                    <p
                      className={`mb-2 text-xs font-semibold uppercase tracking-wider ${
                        isToday ? 'text-teal-700' : 'text-gray-500'
                      }`}
                    >
                      {WEEKDAYS[d.getDay()]} &middot; {MONTH_NAMES[d.getMonth()].slice(0, 3)} {d.getDate()}
                    </p>
                    {dayOrders.length === 0 ? (
                      <p className="text-xs text-gray-400">No jobs scheduled.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {dayOrders.map((o) => {
                          const tech = technicians.find((t) => t.id === o.assigned_technician_id)
                          return (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => setSelectedDate(d)}
                              className="flex w-full items-center gap-2 rounded-lg border border-gray-100 bg-white px-2.5 py-2 text-left"
                            >
                              <span
                                className="size-2 shrink-0 rounded-full"
                                style={{ backgroundColor: techColorFor(o.assigned_technician_id) }}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-gray-800">
                                  {o.customer_name}
                                </p>
                                <p className="truncate text-[11px] text-gray-400">
                                  {tech?.name ?? 'Unassigned'}
                                </p>
                              </div>
                              <StatusBadge status={o.status} />
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Tablet/desktop: technician × day grid, unchanged. */}
            <div className="hidden overflow-x-auto sm:block">
              <div className="min-w-[860px]">
                <div className="grid grid-cols-[180px_repeat(7,minmax(0,1fr))] border-b border-gray-100 bg-gray-50/60">
                  <div className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Technician
                  </div>
                  {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => (
                    <div
                      key={d.toDateString()}
                      className={`border-l border-gray-100 px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wider ${
                        sameDay(d, todayDate) ? 'text-teal-600' : 'text-gray-400'
                      }`}
                    >
                      {WEEKDAYS[d.getDay()]}{' '}
                      <span className={sameDay(d, todayDate) ? 'text-teal-700' : 'text-gray-600'}>
                        {d.getDate()}
                      </span>
                    </div>
                  ))}
                </div>

                {weekRows.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[180px_repeat(7,minmax(0,1fr))] border-b border-gray-100 last:border-b-0"
                  >
                    <div className="flex items-center gap-2 px-3 py-3">
                      <span
                        className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                          row.id === 'unassigned'
                            ? 'bg-gray-100 text-gray-500'
                            : 'bg-teal-50 text-teal-700'
                        }`}
                      >
                        {row.id === 'unassigned' ? '—' : getInitials(row.name)}
                      </span>
                      <span className="truncate text-sm font-medium text-gray-700">{row.name}</span>
                    </div>
                    {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => {
                      const dayOrders = row.orders.filter(
                        (o) => o.scheduled_at && sameDay(new Date(o.scheduled_at), d),
                      )
                      return (
                        <div key={d.toDateString()} className="border-l border-gray-100 p-1.5">
                          {dayOrders.map((o) => (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => setSelectedDate(d)}
                              className="mb-1 block w-full truncate rounded px-1.5 py-1 text-left text-[10px] font-semibold last:mb-0"
                              style={{
                                backgroundColor: `${STATUS_COLORS[o.status]}22`,
                                color: STATUS_COLORS[o.status],
                              }}
                              title={`${o.order_no} — ${o.customer_name} (${o.status})`}
                            >
                              {o.customer_name}
                            </button>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-xl border-gray-200 shadow-sm">
          <CardContent className="p-0">
            <div className="grid grid-cols-7">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="border-b border-r border-gray-100 px-2 py-2.5 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider"
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((day, i) => {
                if (day === null) {
                  return (
                    <div
                      key={`empty-${i}`}
                      className="min-h-[96px] border-b border-r border-gray-100 bg-gray-50/40 p-1.5"
                    />
                  )
                }
                const date = new Date(year, month, day)
                const key = date.toDateString()
                const dayOrders = ordersByDay.get(key) ?? []
                const isToday = sameDay(date, todayDate)

                return (
                  <button
                    key={key}
                    type="button"
                    className={`min-h-[60px] border-b border-r border-gray-100 p-1 text-left transition-colors hover:bg-gray-50 sm:min-h-[96px] sm:p-1.5 ${
                      dayOrders.length > 0 ? 'cursor-pointer' : ''
                    } ${isToday ? 'bg-teal-50/60 ring-1 ring-inset ring-teal-200' : ''}`}
                    onClick={() => {
                      if (dayOrders.length > 0) setSelectedDate(date)
                    }}
                  >
                    <span
                      className={`inline-flex size-5 items-center justify-center rounded-full text-[11px] font-medium sm:size-6 sm:text-xs ${
                        isToday ? 'bg-teal-600 text-white' : 'text-gray-700'
                      }`}
                    >
                      {day}
                    </span>

                    {/* Mobile: dots only — a 55px-wide cell can't fit readable
                        customer-name chips, and tapping the day already opens
                        the full order list, so dots just signal "something's
                        here." */}
                    {dayOrders.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                        {dayOrders.slice(0, 6).map((o) => (
                          <span
                            key={o.id}
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: techColorFor(o.assigned_technician_id) }}
                          />
                        ))}
                        {dayOrders.length > 6 && (
                          <span className="text-[9px] leading-none font-medium text-gray-400">
                            +{dayOrders.length - 6}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-1 hidden space-y-1 sm:block">
                      {dayOrders.slice(0, 3).map((o) => {
                        const color = techColorFor(o.assigned_technician_id)
                        const isUnassigned = !o.assigned_technician_id
                        return (
                          <div
                            key={o.id}
                            className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] font-semibold ${
                              isUnassigned ? 'border border-dashed border-gray-300 bg-gray-50 text-gray-600' : ''
                            }`}
                            style={isUnassigned ? undefined : { backgroundColor: `${color}1a`, color }}
                            title={`${o.order_no} - ${o.customer_name}${isUnassigned ? ' (unassigned)' : ''}`}
                          >
                            <span
                              className="size-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: color }}
                            />
                            <span className="truncate">{o.customer_name}</span>
                          </div>
                        )
                      })}
                      {dayOrders.length > 3 && (
                        <span className="block px-1 text-[10px] font-medium text-gray-400">
                          +{dayOrders.length - 3} more
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && viewMode === 'month' && technicians.length > 0 && (
        <Card className="h-fit rounded-xl border-gray-200 shadow-sm">
          <CardContent className="p-3">
            <p className="px-1 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Technicians
            </p>
            <div className="space-y-0.5">
              {technicians.map((t) => {
                const jobCount = technicianJobCounts.get(t.id) ?? 0
                const isSelected = selectedTechnicianId === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTechnicianId(isSelected ? null : t.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-1.5 py-2 text-left transition-colors ${
                      isSelected ? 'bg-teal-50 ring-1 ring-inset ring-teal-200' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ backgroundColor: techColorFor(t.id) }}
                    >
                      {getInitials(t.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm font-medium ${isSelected ? 'text-teal-900' : 'text-gray-800'}`}
                      >
                        {t.name}
                      </p>
                      <p className={`text-xs ${isSelected ? 'text-teal-600' : 'text-gray-400'}`}>
                        {jobCount} job{jobCount !== 1 ? 's' : ''} this month
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
      </div>

      <Dialog open={selectedDate !== null} onOpenChange={() => setSelectedDate(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedDate?.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </DialogTitle>
            <DialogDescription>
              {selectedDayOrders.length} order{selectedDayOrders.length !== 1 ? 's' : ''} scheduled
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {selectedDayOrders.map((o) => (
              <Link
                key={o.id}
                to={`/admin/orders/${o.id}`}
                onClick={() => setSelectedDate(null)}
              >
                <Card className="transition-colors hover:bg-accent/50">
                  <CardContent className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-mono text-sm font-medium">{o.order_no}</p>
                      <p className="text-sm text-muted-foreground">{o.customer_name}</p>
                      {o.scheduled_at && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(o.scheduled_at).toLocaleTimeString(undefined, {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {o.technicians?.name && (
                        <Badge
                          variant="outline"
                          className="text-xs"
                          style={{
                            borderColor:
                              o.assigned_technician_id &&
                              technicianColors.has(o.assigned_technician_id)
                                ? technicianColors.get(o.assigned_technician_id)
                                : undefined,
                            color:
                              o.assigned_technician_id &&
                              technicianColors.has(o.assigned_technician_id)
                                ? technicianColors.get(o.assigned_technician_id)
                                : undefined,
                          }}
                        >
                          {o.technicians.name}
                        </Badge>
                      )}
                      <StatusBadge status={o.status} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
