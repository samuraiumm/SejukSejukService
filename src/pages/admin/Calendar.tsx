import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import type { Order, Technician } from '../../types'
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

const TECH_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

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
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [orders, setOrders] = useState<Order[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const startOfMonth = new Date(year, month, 1).toISOString()
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59).toISOString()

    const [{ data: orderData }, { data: techData }] = await Promise.all([
      supabase
        .from('orders')
        .select('*, technicians ( id, name )')
        .not('scheduled_at', 'is', null)
        .gte('scheduled_at', startOfMonth)
        .lte('scheduled_at', endOfMonth)
        .order('scheduled_at', { ascending: true }),
      supabase.from('technicians').select('id, name, active').order('name'),
    ])

    setOrders((orderData as unknown as Order[]) ?? [])
    setTechnicians((techData as Technician[]) ?? [])
    setLoading(false)
  }, [year, month])

  useEffect(() => {
    void load()
  }, [load])

  const ordersByDay = useMemo(() => {
    const map = new Map<string, Order[]>()
    for (const o of orders) {
      if (!o.scheduled_at) continue
      const key = new Date(o.scheduled_at).toDateString()
      const list = map.get(key) ?? []
      list.push(o)
      map.set(key, list)
    }
    return map
  }, [orders])

  const technicianColors = useMemo(() => {
    const map = new Map<string, string>()
    technicians.forEach((t, i) => {
      map.set(t.id, TECH_COLORS[i % TECH_COLORS.length])
    })
    return map
  }, [technicians])

  function goToToday() {
    const n = new Date()
    setMonth(n.getMonth())
    setYear(n.getFullYear())
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

  const cells = getMonthDays(year, month)
  const todayDate = today()

  const selectedDayOrders = useMemo(() => {
    if (!selectedDate) return []
    return ordersByDay.get(selectedDate.toDateString()) ?? []
  }, [selectedDate, ordersByDay])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div />
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <Button variant="ghost" size="icon" onClick={prevMonth}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={nextMonth}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-[500px] w-full" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-7">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="border-b border-r px-2 py-2 text-center text-xs font-medium text-muted-foreground"
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
                      className="min-h-[80px] border-b border-r bg-muted/30 p-1"
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
                    className={`min-h-[80px] border-b border-r p-1 text-left transition-colors hover:bg-accent/50 ${
                      dayOrders.length > 0 ? 'cursor-pointer' : ''
                    }`}
                    onClick={() => {
                      if (dayOrders.length > 0) setSelectedDate(date)
                    }}
                  >
                    <span
                      className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-medium ${
                        isToday
                          ? 'bg-primary text-primary-foreground'
                          : 'text-foreground'
                      }`}
                    >
                      {day}
                    </span>
                    <div className="mt-0.5 space-y-0.5">
                      {dayOrders.slice(0, 3).map((o) => (
                        <div
                          key={o.id}
                          className="truncate rounded px-1 py-0.5 text-[10px] font-medium text-white"
                          style={{
                            backgroundColor:
                              o.assigned_technician_id &&
                              technicianColors.has(o.assigned_technician_id)
                                ? technicianColors.get(o.assigned_technician_id)
                                : 'var(--muted-foreground)',
                          }}
                          title={`${o.order_no} - ${o.customer_name}`}
                        >
                          {o.customer_name}
                        </div>
                      ))}
                      {dayOrders.length > 3 && (
                        <span className="block text-[10px] text-muted-foreground">
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
