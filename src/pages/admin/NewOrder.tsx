import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, FileScan, Loader2, ScanText, Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { logAction } from '../../lib/audit'
import { notifyTechnician } from '../../lib/notifications'
import { getErrorMessage } from '../../lib/errors'
import { extractTextFromImage } from '../../lib/ocr'
import { useAuth } from '../../context/AuthContext'
import { buildJobAssignedMessage, buildWhatsAppLink } from '../../lib/whatsapp'
import { SERVICE_TYPES, type Technician } from '../../types'
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert'
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

interface ExtractedDocumentFields {
  customer_name: string | null
  phone: string | null
  address: string | null
  service_type: string | null
  service_details: string | null
  amount: number | null
  date: string | null
}

const MAX_DOCUMENT_MB = 8

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
  const [extractStage, setExtractStage] = useState<'ocr' | 'ai' | null>(null)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [autoFilledFrom, setAutoFilledFrom] = useState<ExtractedDocumentFields | null>(null)
  const [ocrText, setOcrText] = useState<string | null>(null)
  const [showOcrText, setShowOcrText] = useState(false)
  const [serviceTypeUnmatched, setServiceTypeUnmatched] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const [summary, setSummary] = useState<{
    order_no: string
    technician: string
    technicianPhone: string | null
    customerName: string
    address: string
    serviceType: string
  } | null>(null)

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

  async function handleDocumentUpload(file: File) {
    setExtractError(null)
    setAutoFilledFrom(null)
    setOcrText(null)
    setShowOcrText(false)
    setServiceTypeUnmatched(false)

    if (file.size > MAX_DOCUMENT_MB * 1024 * 1024) {
      setExtractError(
        `This image is ${(file.size / (1024 * 1024)).toFixed(1)}MB — please use a photo under ${MAX_DOCUMENT_MB}MB (resize or re-take at a lower resolution).`,
      )
      return
    }

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const url = URL.createObjectURL(file)
    previewUrlRef.current = url
    setPreviewUrl(url)

    try {
      setExtractStage('ocr')
      const extractedText = await extractTextFromImage(file)
      setOcrText(extractedText)
      if (!extractedText.trim()) {
        setExtractError('Could not read any text from this image. Try a clearer photo, or fill the form manually.')
        return
      }

      setExtractStage('ai')
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession()
      const res = await fetch('/api/ai-extract-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authSession ? { Authorization: `Bearer ${authSession.access_token}` } : {}),
        },
        body: JSON.stringify({ text: extractedText }),
      })
      const fields = (await res.json()) as ExtractedDocumentFields & { error?: string }
      if (!res.ok) throw new Error(fields.error ?? 'Extraction failed')

      const matchedServiceType = SERVICE_TYPES.find(
        (t) => fields.service_type && t.toLowerCase().includes(fields.service_type.toLowerCase()),
      )
      setServiceTypeUnmatched(!!fields.service_type && !matchedServiceType)

      setForm((f) => ({
        ...f,
        customer_name: fields.customer_name ?? f.customer_name,
        phone: fields.phone ?? f.phone,
        address: fields.address ?? f.address,
        problem_description: fields.service_details ?? f.problem_description,
        quoted_price: fields.amount != null ? String(fields.amount) : f.quoted_price,
        service_type: matchedServiceType ?? f.service_type,
      }))
      setAutoFilledFrom(fields)
    } catch (err) {
      setExtractError(getErrorMessage(err, 'Failed to extract fields from this document'))
    } finally {
      setExtractStage(null)
    }
  }

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

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

      if (form.assigned_technician_id) {
        await notifyTechnician(form.assigned_technician_id, {
          title: 'New job assigned',
          body: `${inserted.order_no} — ${form.service_type} for ${form.customer_name}`,
          orderId: inserted.id,
          link: '/technician/jobs',
        })
      }

      const assignedTech = technicians.find((t) => t.id === form.assigned_technician_id)
      setSummary({
        order_no: inserted.order_no,
        technician: assignedTech?.name ?? 'Unassigned',
        technicianPhone: assignedTech?.phone ?? null,
        customerName: form.customer_name,
        address: form.address,
        serviceType: form.service_type,
      })
      setForm(emptyForm)
      setAutoFilledFrom(null)
      setOcrText(null)
      setShowOcrText(false)
      setServiceTypeUnmatched(false)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
      setPreviewUrl(null)
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
          {summary.technicianPhone && (
            <a
              href={buildWhatsAppLink(
                summary.technicianPhone,
                buildJobAssignedMessage({
                  technicianName: summary.technician,
                  orderNo: summary.order_no,
                  customerName: summary.customerName,
                  address: summary.address,
                  serviceType: summary.serviceType,
                }),
              )}
              target="_blank"
              rel="noreferrer"
              className="mt-4 block w-full rounded-lg bg-emerald-600 py-2.5 text-center text-sm font-medium text-white hover:bg-emerald-700"
            >
              Notify {summary.technician} via WhatsApp
            </a>
          )}
          <div className="mt-3 flex gap-3">
            <Button
              onClick={() => setSummary(null)}
              variant={summary.technicianPhone ? 'outline' : 'default'}
              className={
                summary.technicianPhone
                  ? 'border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }
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
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileScan className="size-4" />
            Auto-fill from a document (AI)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Upload a photo of a service request, quote, or invoice — AI will read it and
            pre-fill the fields below. Always review before submitting.
          </p>
          <Input
            type="file"
            accept="image/*"
            disabled={extractStage !== null}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleDocumentUpload(file)
              e.target.value = ''
            }}
          />

          {(extractStage || previewUrl) && (
            <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
              {previewUrl && (
                <div className="relative size-20 shrink-0 overflow-hidden rounded-md border bg-background">
                  <img src={previewUrl} alt="Uploaded document" className="size-full object-cover" />
                  {extractStage && (
                    <>
                      <div className="absolute inset-0 bg-primary/10" />
                      <div className="absolute inset-x-0 h-0.5 animate-scan-line bg-primary shadow-[0_0_8px_2px_var(--primary)]" />
                    </>
                  )}
                </div>
              )}
              {extractStage && (
                <div className="flex flex-1 flex-col gap-1.5 pt-1 text-sm">
                  <StepRow
                    active={extractStage === 'ocr'}
                    done={extractStage === 'ai'}
                    icon={ScanText}
                    label="Reading document (OCR)"
                  />
                  <StepRow
                    active={extractStage === 'ai'}
                    done={false}
                    icon={Sparkles}
                    label="Extracting fields with AI"
                  />
                </div>
              )}
            </div>
          )}

          {extractError && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>Couldn't extract this document</AlertTitle>
              <AlertDescription>{extractError}</AlertDescription>
            </Alert>
          )}
          {autoFilledFrom && !extractStage && (
            <Alert variant="success">
              <Sparkles />
              <AlertTitle>Fields pre-filled from the document</AlertTitle>
              <AlertDescription>Please verify everything below before submitting.</AlertDescription>
            </Alert>
          )}
          {serviceTypeUnmatched && !extractStage && (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertTitle>Service type couldn't be matched</AlertTitle>
              <AlertDescription>
                The document mentioned &ldquo;{autoFilledFrom?.service_type}&rdquo;, which doesn't
                match any of the options below — please select it manually.
              </AlertDescription>
            </Alert>
          )}
          {ocrText && !extractStage && (
            <div className="text-sm">
              <button
                type="button"
                onClick={() => setShowOcrText((v) => !v)}
                className="text-muted-foreground underline-offset-2 hover:underline"
              >
                {showOcrText ? 'Hide' : 'Show'} raw text read from the document
              </button>
              {showOcrText && (
                <pre className="mt-2 max-h-40 overflow-auto rounded-md border bg-muted/30 p-2 text-xs whitespace-pre-wrap">
                  {ocrText}
                </pre>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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

function StepRow({
  active,
  done,
  icon: Icon,
  label,
}: {
  active: boolean
  done: boolean
  icon: typeof Sparkles
  label: string
}) {
  return (
    <div
      className={`flex items-center gap-2 transition-colors ${
        active ? 'text-foreground font-medium' : done ? 'text-emerald-700' : 'text-muted-foreground'
      }`}
    >
      {active ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : done ? (
        <CheckCircle2 className="size-3.5" />
      ) : (
        <Icon className="size-3.5" />
      )}
      {label}
    </div>
  )
}
