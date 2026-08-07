import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Filter, ImageOff } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { logAction } from '../../lib/audit'
import { notifyAdmins, notifyTechnician } from '../../lib/notifications'
import { useAuth } from '../../context/AuthContext'
import { generatePages } from '../../lib/pagination'
import type { CompletionAttachment, Order, ServiceCompletion, Technician } from '../../types'
import StatusBadge from '../../components/StatusBadge'
import { Alert, AlertDescription } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { Skeleton } from '../../components/ui/skeleton'

const PAGE_SIZE = 10

type ReviewOrder = Order & {
  service_completions: (ServiceCompletion & { completion_attachments: CompletionAttachment[] })[]
}

type ReviewStatusFilter = 'all' | 'Job Done' | 'Reviewed'

export default function ReviewQueue() {
  const { session } = useAuth()
  const [orders, setOrders] = useState<ReviewOrder[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)

  const [statusFilter, setStatusFilter] = useState<ReviewStatusFilter>('all')
  const [technicianFilter, setTechnicianFilter] = useState('all')
  const [page, setPage] = useState(1)

  const prevFilters = useRef({ status: 'all' as ReviewStatusFilter, tech: 'all' })

  useEffect(() => {
    supabase
      .from('technicians')
      .select('id, name, phone, active')
      .order('name')
      .then(({ data }) => setTechnicians((data as Technician[]) ?? []))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('orders')
      .select(
        '*, technicians ( id, name ), service_completions ( *, completion_attachments ( * ) )',
        { count: 'exact' },
      )

    if (statusFilter === 'all') {
      query = query.in('status', ['Job Done', 'Reviewed'])
    } else {
      query = query.eq('status', statusFilter)
    }
    if (technicianFilter !== 'all') {
      query = query.eq('assigned_technician_id', technicianFilter)
    }

    const from = (page - 1) * PAGE_SIZE
    const { data, count } = await query
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    setOrders((data as unknown as ReviewOrder[]) ?? [])
    setTotalCount(count ?? 0)
    setLoading(false)
  }, [statusFilter, technicianFilter, page])

  useEffect(() => {
    const filtersChanged =
      statusFilter !== prevFilters.current.status || technicianFilter !== prevFilters.current.tech

    if (filtersChanged && page !== 1) {
      prevFilters.current = { status: statusFilter, tech: technicianFilter }
      setPage(1)
      return
    }

    prevFilters.current = { status: statusFilter, tech: technicianFilter }
    void load()
  }, [statusFilter, technicianFilter, page, load])

  async function advance(order: ReviewOrder, toStatus: 'Reviewed' | 'Closed') {
    if (!session) return
    setBusyId(order.id)
    const { error } = await supabase.from('orders').update({ status: toStatus }).eq('id', order.id)
    if (!error) {
      await logAction({
        orderId: order.id,
        action: toStatus === 'Reviewed' ? 'Job reviewed' : 'Order closed',
        actorRole: 'manager',
        actorName: session.name,
      })

      if (toStatus === 'Reviewed' && order.technicians?.id) {
        await notifyTechnician(order.technicians.id, {
          title: 'Job reviewed',
          body: `Your completed job ${order.order_no} has been reviewed by ${session.name}.`,
          orderId: order.id,
          link: '/technician/history',
        })
      } else if (toStatus === 'Closed') {
        await notifyAdmins({
          title: 'Order closed',
          body: `${order.order_no} has been closed by ${session.name}.`,
          orderId: order.id,
          link: '/admin/orders',
        })
      }

      await load()
    }
    setBusyId(null)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const pages = generatePages(page, totalPages)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as ReviewStatusFilter)}
        >
          <SelectTrigger className="h-9 w-[160px] text-sm">
            <Filter className="size-3.5 text-muted-foreground" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="Job Done">Job Done</SelectItem>
            <SelectItem value="Reviewed">Reviewed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={technicianFilter} onValueChange={setTechnicianFilter}>
          <SelectTrigger className="h-9 w-[160px] text-sm">
            <Filter className="size-3.5 text-muted-foreground" />
            <SelectValue placeholder="Technician" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All technicians</SelectItem>
            {technicians.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            No orders match these filters.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            {orders.map((order) => {
              const completion = order.service_completions?.[0]
              const attachments = completion?.completion_attachments ?? []
              const overQuote =
                completion && Number(completion.final_amount) > Number(order.quoted_price) * 1.3

              return (
                <Card key={order.id}>
                  <CardHeader className="flex flex-row items-start justify-between space-y-0">
                    <div>
                      <CardTitle className="font-mono text-sm">{order.order_no}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {order.customer_name} &middot; {order.service_type} &middot; Tech:{' '}
                        {order.technicians?.name ?? '—'}
                      </p>
                    </div>
                    <StatusBadge status={order.status} />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {completion ? (
                      <>
                        {(overQuote || attachments.length === 0) && (
                          <Alert variant={overQuote ? 'destructive' : 'warning'} className="py-2">
                            {overQuote ? <AlertTriangle /> : <ImageOff />}
                            <AlertDescription className="text-xs font-medium">
                              {[
                                overQuote && 'Final amount much higher than quoted',
                                attachments.length === 0 && 'Job done but no photos uploaded',
                              ]
                                .filter(Boolean)
                                .join('   ·   ')}
                            </AlertDescription>
                          </Alert>
                        )}

                        <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-center">
                          <div>
                            <p className="text-xs text-muted-foreground">Quoted</p>
                            <p className="text-sm font-medium">
                              RM {Number(order.quoted_price).toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Final</p>
                            <p
                              className={`text-sm font-medium ${overQuote ? 'text-destructive' : ''}`}
                            >
                              RM {Number(completion.final_amount).toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Attachments</p>
                            <p
                              className={`text-sm font-medium ${attachments.length === 0 ? 'text-amber-600' : ''}`}
                            >
                              {attachments.length}
                            </p>
                          </div>
                        </div>

                        <p className="text-sm">
                          <span className="font-medium text-muted-foreground">Work Done: </span>
                          {completion.work_done}
                        </p>
                        {completion.remarks && (
                          <p className="text-sm text-muted-foreground">
                            <span className="font-medium">Remarks: </span>
                            {completion.remarks}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">No completion record found.</p>
                    )}

                    <div className="flex gap-2">
                      {order.status === 'Job Done' && (
                        <Button
                          onClick={() => advance(order, 'Reviewed')}
                          disabled={busyId === order.id}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          Mark Reviewed
                        </Button>
                      )}
                      {order.status === 'Reviewed' && (
                        <Button
                          onClick={() => advance(order, 'Closed')}
                          disabled={busyId === order.id}
                          variant="secondary"
                        >
                          Close Order
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col items-center justify-between gap-3 pt-2 sm:flex-row">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of{' '}
                {totalCount} results
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                {pages.map((p, i) =>
                  p === 'ellipsis' ? (
                    <span
                      key={`e-${i}`}
                      className="flex size-8 items-center justify-center text-xs text-muted-foreground"
                    >
                      …
                    </span>
                  ) : (
                    <Button
                      key={p}
                      variant={p === page ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPage(p)}
                      className="h-8 w-8 p-0 text-xs font-medium"
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
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
