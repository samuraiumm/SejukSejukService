import { useEffect, useState, type ReactNode } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Ban,
  Banknote,
  CalendarCheck,
  CheckCircle2,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { logAction } from '../../lib/audit'
import { notifyTechnician } from '../../lib/notifications'
import { getErrorMessage } from '../../lib/errors'
import { canCancel } from '../../lib/orderStatus'
import { useAuth } from '../../context/AuthContext'
import { buildJobAssignedMessage, buildWhatsAppLink } from '../../lib/whatsapp'
import type { CompletionAttachment, Order, ServiceCompletion } from '../../types'
import StatusBadge from '../../components/StatusBadge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Textarea } from '../../components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'

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

type OrderWithCompletion = Order & {
  service_completions: (ServiceCompletion & { completion_attachments: CompletionAttachment[] })[]
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const { setPageTitle } = useOutletContext<{ setPageTitle: (t: string) => void }>()

  const [order, setOrder] = useState<OrderWithCompletion | null>(null)
  const [loading, setLoading] = useState(true)

  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    void load(id)
  }, [id])

  useEffect(() => {
    if (order) {
      setPageTitle(`Order ${order.order_no}`)
    }
  }, [order, setPageTitle])

  async function load(orderId: string) {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('*, technicians ( id, name, phone ), service_completions ( *, completion_attachments ( * ) )')
      .eq('id', orderId)
      .single()
    setOrder(data as unknown as OrderWithCompletion | null)
    setLoading(false)
  }

  async function handleCancel() {
    if (!order || !session) return
    setCancelError(null)
    setCancelling(true)
    try {
      const { error: cancelErr } = await supabase
        .from('orders')
        .update({
          status: 'Cancelled',
          admin_notes: `${order.admin_notes ? order.admin_notes + '\n\n' : ''}Cancelled: ${cancelReason}`,
        })
        .eq('id', order.id)
      if (cancelErr) throw cancelErr

      await logAction({
        orderId: order.id,
        action: `Order cancelled: ${cancelReason}`,
        actorRole: 'admin',
        actorName: session.name,
      })

      if (order.assigned_technician_id) {
        await notifyTechnician(order.assigned_technician_id, {
          title: 'Job cancelled',
          body: `${order.order_no} has been cancelled: ${cancelReason}`,
          orderId: order.id,
          link: '/technician/jobs',
        })
      }

      setCancelOpen(false)
      setCancelReason('')
      await load(order.id)
    } catch (err) {
      setCancelError(getErrorMessage(err, 'Failed to cancel order'))
    } finally {
      setCancelling(false)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (!order) return <p className="text-sm text-destructive">Order not found.</p>

  const completion = order.service_completions?.[0]

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-1">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/admin/orders">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="font-mono text-lg font-semibold text-gray-900">{order.order_no}</h1>
          <p className="text-xs text-gray-500">
            Created{' '}
            {new Date(order.created_at).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        </div>
        <StatusBadge status={order.status} />
        <Button asChild size="sm">
          <Link to={`/admin/orders/${order.id}/edit`}>
            <Pencil className="size-4" />
            Edit
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</h2>
          <div className="flex items-center gap-3">
            <div
              className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${getAvatarColor(order.customer_name)}`}
            >
              {getInitials(order.customer_name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">{order.customer_name}</p>
              <p className="text-sm text-gray-500">{order.phone}</p>
            </div>
          </div>
          <div className="flex items-start gap-1.5 text-sm text-gray-600">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-gray-400" />
            <span>{order.address}</span>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1 border-gray-200" asChild>
              <a href={`tel:${order.phone}`}>
                <Phone className="size-3.5" />
                Call
              </a>
            </Button>
            <Button variant="outline" size="sm" className="flex-1 border-gray-200" asChild>
              <a
                href={buildWhatsAppLink(order.phone, `Hi ${order.customer_name}, regarding your order ${order.order_no}...`)}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle className="size-3.5" />
                WhatsApp
              </a>
            </Button>
          </div>
        </Card>

        <Card className="rounded-xl border border-gray-200 shadow-sm p-4">
          <h2 className="mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Job Details
          </h2>
          <div className="divide-y divide-gray-100">
            <DetailRow label="Service">
              <span className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                {order.service_type}
              </span>
            </DetailRow>
            <DetailRow label="Quoted Price">
              RM {Number(order.quoted_price).toFixed(2)}
            </DetailRow>
            <DetailRow label="Technician">{order.technicians?.name ?? 'Not assigned yet'}</DetailRow>
            <DetailRow label="Scheduled For">
              {order.scheduled_at
                ? new Date(order.scheduled_at).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : 'No date set yet'}
            </DetailRow>
          </div>
        </Card>
      </div>

      <Card className="rounded-xl border border-gray-200 shadow-sm p-4 space-y-1.5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Problem Description
        </h2>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{order.problem_description}</p>
      </Card>

      {order.admin_notes && (
        <Card className="rounded-xl border border-gray-200 shadow-sm p-4 space-y-1.5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Admin Notes
          </h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{order.admin_notes}</p>
        </Card>
      )}

      {order.technicians?.phone && (
        <a
          href={buildWhatsAppLink(
            order.technicians.phone,
            buildJobAssignedMessage({
              technicianName: order.technicians.name,
              orderNo: order.order_no,
              customerName: order.customer_name,
              address: order.address,
              serviceType: order.service_type,
              scheduledAt: order.scheduled_at ? new Date(order.scheduled_at).toLocaleString() : null,
            }),
          )}
          target="_blank"
          rel="noreferrer"
          className="block w-full rounded-lg bg-emerald-600 py-2.5 text-center text-sm font-medium text-white hover:bg-emerald-700"
        >
          Message {order.technicians.name} via WhatsApp
        </a>
      )}

      {completion && (
        <Card className="rounded-xl border border-emerald-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50/60 px-4 py-3">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
            </div>
            <h2 className="text-sm font-semibold text-emerald-900">Service Completion</h2>
          </div>
          <div className="space-y-4 p-4">
            <p className="text-sm font-medium leading-relaxed text-gray-900">
              {completion.work_done}
            </p>
            {completion.remarks && (
              <div className="border-l-2 border-gray-200 pl-3">
                <p className="text-sm italic text-gray-500">&ldquo;{completion.remarks}&rdquo;</p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <StatChip
                icon={Banknote}
                label="Amount Charged"
                value={`RM ${Number(completion.final_amount).toFixed(2)}`}
              />
              <StatChip
                icon={ImageIcon}
                label="Photos"
                value={String(completion.completion_attachments?.length ?? 0)}
              />
              <StatChip
                icon={CalendarCheck}
                label="Completed"
                value={new Date(completion.completed_at).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              />
            </div>
          </div>
        </Card>
      )}

      {canCancel(order.status) && (
        <Card className="rounded-xl border border-destructive/30 shadow-sm p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900">Cancel this order</p>
            <p className="text-sm text-gray-500">
              You can only cancel before a technician starts the job.
            </p>
          </div>
          <Button variant="destructive" onClick={() => setCancelOpen(true)}>
            <Ban />
            Cancel Order
          </Button>
        </Card>
      )}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel order {order.order_no}?</DialogTitle>
            <DialogDescription>
              This can't be undone. Please tell us why — it will be saved with this order
              so anyone can see the reason later.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            required
            placeholder="Why is this order being cancelled?"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          {cancelError && <p className="text-sm text-destructive">{cancelError}</p>}
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={cancelling || !cancelReason.trim()}
              onClick={handleCancel}
            >
              {cancelling ? 'Cancelling…' : 'Yes, Cancel This Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{children}</span>
    </div>
  )
}

function StatChip({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <div className="flex items-center gap-1.5 text-gray-400">
        <Icon className="size-3.5" />
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-gray-900">{value}</p>
    </div>
  )
}
