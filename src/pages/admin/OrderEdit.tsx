import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { logAction } from '../../lib/audit'
import { notifyTechnician } from '../../lib/notifications'
import { getErrorMessage } from '../../lib/errors'
import { useAuth } from '../../context/AuthContext'
import { buildJobAssignedMessage, buildWhatsAppLink } from '../../lib/whatsapp'
import { SERVICE_TYPES, type Order, type Technician } from '../../types'
import StatusBadge from '../../components/StatusBadge'
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'

/** Light filled-field look, matching the New Order page's style. */
const fieldClass =
  'rounded-lg border-0 bg-gray-50 shadow-none focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-teal-500/40'

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formFromOrder(o: Order) {
  return {
    customer_name: o.customer_name,
    phone: o.phone,
    address: o.address,
    problem_description: o.problem_description,
    service_type: o.service_type,
    quoted_price: String(o.quoted_price),
    admin_notes: o.admin_notes ?? '',
    assigned_technician_id: o.assigned_technician_id ?? '',
    scheduled_at: toDatetimeLocal(o.scheduled_at),
  }
}

type OrderForm = ReturnType<typeof formFromOrder>

export default function OrderEdit() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const { setPageTitle } = useOutletContext<{ setPageTitle: (t: string) => void }>()

  const [order, setOrder] = useState<Order | null>(null)
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState<OrderForm | null>(null)
  const [initialForm, setInitialForm] = useState<OrderForm | null>(null)
  const [rescheduleReason, setRescheduleReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!id) return
    void load(id)
    supabase
      .from('technicians')
      .select('id, name, phone, active')
      .order('name')
      .then(({ data }) => setTechnicians((data as Technician[]) ?? []))
  }, [id])

  useEffect(() => {
    if (order) {
      setPageTitle(`Edit ${order.order_no}`)
    }
  }, [order, setPageTitle])

  async function load(orderId: string) {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('*, technicians ( id, name, phone )')
      .eq('id', orderId)
      .single()
    const o = data as unknown as Order | null
    setOrder(o)
    if (o) {
      const next = formFromOrder(o)
      setForm(next)
      setInitialForm(next)
    }
    setLoading(false)
  }

  function update<K extends keyof OrderForm>(key: K, value: OrderForm[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  function discardChanges() {
    setForm(initialForm)
    setRescheduleReason('')
    setError(null)
  }

  const isDirty = form && initialForm ? JSON.stringify(form) !== JSON.stringify(initialForm) : false

  // A "reschedule" is changing an *already-set* date — setting the first
  // schedule on a previously-unscheduled order is just a normal edit, not
  // something that should count toward the reschedule metric.
  const scheduleChanged = form && initialForm ? form.scheduled_at !== initialForm.scheduled_at : false
  const isReschedule = scheduleChanged && initialForm?.scheduled_at !== ''

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!order || !session || !form) return
    setError(null)
    setSaving(true)
    try {
      const newScheduledAt = form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null
      const wasUnassigned = !order.assigned_technician_id
      const nowAssigned = !!form.assigned_technician_id
      const statusBump = order.status === 'New' && wasUnassigned && nowAssigned

      const { error: updateError } = await supabase
        .from('orders')
        .update({
          customer_name: form.customer_name,
          phone: form.phone,
          address: form.address,
          problem_description: form.problem_description,
          service_type: form.service_type,
          quoted_price: Number(form.quoted_price) || 0,
          admin_notes: form.admin_notes || null,
          assigned_technician_id: form.assigned_technician_id || null,
          scheduled_at: newScheduledAt,
          ...(statusBump ? { status: 'Assigned' } : {}),
        })
        .eq('id', order.id)
      if (updateError) throw updateError

      if (isReschedule) {
        await supabase.from('order_reschedules').insert({
          order_id: order.id,
          previous_scheduled_at: order.scheduled_at,
          new_scheduled_at: newScheduledAt,
          reason: rescheduleReason || null,
          changed_by_name: session.name,
        })
      }

      await logAction({
        orderId: order.id,
        action: isReschedule ? 'Order updated and rescheduled' : 'Order updated',
        actorRole: 'admin',
        actorName: session.name,
      })

      const technicianChanged = form.assigned_technician_id !== (order.assigned_technician_id ?? '')
      if (technicianChanged && form.assigned_technician_id) {
        await notifyTechnician(form.assigned_technician_id, {
          title: 'Job assigned to you',
          body: `${order.order_no} — ${form.service_type} for ${form.customer_name}`,
          orderId: order.id,
          link: '/technician/jobs',
        })
      } else if (isReschedule && form.assigned_technician_id) {
        await notifyTechnician(form.assigned_technician_id, {
          title: 'Job rescheduled',
          body: `${order.order_no} rescheduled to ${newScheduledAt ? new Date(newScheduledAt).toLocaleString() : 'unscheduled'}`,
          orderId: order.id,
          link: '/technician/jobs',
        })
      }

      setSaved(true)
      setRescheduleReason('')
      await load(order.id)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save order'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (!order || !form) return <p className="text-sm text-destructive">Order not found.</p>

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to={`/admin/orders/${order.id}`}>
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Edit {order.order_no}</h1>
            <p className="mt-1 text-sm text-gray-500">Update job details, scheduling, and assignment.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={order.status} />
          {isDirty && (
            <span className="flex items-center gap-1.5 text-sm text-amber-600">
              <span className="size-1.5 rounded-full bg-amber-500" />
              Unsaved changes
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={discardChanges}
            disabled={!isDirty || saving}
            className="border-gray-200 text-gray-600"
          >
            Discard
          </Button>
          <Button
            type="submit"
            form="edit-order-form"
            disabled={saving}
            className="bg-teal-600 text-white hover:bg-teal-700"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Couldn't save changes</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {saved && (
        <Alert variant="success">
          <CheckCircle2 />
          <AlertTitle>Changes saved</AlertTitle>
          <AlertDescription>
            <Link to={`/admin/orders/${order.id}`} className="underline">
              Back to order
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <form id="edit-order-form" onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card className="rounded-xl border border-gray-100 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-900">
                Customer Information
              </CardTitle>
              <CardDescription className="text-xs text-gray-400">
                Who this order is for.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Customer Name" required>
                  <Input
                    required
                    className={fieldClass}
                    value={form.customer_name}
                    onChange={(e) => update('customer_name', e.target.value)}
                  />
                </Field>
                <Field label="Phone" required>
                  <Input
                    required
                    type="tel"
                    className={fieldClass}
                    value={form.phone}
                    onChange={(e) => update('phone', e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Address" required>
                <Textarea
                  required
                  rows={2}
                  className={fieldClass}
                  value={form.address}
                  onChange={(e) => update('address', e.target.value)}
                />
              </Field>
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-gray-100 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-900">Job Details</CardTitle>
              <CardDescription className="text-xs text-gray-400">
                What needs to be done, and the price quoted to the customer.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Problem Description" required>
                <Textarea
                  required
                  rows={3}
                  className={fieldClass}
                  value={form.problem_description}
                  onChange={(e) => update('problem_description', e.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Service Type" required>
                  <Select
                    value={form.service_type}
                    onValueChange={(value) => update('service_type', value)}
                  >
                    <SelectTrigger className={`w-full ${fieldClass}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Quoted Price (RM)" required>
                  <Input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    className={fieldClass}
                    value={form.quoted_price}
                    onChange={(e) => update('quoted_price', e.target.value)}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="rounded-xl border border-gray-100 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-900">
                Assignment &amp; Schedule
              </CardTitle>
              <CardDescription className="text-xs text-gray-400">
                Who's doing the job, and when.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Assigned Technician">
                <Select
                  value={form.assigned_technician_id || 'unassigned'}
                  onValueChange={(value) =>
                    update('assigned_technician_id', value === 'unassigned' ? '' : value)
                  }
                >
                  <SelectTrigger className={`w-full ${fieldClass}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {technicians.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                        {!t.active ? ' (inactive)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Scheduled For">
                <Input
                  type="datetime-local"
                  className={fieldClass}
                  value={form.scheduled_at}
                  onChange={(e) => update('scheduled_at', e.target.value)}
                />
              </Field>

              {isReschedule && (
                <Field label="Reason for reschedule">
                  <Input
                    placeholder="e.g. customer requested a later time"
                    className={fieldClass}
                    value={rescheduleReason}
                    onChange={(e) => setRescheduleReason(e.target.value)}
                  />
                </Field>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-gray-100 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-900">Notes</CardTitle>
              <CardDescription className="text-xs text-gray-400">
                Internal notes for your team — not shared with the customer.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={5}
                placeholder="Type…"
                className={fieldClass}
                value={form.admin_notes}
                onChange={(e) => update('admin_notes', e.target.value)}
              />
            </CardContent>
          </Card>
        </div>
      </form>

      {saved && order.technicians?.phone && (
        <a
          href={buildWhatsAppLink(
            order.technicians.phone,
            buildJobAssignedMessage({
              technicianName: order.technicians.name,
              orderNo: order.order_no,
              customerName: order.customer_name,
              address: order.address,
              serviceType: order.service_type,
              scheduledAt: order.scheduled_at
                ? new Date(order.scheduled_at).toLocaleString()
                : null,
            }),
          )}
          target="_blank"
          rel="noreferrer"
          className="block w-full rounded-lg bg-emerald-600 py-2.5 text-center text-sm font-medium text-white hover:bg-emerald-700"
        >
          Notify {order.technicians.name} via WhatsApp
        </a>
      )}
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-gray-700">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  )
}
