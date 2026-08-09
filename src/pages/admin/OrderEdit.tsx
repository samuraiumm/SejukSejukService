import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { logAction } from '../../lib/audit'
import { notifyTechnician } from '../../lib/notifications'
import { getErrorMessage } from '../../lib/errors'
import { useAuth } from '../../context/AuthContext'
import { buildJobAssignedMessage, buildWhatsAppLink } from '../../lib/whatsapp'
import { SERVICE_TYPES, type Order, type Technician } from '../../types'
import StatusBadge from '../../components/StatusBadge'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
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

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function OrderEdit() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const { setPageTitle } = useOutletContext<{ setPageTitle: (t: string) => void }>()

  const [order, setOrder] = useState<Order | null>(null)
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({
    customer_name: '',
    phone: '',
    address: '',
    problem_description: '',
    service_type: SERVICE_TYPES[0] as string,
    quoted_price: '',
    admin_notes: '',
    assigned_technician_id: '',
    scheduled_at: '',
  })
  const [originalScheduledAt, setOriginalScheduledAt] = useState('')
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
      const schedLocal = toDatetimeLocal(o.scheduled_at)
      setForm({
        customer_name: o.customer_name,
        phone: o.phone,
        address: o.address,
        problem_description: o.problem_description,
        service_type: o.service_type,
        quoted_price: String(o.quoted_price),
        admin_notes: o.admin_notes ?? '',
        assigned_technician_id: o.assigned_technician_id ?? '',
        scheduled_at: schedLocal,
      })
      setOriginalScheduledAt(schedLocal)
    }
    setLoading(false)
  }

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  // A "reschedule" is changing an *already-set* date — setting the first
  // schedule on a previously-unscheduled order is just a normal edit, not
  // something that should count toward the reschedule metric.
  const scheduleChanged = form.scheduled_at !== originalScheduledAt
  const isReschedule = scheduleChanged && originalScheduledAt !== ''

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!order || !session) return
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
  if (!order) return <p className="text-sm text-destructive">Order not found.</p>

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to={`/admin/orders/${order.id}`}>
            <ArrowLeft />
          </Link>
        </Button>
        <div className="flex-1" />
        <StatusBadge status={order.status} />
      </div>

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Customer Name" required>
                <Input
                  required
                  value={form.customer_name}
                  onChange={(e) => update('customer_name', e.target.value)}
                />
              </Field>
              <Field label="Phone" required>
                <Input
                  required
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                />
              </Field>
            </div>

            <Field label="Address" required>
              <Textarea
                required
                rows={2}
                value={form.address}
                onChange={(e) => update('address', e.target.value)}
              />
            </Field>

            <Field label="Problem Description" required>
              <Textarea
                required
                rows={3}
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
                  <SelectTrigger className="w-full">
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
                  value={form.quoted_price}
                  onChange={(e) => update('quoted_price', e.target.value)}
                />
              </Field>
            </div>

            <Field label="Assigned Technician">
              <Select
                value={form.assigned_technician_id || 'unassigned'}
                onValueChange={(value) =>
                  update('assigned_technician_id', value === 'unassigned' ? '' : value)
                }
              >
                <SelectTrigger className="w-full">
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
                value={form.scheduled_at}
                onChange={(e) => update('scheduled_at', e.target.value)}
              />
            </Field>

            {isReschedule && (
              <Field label="Reason for reschedule">
                <Input
                  placeholder="e.g. customer requested a later time"
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                />
              </Field>
            )}

            <Field label="Admin Notes">
              <Textarea
                rows={2}
                value={form.admin_notes}
                onChange={(e) => update('admin_notes', e.target.value)}
              />
            </Field>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {saved && (
              <p className="text-sm text-emerald-600">
                Saved.{' '}
                <Link to={`/admin/orders/${order.id}`} className="underline">
                  Back to order
                </Link>
              </p>
            )}

            <Button type="submit" disabled={saving} className="w-full">
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </form>
        </CardContent>
      </Card>

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
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  )
}
