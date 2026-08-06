import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Clock, Phone, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { logAction } from '../../lib/audit'
import { notifyManagers } from '../../lib/notifications'
import { getErrorMessage } from '../../lib/errors'
import { useAuth } from '../../context/AuthContext'
import type { Order } from '../../types'
import StatusBadge from '../../components/StatusBadge'
import { buildJobCompletedManagerMessage, buildJobDoneMessage, buildWhatsAppLink } from '../../lib/whatsapp'
import { SERVICE_CHECKLISTS } from '../../lib/checklist'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { Skeleton } from '../../components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'

const MAX_FILES = 6
const START_KEY_PREFIX = 'sejuk-job-started-'

interface ManagerContact {
  name: string
  phone: string
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export default function JobComplete() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const navigate = useNavigate()

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [workDone, setWorkDone] = useState('')
  const [extraCharges, setExtraCharges] = useState('0')
  const [remarks, setRemarks] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({})
  const [jobStartedAt, setJobStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [managers, setManagers] = useState<ManagerContact[]>([])

  const formRef = useRef<HTMLFormElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!id) return
    void load(id)
  }, [id])

  useEffect(() => {
    if (!id || !order || order.status !== 'In Progress') return
    const key = START_KEY_PREFIX + id
    const saved = localStorage.getItem(key)
    if (saved) {
      const ts = Number(saved)
      setJobStartedAt(ts)
      setElapsed(Math.floor((Date.now() - ts) / 1000))
    }
  }, [id, order])

  useEffect(() => {
    if (!jobStartedAt) return
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - jobStartedAt) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [jobStartedAt])

  async function load(orderId: string) {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('*, technicians ( id, name )')
      .eq('id', orderId)
      .single()
    setOrder((data as unknown as Order) ?? null)
    setLoading(false)
  }

  async function startJob() {
    if (!order || !session || !id) return
    setStarting(true)
    const { error: updateError } = await supabase
      .from('orders')
      .update({ status: 'In Progress' })
      .eq('id', order.id)
    if (!updateError) {
      const now = Date.now()
      localStorage.setItem(START_KEY_PREFIX + id, now.toString())
      setJobStartedAt(now)
      await logAction({
        orderId: order.id,
        action: 'Job started',
        actorRole: 'technician',
        actorName: session.name,
      })
      await load(order.id)
    }
    setStarting(false)
  }

  const quotedPrice = order ? Number(order.quoted_price) : 0
  const extra = Number(extraCharges) || 0
  const finalAmount = quotedPrice + extra

  function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? [])
    const combined = [...files, ...chosen]
    if (combined.length > MAX_FILES) {
      setError(`Maximum ${MAX_FILES} files allowed (${files.length} already selected).`)
      return
    }
    setError(null)
    setFiles(combined)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setError(null)
  }

  function removeReceiptFile() {
    setReceiptFile(null)
  }

  const checklist = order ? SERVICE_CHECKLISTS[order.service_type] ?? [] : []

  function toggleChecklistItem(item: string) {
    setCheckedItems((prev) => {
      const next = { ...prev, [item]: !prev[item] }
      const checked = Object.entries(next)
        .filter(([, v]) => v)
        .map(([k]) => k)
      setWorkDone((prevWd) => {
        const customPart = prevWd
          .split('\n')
          .filter((line) => !line.startsWith('- [x] '))
          .join('\n')
          .trim()
        const checklistLines = checked.map((i) => `- [x] ${i}`)
        return [...checklistLines, customPart].filter(Boolean).join('\n')
      })
      return next
    })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!order || !session || !id) return
    setError(null)
    setSubmitting(true)
    try {
      const { data: existing } = await supabase
        .from('service_completions')
        .select('id, receipt_photo_url')
        .eq('order_id', order.id)
        .maybeSingle()

      let receiptUrl: string | null = existing?.receipt_photo_url ?? null
      if (receiptFile && !receiptUrl) {
        setUploadStatus('Uploading receipt photo…')
        const path = `${order.id}/receipt-${Date.now()}-${receiptFile.name}`
        const { error: receiptUploadError } = await supabase.storage
          .from('job-attachments')
          .upload(path, receiptFile)
        if (receiptUploadError) {
          throw new Error(`Failed to upload receipt photo: ${receiptUploadError.message}`)
        }
        receiptUrl = supabase.storage.from('job-attachments').getPublicUrl(path).data.publicUrl
      }

      setUploadStatus('Saving job details…')
      const completionFields: Record<string, unknown> = {
        work_done: workDone,
        extra_charges: extra,
        final_amount: finalAmount,
        remarks: remarks || null,
        technician_name: session.name,
        payment_amount: paymentAmount ? Number(paymentAmount) : null,
        payment_method: paymentMethod || null,
        receipt_photo_url: receiptUrl,
      }

      if (jobStartedAt) {
        completionFields.started_at = new Date(jobStartedAt).toISOString()
      }

      let completionId: string
      if (existing) {
        const { error: updateError } = await supabase
          .from('service_completions')
          .update(completionFields)
          .eq('id', existing.id)
        if (updateError) throw updateError
        completionId = existing.id
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('service_completions')
          .insert({ order_id: order.id, ...completionFields })
          .select('id')
          .single()
        if (insertError) throw insertError
        completionId = inserted.id
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setUploadStatus(`Uploading photo ${i + 1} of ${files.length}…`)
        const path = `${order.id}/${Date.now()}-${file.name}`
        const { error: uploadError } = await supabase.storage
          .from('job-attachments')
          .upload(path, file)
        if (uploadError) {
          throw new Error(`Failed to upload "${file.name}": ${uploadError.message}`)
        }
        const { data: publicUrl } = supabase.storage.from('job-attachments').getPublicUrl(path)
        await supabase.from('completion_attachments').insert({
          service_completion_id: completionId,
          file_url: publicUrl.publicUrl,
          file_type: file.type || 'application/octet-stream',
        })
      }

      setUploadStatus('Finishing up…')
      const { error: statusError } = await supabase
        .from('orders')
        .update({ status: 'Job Done' })
        .eq('id', order.id)
      if (statusError) throw statusError

      await logAction({
        orderId: order.id,
        action: 'Job completed',
        actorRole: 'technician',
        actorName: session.name,
      })

      await notifyManagers({
        title: 'Job completed — awaiting review',
        body: `${order.order_no} completed by ${session.name}. Final amount RM ${finalAmount.toFixed(2)}.`,
        orderId: order.id,
        link: '/manager/review',
      })

      const { data: managerRows } = await supabase
        .from('profiles')
        .select('name, phone')
        .eq('role', 'manager')
        .not('phone', 'is', null)
      setManagers((managerRows as ManagerContact[]) ?? [])

      localStorage.removeItem(START_KEY_PREFIX + id)
      setJobStartedAt(null)
      setCompleted(true)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to submit completion'))
    } finally {
      setSubmitting(false)
      setUploadStatus(null)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!order) {
    return (
      <Card className="mx-auto max-w-lg border-destructive/50 bg-destructive/10">
        <CardContent className="p-4">
          <p className="text-sm text-destructive">Job not found.</p>
        </CardContent>
      </Card>
    )
  }

  if (completed || order.status === 'Job Done') {
    return (
      <Card className="mx-auto max-w-lg border-violet-200 bg-violet-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-violet-900">
            <CheckCircle2 className="size-5" />
            Job marked as Done
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-violet-800">
            {order.order_no} for {order.customer_name} has been recorded as completed.
            {jobStartedAt && (
              <span className="mt-1 block">
                Time spent: {formatElapsed(Math.floor((Date.now() - jobStartedAt) / 1000))}
              </span>
            )}
          </p>
          <Button asChild className="mt-4 w-full" size="lg">
            <a
              href={buildWhatsAppLink(
                order.phone,
                buildJobDoneMessage({
                  customerName: order.customer_name,
                  orderNo: order.order_no,
                  technicianName: session?.name ?? 'Technician',
                  completedAt: new Date().toLocaleString(),
                }),
              )}
              target="_blank"
              rel="noreferrer"
            >
              Notify Customer via WhatsApp
            </a>
          </Button>
          {managers.map((manager) => (
            <Button key={manager.phone} asChild variant="secondary" size="lg" className="mt-3 w-full">
              <a
                href={buildWhatsAppLink(
                  manager.phone,
                  buildJobCompletedManagerMessage({
                    managerName: manager.name,
                    orderNo: order.order_no,
                    customerName: order.customer_name,
                    technicianName: session?.name ?? 'Technician',
                    quotedPrice,
                    finalAmount,
                    photoCount: files.length,
                  }),
                )}
                target="_blank"
                rel="noreferrer"
              >
                Notify {manager.name} (Manager) via WhatsApp
              </a>
            </Button>
          ))}
          <Button
            variant="outline"
            size="lg"
            className="mt-3 w-full border-violet-300 text-violet-800 hover:bg-violet-100"
            onClick={() => navigate('/technician/jobs')}
          >
            Back to My Jobs
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center gap-3">
        <Link
          to="/technician/jobs"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent active:bg-accent"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-mono text-lg font-semibold">{order.order_no}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {order.customer_name} &middot; {order.service_type}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <Card className="mb-4">
        <CardContent className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">Job Details</p>
              {order.problem_description && (
                <p className="text-sm text-muted-foreground">{order.problem_description}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {order.address} &middot; {order.service_type}
              </p>
            </div>
            <a
              href={`tel:${order.phone}`}
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm text-primary hover:bg-accent"
            >
              <Phone className="size-3.5" />
              <span className="hidden sm:inline">{order.phone}</span>
              <span className="sm:hidden">Call</span>
            </a>
          </div>
        </CardContent>
      </Card>

      {order.status === 'Assigned' && (
        <Card className="border-sky-200 bg-sky-50">
          <CardContent className="p-4">
            <p className="text-sm text-sky-900">
              This job is assigned to you but not started yet.
            </p>
            <Button
              size="lg"
              className="mt-3 w-full"
              onClick={startJob}
              disabled={starting}
            >
              {starting ? 'Starting…' : 'Start Job'}
            </Button>
          </CardContent>
        </Card>
      )}

      {order.status === 'In Progress' && (
        <Card>
          <CardContent>
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
              {jobStartedAt && (
                <div className="flex items-center gap-2 rounded-lg border bg-accent/50 px-3 py-2 text-sm">
                  <Clock className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Elapsed:</span>
                  <span className="font-mono font-medium">{formatElapsed(elapsed)}</span>
                </div>
              )}

              <Field label="Work Done" required>
                <Textarea
                  required
                  rows={3}
                  value={workDone}
                  onChange={(e) => setWorkDone(e.target.value)}
                  placeholder="Describe the work performed on site…"
                />
              </Field>

              {checklist.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Checklist</Label>
                  <div className="rounded-lg border p-3">
                    <div className="grid grid-cols-1 gap-2">
                      {checklist.map((item) => (
                        <label
                          key={item}
                          className="flex items-start gap-2 rounded px-2 py-1 text-sm hover:bg-accent/50"
                        >
                          <input
                            type="checkbox"
                            checked={checkedItems[item] ?? false}
                            onChange={() => toggleChecklistItem(item)}
                            className="mt-0.5"
                          />
                          <span
                            className={checkedItems[item] ? '' : 'text-muted-foreground'}
                          >
                            {item}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <Field label="Extra Charges (RM)">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={extraCharges}
                  onChange={(e) => setExtraCharges(e.target.value)}
                />
              </Field>

              <Field label={`Upload photos / video / PDF (max ${MAX_FILES})`}>
                <Input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*,application/pdf"
                  onChange={handleFiles}
                  disabled={files.length >= MAX_FILES}
                />
                {files.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {files.map((f, i) => (
                      <li
                        key={`${f.name}-${f.size}-${i}`}
                        className="flex items-center justify-between rounded bg-accent/50 px-2 py-1 text-xs"
                      >
                        <span className="truncate">{f.name}</span>
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Field>

              <div className="rounded-lg bg-accent px-3 py-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Quoted Price</span>
                  <span>RM {quotedPrice.toFixed(2)}</span>
                </div>
                {extra > 0 && (
                  <div className="mt-1 flex justify-between text-muted-foreground">
                    <span>Extra Charges</span>
                    <span>+ RM {extra.toFixed(2)}</span>
                  </div>
                )}
                <div className="mt-1 flex justify-between border-t pt-1 font-medium">
                  <span>Final Amount</span>
                  <span>RM {finalAmount.toFixed(2)}</span>
                </div>
              </div>

              <Field label="Remarks">
                <Textarea
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Any notes for the admin or manager…"
                />
              </Field>

              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Payment received (optional)
                </summary>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="Amount (RM)">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                    />
                  </Field>
                  <Field label="Method">
                    <Select
                      value={paymentMethod || 'none'}
                      onValueChange={(value) => setPaymentMethod(value === 'none' ? '' : value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                        <SelectItem value="E-Wallet">E-Wallet</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="col-span-2">
                    <Field label="Receipt Photo">
                      {receiptFile ? (
                        <div className="flex items-center justify-between rounded-md border px-3 py-2 text-xs">
                          <span className="truncate">{receiptFile.name}</span>
                          <button
                            type="button"
                            onClick={removeReceiptFile}
                            className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                        />
                      )}
                    </Field>
                  </div>
                </div>
              </details>

              <p className="text-xs text-muted-foreground">
                Technician: {session?.name} &middot; {new Date().toLocaleString()}
              </p>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {uploadStatus && <p className="text-sm text-muted-foreground">{uploadStatus}</p>}

              <Button
                type="button"
                size="lg"
                disabled={submitting}
                className="w-full"
                onClick={() => setConfirmOpen(true)}
              >
                {submitting ? uploadStatus ?? 'Submitting…' : 'Mark Job Done'}
              </Button>

              <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Mark job as done?</DialogTitle>
                    <DialogDescription>
                      This will submit the completion report for{' '}
                      <span className="font-mono font-medium text-foreground">{order.order_no}</span>{' '}
                      and notify the admin for review.
                      {jobStartedAt && (
                        <>
                          <br />
                          Time spent: {formatElapsed(elapsed)}
                        </>
                      )}
                      {extra > 0 && (
                        <>
                          <br />
                          Final amount: RM {finalAmount.toFixed(2)} (includes RM {extra.toFixed(2)} extra charges)
                        </>
                      )}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                      Go Back
                    </Button>
                    <Button
                      onClick={() => {
                        setConfirmOpen(false)
                        formRef.current?.requestSubmit()
                      }}
                    >
                      Confirm, Mark as Done
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </form>
          </CardContent>
        </Card>
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
