import { useEffect, useState } from 'react'
import { AlertTriangle, ImageOff } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { logAction } from '../../lib/audit'
import { notifyAdmins, notifyTechnician } from '../../lib/notifications'
import { useAuth } from '../../context/AuthContext'
import type { CompletionAttachment, Order, ServiceCompletion } from '../../types'
import StatusBadge from '../../components/StatusBadge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Skeleton } from '../../components/ui/skeleton'

type ReviewOrder = Order & {
  service_completions: (ServiceCompletion & { completion_attachments: CompletionAttachment[] })[]
}

export default function ReviewQueue() {
  const { session } = useAuth()
  const [orders, setOrders] = useState<ReviewOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select(
        '*, technicians ( id, name ), service_completions ( *, completion_attachments ( * ) )',
      )
      .in('status', ['Job Done', 'Reviewed'])
      .order('created_at', { ascending: true })
    setOrders((data as unknown as ReviewOrder[]) ?? [])
    setLoading(false)
  }

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

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            Nothing to review right now.
          </CardContent>
        </Card>
      ) : (
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
                <CardContent>
                  {completion ? (
                    <div className="rounded-lg bg-muted p-3 text-sm">
                      <p>{completion.work_done}</p>
                      {completion.remarks && (
                        <p className="mt-1 text-muted-foreground">
                          Remarks: {completion.remarks}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                        <span>Quoted: RM {Number(order.quoted_price).toFixed(2)}</span>
                        <span>Final: RM {Number(completion.final_amount).toFixed(2)}</span>
                        <span>Attachments: {attachments.length}</span>
                      </div>
                      {(overQuote || attachments.length === 0) && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {overQuote && (
                            <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                              <AlertTriangle />
                              Final amount much higher than quoted
                            </Badge>
                          )}
                          {attachments.length === 0 && (
                            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                              <ImageOff />
                              Job done but no photos uploaded
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No completion record found.</p>
                  )}

                  <div className="mt-3 flex gap-2">
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
      )}
    </div>
  )
}
