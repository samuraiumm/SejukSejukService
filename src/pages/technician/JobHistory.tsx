import { useEffect, useState } from 'react'
import { Clock, ChevronDown, ChevronUp, FileText, Receipt } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import type { Order, ServiceCompletion, CompletionAttachment } from '../../types'
import { Card, CardContent } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'

type HistoryEntry = ServiceCompletion & {
  orders: Pick<Order, 'order_no' | 'customer_name' | 'service_type' | 'address'>
  completion_attachments: Pick<CompletionAttachment, 'file_url' | 'file_type'>[]
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(startedAt: string | null, completedAt: string): string {
  if (!startedAt) return '—'
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 0) return '—'
  const totalMin = Math.round(ms / 60000)
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function isImage(type: string): boolean {
  return type.startsWith('image/')
}

export default function JobHistory() {
  const { session } = useAuth()
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!session?.technicianId) return
    void load()
  }, [session])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('service_completions')
      .select(
        '*, orders!inner(order_no, customer_name, service_type, address), completion_attachments(file_url, file_type)',
      )
      .order('completed_at', { ascending: false })
    setEntries((data as unknown as HistoryEntry[]) ?? [])
    setLoading(false)
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mt-4">
        <p className="text-sm text-muted-foreground">
          {loading ? 'Loading…' : `${entries.length} completed job${entries.length === 1 ? '' : 's'}`}
        </p>
      </div>

      {loading ? (
        <div className="mt-3 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          No completed jobs yet.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {entries.map((entry) => {
            const isOpen = expanded[entry.id] ?? false
            return (
              <Card key={entry.id}>
                <button
                  onClick={() => toggleExpand(entry.id)}
                  className="w-full p-4 text-left transition-colors hover:bg-accent/50"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-medium">
                      {entry.orders.order_no}
                    </span>
                    <div className="flex items-center gap-2">
                      {entry.started_at && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          {formatDuration(entry.started_at, entry.completed_at)}
                        </span>
                      )}
                      {isOpen ? (
                        <ChevronUp className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-sm">{entry.orders.customer_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.orders.service_type}
                    {' — '}
                    {formatDate(entry.completed_at)}
                  </p>
                </button>

                {isOpen && (
                  <CardContent className="space-y-4 border-t px-4 pb-4 pt-0">
                    <div className="space-y-1 pt-4">
                      <p className="text-xs font-medium text-muted-foreground">Work Done</p>
                      <p className="whitespace-pre-wrap text-sm">{entry.work_done}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Quoted</p>
                        <p>RM {entry.extra_charges > 0
                          ? (entry.final_amount - entry.extra_charges).toFixed(2)
                          : entry.final_amount.toFixed(2)}
                        </p>
                      </div>
                      {entry.extra_charges > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Extra Charges</p>
                          <p>RM {entry.extra_charges.toFixed(2)}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Final Amount</p>
                        <p className="font-medium">RM {entry.final_amount.toFixed(2)}</p>
                      </div>
                      {entry.payment_amount != null && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Payment</p>
                          <p>
                            RM {entry.payment_amount.toFixed(2)}
                            {entry.payment_method ? ` (${entry.payment_method})` : ''}
                          </p>
                        </div>
                      )}
                    </div>

                    {entry.remarks && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Remarks</p>
                        <p className="text-sm">{entry.remarks}</p>
                      </div>
                    )}

                    {entry.completion_attachments.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          Attachments ({entry.completion_attachments.length})
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          {entry.completion_attachments.map((att) =>
                            isImage(att.file_type) ? (
                              <a
                                key={att.file_url}
                                href={att.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="relative aspect-square overflow-hidden rounded-lg border"
                              >
                                <img
                                  src={att.file_url}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              </a>
                            ) : (
                              <a
                                key={att.file_url}
                                href={att.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex aspect-square items-center justify-center rounded-lg border bg-accent/50 text-xs text-muted-foreground"
                              >
                                <FileText className="size-5" />
                              </a>
                            ),
                          )}
                        </div>
                      </div>
                    )}

                    {entry.receipt_photo_url && (
                      <div className="space-y-1">
                        <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                          <Receipt className="size-3" />
                          Receipt
                        </p>
                        <a
                          href={entry.receipt_photo_url}
                          target="_blank"
                          rel="noreferrer"
                          className="block max-w-xs overflow-hidden rounded-lg border"
                        >
                          <img
                            src={entry.receipt_photo_url}
                            alt="Receipt"
                            className="w-full object-cover"
                          />
                        </a>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
