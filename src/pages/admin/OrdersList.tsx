import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, PlusCircle, Search } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import type { Order, OrderStatus, Technician } from '../../types'
import { STATUS_ORDER } from '../../lib/orderStatus'
import StatusBadge from '../../components/StatusBadge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table'
import { Skeleton } from '../../components/ui/skeleton'

const PAGE_SIZE = 10

export default function OrdersList() {
  const [orders, setOrders] = useState<Order[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
  const [technicianFilter, setTechnicianFilter] = useState('all')
  const [page, setPage] = useState(1)

  useEffect(() => {
    supabase
      .from('technicians')
      .select('id, name, phone, active')
      .order('name')
      .then(({ data }) => setTechnicians((data as Technician[]) ?? []))
  }, [])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, technicianFilter])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, technicianFilter, page])

  async function load() {
    setLoading(true)
    let query = supabase
      .from('orders')
      .select('*, technicians ( id, name )', { count: 'exact' })

    if (search.trim()) {
      const term = search.trim().replace(/[,%]/g, '')
      query = query.or(`order_no.ilike.%${term}%,customer_name.ilike.%${term}%`)
    }
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }
    if (technicianFilter === 'unassigned') {
      query = query.is('assigned_technician_id', null)
    } else if (technicianFilter !== 'all') {
      query = query.eq('assigned_technician_id', technicianFilter)
    }

    const from = (page - 1) * PAGE_SIZE
    const { data, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    setOrders((data as unknown as Order[]) ?? [])
    setTotalCount(count ?? 0)
    setLoading(false)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="text-sm text-muted-foreground">All service orders across branches</p>
        </div>
        <Button asChild>
          <Link to="/admin/new-order">
            <PlusCircle />
            New Order
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search order no. or customer…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as OrderStatus | 'all')}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={technicianFilter} onValueChange={setTechnicianFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All technicians</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {technicians.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? 'Loading…' : `${totalCount} order${totalCount === 1 ? '' : 's'}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders match these filters.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order No.</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Technician</TableHead>
                    <TableHead>Quoted</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.id} className="cursor-pointer">
                      <TableCell className="p-0">
                        <Link
                          to={`/admin/orders/${o.id}`}
                          className="block px-2 py-2 font-mono"
                        >
                          {o.order_no}
                        </Link>
                      </TableCell>
                      <TableCell>{o.customer_name}</TableCell>
                      <TableCell>{o.service_type}</TableCell>
                      <TableCell>{o.technicians?.name ?? '—'}</TableCell>
                      <TableCell>RM {Number(o.quoted_price).toFixed(2)}</TableCell>
                      <TableCell>
                        <StatusBadge status={o.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
