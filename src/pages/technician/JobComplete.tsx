import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { logAction } from '../../lib/audit'
import { getErrorMessage } from '../../lib/errors'
import { useAuth } from '../../context/AuthContext'
import type { Order } from '../../types'
import StatusBadge from '../../components/StatusBadge'
import { buildJobDoneMessage, buildWhatsAppLink } from '../../lib/whatsapp'

const MAX_FILES = 6

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
  const [submitting, setSubmitting] = useState(false)
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    if (!id) return
    void load(id)
  }, [id])

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
    if (!order || !session) return
    setStarting(true)
    const { error: updateError } = await supabase
      .from('orders')
      .update({ status: 'In Progress' })
      .eq('id', order.id)
    if (!updateError) {
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
  const finalAmount = quotedPrice + (Number(extraCharges) || 0)

  function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? [])
    if (chosen.length > MAX_FILES) {
      setError(`Please select at most ${MAX_FILES} files.`)
      return
    }
    setError(null)
    setFiles(chosen)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!order || !session) return
    setError(null)
    setSubmitting(true)
    try {
      const { data: completion, error: completionError } = await supabase
        .from('service_completions')
        .insert({
          order_id: order.id,
          work_done: workDone,
          extra_charges: Number(extraCharges) || 0,
          final_amount: finalAmount,
          remarks: remarks || null,
          technician_name: session.name,
          payment_amount: paymentAmount ? Number(paymentAmount) : null,
          payment_method: paymentMethod || null,
        })
        .select('id')
        .single()
      if (completionError) throw completionError

      for (const file of files) {
        const path = `${order.id}/${Date.now()}-${file.name}`
        const { error: uploadError } = await supabase.storage
          .from('job-attachments')
          .upload(path, file)
        if (uploadError) throw uploadError
        const { data: publicUrl } = supabase.storage.from('job-attachments').getPublicUrl(path)
        await supabase.from('completion_attachments').insert({
          service_completion_id: completion.id,
          file_url: publicUrl.publicUrl,
          file_type: file.type || 'application/octet-stream',
        })
      }

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

      setCompleted(true)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to submit completion'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>
  if (!order) return <p className="text-sm text-red-600">Job not found.</p>

  if (completed || order.status === 'Job Done') {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-violet-200 bg-violet-50 p-6">
        <h2 className="text-lg font-semibold text-violet-900">Job marked as Done</h2>
        <p className="mt-1 text-sm text-violet-800">
          {order.order_no} for {order.customer_name} has been recorded as completed.
        </p>
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
          className="mt-4 block w-full rounded-lg bg-emerald-600 py-2.5 text-center text-sm font-medium text-white hover:bg-emerald-700"
        >
          Notify Customer via WhatsApp
        </a>
        <button
          onClick={() => navigate('/technician/jobs')}
          className="mt-3 w-full rounded-lg border border-violet-300 py-2.5 text-sm font-medium text-violet-800 hover:bg-violet-100"
        >
          Back to My Jobs
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg font-semibold text-slate-900">{order.order_no}</h1>
          <p className="text-sm text-slate-500">
            {order.customer_name} &middot; {order.service_type}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {order.status === 'Assigned' && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
          <p className="text-sm text-sky-900">
            This job is assigned to you but not started yet.
          </p>
          <button
            onClick={startJob}
            disabled={starting}
            className="mt-3 w-full rounded-lg bg-sky-600 py-2.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {starting ? 'Starting…' : 'Start Job'}
          </button>
        </div>
      )}

      {order.status === 'In Progress' && (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
          <Field label="Work Done" required>
            <textarea
              required
              rows={3}
              className={inputCls}
              value={workDone}
              onChange={(e) => setWorkDone(e.target.value)}
            />
          </Field>

          <Field label="Extra Charges (RM)">
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputCls}
              value={extraCharges}
              onChange={(e) => setExtraCharges(e.target.value)}
            />
          </Field>

          <Field label={`Upload photos / video / PDF (max ${MAX_FILES})`}>
            <input
              type="file"
              multiple
              accept="image/*,video/*,application/pdf"
              onChange={handleFiles}
              className="block w-full text-sm text-slate-600"
            />
            {files.length > 0 && (
              <p className="mt-1 text-xs text-slate-500">{files.length} file(s) selected</p>
            )}
          </Field>

          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Quoted Price</span>
              <span>RM {quotedPrice.toFixed(2)}</span>
            </div>
            <div className="mt-1 flex justify-between font-medium text-slate-900">
              <span>Final Amount</span>
              <span>RM {finalAmount.toFixed(2)}</span>
            </div>
          </div>

          <Field label="Remarks">
            <textarea
              rows={2}
              className={inputCls}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </Field>

          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              Payment received (optional)
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Amount (RM)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputCls}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
              </Field>
              <Field label="Method">
                <select
                  className={inputCls}
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="">—</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Card">Card</option>
                  <option value="E-Wallet">E-Wallet</option>
                </select>
              </Field>
            </div>
          </details>

          <p className="text-xs text-slate-400">
            Technician: {session?.name} &middot; Timestamp: {new Date().toLocaleString()}
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Mark Job Done'}
          </button>
        </form>
      )}
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

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
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  )
}
