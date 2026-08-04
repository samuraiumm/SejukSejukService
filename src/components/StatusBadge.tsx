import type { OrderStatus } from '../types'
import { Badge } from './ui/badge'

const COLORS: Record<OrderStatus, string> = {
  New: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
  Assigned: 'bg-sky-100 text-sky-700 hover:bg-sky-100',
  'In Progress': 'bg-amber-100 text-amber-700 hover:bg-amber-100',
  'Job Done': 'bg-violet-100 text-violet-700 hover:bg-violet-100',
  Reviewed: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  Closed: 'bg-slate-200 text-slate-600 hover:bg-slate-200',
  Cancelled: 'bg-red-100 text-red-700 hover:bg-red-100',
}

export default function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge className={COLORS[status]}>{status}</Badge>
}
