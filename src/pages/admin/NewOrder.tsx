import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { logAction } from '../../lib/audit'
import { getErrorMessage } from '../../lib/errors'
import { useAuth } from '../../context/AuthContext'
import { SERVICE_TYPES, type Technician } from '../../types'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
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

const emptyForm = {
  customer_name: '',
  phone: '',
  address: '',
  problem_description: '',
  service_type: SERVICE_TYPES[0] as string,
  quoted_price: '',
  assigned_technician_id: '',
  admin_notes: '',
}

export default function NewOrder() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<{ order_no: string; technician: string } | null>(
    null,
  )

  useEffect(() => {
    supabase
      .from('technicians')
      .select('id, name, phone, active')
      .eq('active', true)
      .order('name')
      .then(({ data }) => setTechnicians(data ?? []))
  }, [])

  function update<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { data: orderNoData, error: orderNoError } = await supabase.rpc('next_order_no')
      if (orderNoError) throw orderNoError

      const status = form.assigned_technician_id ? 'Assigned' : 'New'

      const { data: inserted, error: insertError } = await supabase
        .from('orders')
        .insert({
          order_no: orderNoData,
          customer_name: form.customer_name,
          phone: form.phone,
          address: form.address,
          problem_description: form.problem_description,
          service_type: form.service_type,
          quoted_price: Number(form.quoted_price) || 0,
          assigned_technician_id: form.assigned_technician_id || null,
          admin_notes: form.admin_notes || null,
          status,
        })
        .select('id, order_no')
        .single()
      if (insertError) throw insertError

      await logAction({
        orderId: inserted.id,
        action: form.assigned_technician_id ? 'Order created and assigned' : 'Order created',
        actorRole: 'admin',
        actorName: session?.name ?? 'Admin',
      })

      const techName =
        technicians.find((t) => t.id === form.assigned_technician_id)?.name ?? 'Unassigned'
      setSummary({ order_no: inserted.order_no, technician: techName })
      setForm(emptyForm)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create order'))
    } finally {
      setSubmitting(false)
    }
  }

  if (summary) {
    return (
      <Card className="mx-auto max-w-lg border-emerald-200 bg-emerald-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-900">
            <CheckCircle2 className="size-5" />
            Order created
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-1 text-sm text-emerald-800">
            <div className="flex justify-between">
              <dt>Order No.</dt>
              <dd className="font-mono font-medium">{summary.order_no}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Assigned Technician</dt>
              <dd>{summary.technician}</dd>
            </div>
          </dl>
          <div className="mt-5 flex gap-3">
            <Button
              onClick={() => setSummary(null)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Create another order
            </Button>
            <Button
              variant="outline"
              className="border-emerald-300 text-emerald-800 hover:bg-emerald-100"
              onClick={() => navigate('/admin/orders')}
            >
              View orders
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
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
                  placeholder="e.g. 0123456789"
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
                  <SelectItem value="unassigned">Unassigned (assign later)</SelectItem>
                  {technicians.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Admin Notes">
              <Textarea
                rows={2}
                value={form.admin_notes}
                onChange={(e) => update('admin_notes', e.target.value)}
              />
            </Field>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Creating order…' : 'Create Order'}
            </Button>
          </form>
        </CardContent>
      </Card>
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
