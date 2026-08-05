import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import type { AuditLogEntry, Role } from '../../types'
import { Badge } from '../../components/ui/badge'
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

const PAGE_SIZE = 20

const ROLE_COLORS: Record<Role, string> = {
  admin: 'bg-sky-100 text-sky-700 hover:bg-sky-100',
  technician: 'bg-violet-100 text-violet-700 hover:bg-violet-100',
  manager: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
}

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)

  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  useEffect(() => {
    setPage(1)
  }, [roleFilter, fromDate, toDate])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter, fromDate, toDate, page])

  async function load() {
    setLoading(true)
    let query = supabase
      .from('audit_log')
      .select('*, orders ( order_no )', { count: 'exact' })

    if (roleFilter !== 'all') {
      query = query.eq('actor_role', roleFilter)
    }
    if (fromDate) {
      query = query.gte('created_at', new Date(fromDate).toISOString())
    }
    if (toDate) {
      const end = new Date(toDate)
      end.setHours(23, 59, 59, 999)
      query = query.lte('created_at', end.toISOString())
    }

    const from = (page - 1) * PAGE_SIZE
    const { data, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    setEntries((data as unknown as AuditLogEntry[]) ?? [])
    setTotalCount(count ?? 0)
    setLoading(false)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as Role | 'all')}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="technician">Technician</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          From
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          To
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? 'Loading…' : `${totalCount} entr${totalCount === 1 ? 'y' : 'ies'}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matching audit entries.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Actor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-muted-foreground">
                        {new Date(e.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono">
                        {e.orders?.order_no ? (
                          <Link
                            to={`/admin/orders/${e.order_id}`}
                            className="hover:underline"
                          >
                            {e.orders.order_no}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{e.action}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge className={ROLE_COLORS[e.actor_role]}>{e.actor_role}</Badge>
                          <span className="text-muted-foreground">{e.actor_name}</span>
                        </div>
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
