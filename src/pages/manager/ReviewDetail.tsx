import { useEffect, useState, type ReactNode } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CalendarCheck,
  CheckCircle2,
  Image as ImageIcon,
  ImageOff,
  MapPin,
  MessageCircle,
  Phone,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { logAction } from '../../lib/audit'
import { notifyAdmins, notifyTechnician } from '../../lib/notifications'
import { useAuth } from '../../context/AuthContext'
import {
  buildCustomerContactMessage,
  buildTechnicianContactMessage,
  buildWhatsAppLink,
} from '../../lib/whatsapp'
import type { CompletionAttachment, Order, ServiceCompletion } from '../../types'
import StatusBadge from '../../components/StatusBadge'
import CompletionAttachmentsGallery from '../../components/CompletionAttachmentsGallery'
import WorkDoneDisplay from '../../components/WorkDoneDisplay'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'

const OVER_QUOTE_RATIO = 1.3

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

type ReviewOrder = Order & {
  service_completions: (ServiceCompletion & { completion_attachments: CompletionAttachment[] })[]
}

export default function ReviewDetail() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const { setPageTitle } = useOutletContext<{ setPageTitle: (t: string) => void }>()

  const [order, setOrder] = useState<ReviewOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    void load(id)
  }, [id])

  useEffect(() => {
    if (order) {
      setPageTitle(`Review ${order.order_no}`)
    }
  }, [order, setPageTitle])

  async function load(orderId: string) {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('*, technicians ( id, name, phone ), service_completions ( *, completion_attachments ( * ) )')
      .eq('id', orderId)
      .single()
    setOrder(data as unknown as ReviewOrder | null)
    setLoading(false)
  }

  async function advance(toStatus: 'Reviewed' | 'Closed') {
    if (!order || !session) return
    setBusy(true)
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

      await load(order.id)
    }
    setBusy(false)
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (!order) return <p className="text-sm text-destructive">Order not found.</p>

  const completion = order.service_completions?.[0]
  const attachments = completion?.completion_attachments ?? []
  const overQuote =
    !!completion && Number(completion.final_amount) > Number(order.quoted_price) * OVER_QUOTE_RATIO

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-1">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/manager/review">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="font-mono text-lg font-semibold text-gray-900">{order.order_no}</h1>
          <p className="text-xs text-gray-500">{order.service_type}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {(overQuote || (completion && attachments.length === 0)) && (
        <div className="relative overflow-hidden rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 via-violet-50/40 to-white p-4 shadow-sm">
          <div className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-gradient-to-br from-violet-300/30 to-transparent blur-2xl" />
          <div className="relative flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-sm">
              <ShieldAlert className="size-4" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-violet-700">
                Workflow Supervisor
                <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">
                  auto-detected
                </span>
              </p>
              <div className="space-y-1">
                {overQuote && (
                  <p className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                    <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
                    Final amount much higher than quoted
                  </p>
                )}
                {completion && attachments.length === 0 && (
                  <p className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                    <ImageOff className="size-3.5 shrink-0 text-amber-500" />
                    Job done but no photos uploaded
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
                href={buildWhatsAppLink(
                  order.phone,
                  buildCustomerContactMessage({
                    customerName: order.customer_name,
                    orderNo: order.order_no,
                  }),
                )}
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
            <DetailRow label="Quoted Price">RM {Number(order.quoted_price).toFixed(2)}</DetailRow>
            <DetailRow label="Technician">{order.technicians?.name ?? '—'}</DetailRow>
            {order.technicians?.phone && (
              <div className="flex gap-2 py-2">
                <Button variant="outline" size="sm" className="flex-1 border-gray-200" asChild>
                  <a href={`tel:${order.technicians.phone}`}>
                    <Phone className="size-3.5" />
                    Call
                  </a>
                </Button>
                <Button variant="outline" size="sm" className="flex-1 border-gray-200" asChild>
                  <a
                    href={buildWhatsAppLink(
                      order.technicians.phone,
                      buildTechnicianContactMessage({
                        technicianName: order.technicians.name,
                        orderNo: order.order_no,
                        customerName: order.customer_name,
                      }),
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="size-3.5" />
                    WhatsApp
                  </a>
                </Button>
              </div>
            )}
            <DetailRow label="Completed">
              {completion
                ? new Date(completion.completed_at).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : '—'}
            </DetailRow>
          </div>
        </Card>
      </div>

      {order.problem_description && (
        <Card className="rounded-xl border border-gray-200 shadow-sm p-4 space-y-1.5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Problem Description
          </h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{order.problem_description}</p>
        </Card>
      )}

      {completion ? (
        <Card className="rounded-xl border border-emerald-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50/60 px-4 py-3">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
            </div>
            <h2 className="text-sm font-semibold text-emerald-900">Service Completion</h2>
          </div>
          <div className="space-y-4 p-4">
            <WorkDoneDisplay workDone={completion.work_done} className="font-medium text-gray-900" />

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
                warn={overQuote}
              />
              <StatChip
                icon={ImageIcon}
                label="Photos"
                value={String(attachments.length)}
                warn={attachments.length === 0}
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

            <CompletionAttachmentsGallery
              attachments={attachments}
              receiptPhotoUrl={completion.receipt_photo_url}
            />
          </div>
        </Card>
      ) : (
        <Card className="rounded-xl border border-gray-200 shadow-sm p-4 text-sm text-muted-foreground">
          No completion record found.
        </Card>
      )}

      {(order.status === 'Job Done' || order.status === 'Reviewed') && (
        <Card className="rounded-xl border border-emerald-200 bg-emerald-50/40 shadow-sm p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900">
              {order.status === 'Job Done' ? 'Ready for review' : 'Ready to close'}
            </p>
            <p className="text-sm text-gray-500">
              {order.status === 'Job Done'
                ? 'Confirm this completed job looks good before it moves on.'
                : 'This order has been reviewed — close it out once you\'re done.'}
            </p>
          </div>
          {order.status === 'Job Done' && (
            <Button
              onClick={() => advance('Reviewed')}
              disabled={busy}
              className="shrink-0 bg-emerald-600 hover:bg-emerald-700"
            >
              {busy ? 'Saving…' : 'Mark Reviewed'}
            </Button>
          )}
          {order.status === 'Reviewed' && (
            <Button onClick={() => advance('Closed')} disabled={busy} variant="secondary" className="shrink-0">
              {busy ? 'Saving…' : 'Close Order'}
            </Button>
          )}
        </Card>
      )}
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

function StatChip({
  icon: Icon,
  label,
  value,
  warn,
}: {
  icon: LucideIcon
  label: string
  value: string
  warn?: boolean
}) {
  return (
    <div className={`rounded-lg p-3 ${warn ? 'bg-amber-50' : 'bg-gray-50'}`}>
      <div className={`flex items-center gap-1.5 ${warn ? 'text-amber-500' : 'text-gray-400'}`}>
        <Icon className="size-3.5" />
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`mt-1 truncate text-sm font-semibold ${warn ? 'text-amber-700' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  )
}
