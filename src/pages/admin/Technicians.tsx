import { useEffect, useState, type FormEvent } from 'react'
import { Pencil, UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { getErrorMessage } from '../../lib/errors'
import type { Technician } from '../../types'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Switch } from '../../components/ui/switch'
import { Badge } from '../../components/ui/badge'
import { Skeleton } from '../../components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'

type TechRow = Technician & { user_id: string | null }

export default function Technicians() {
  const [technicians, setTechnicians] = useState<TechRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TechRow | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('technicians')
      .select('id, name, phone, active, user_id')
      .order('name')
    setTechnicians((data as TechRow[]) ?? [])
    setLoading(false)
  }

  function openAdd() {
    setEditing(null)
    setName('')
    setPhone('')
    setError(null)
    setDialogOpen(true)
  }

  function openEdit(tech: TechRow) {
    setEditing(tech)
    setName(tech.name)
    setPhone(tech.phone ?? '')
    setError(null)
    setDialogOpen(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (editing) {
        const { error: updateError } = await supabase
          .from('technicians')
          .update({ name, phone: phone || null })
          .eq('id', editing.id)
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase
          .from('technicians')
          .insert({ name, phone: phone || null })
        if (insertError) throw insertError
      }
      setDialogOpen(false)
      await load()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save technician'))
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleActive(tech: TechRow) {
    setTogglingId(tech.id)
    await supabase.from('technicians').update({ active: !tech.active }).eq('id', tech.id)
    await load()
    setTogglingId(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button onClick={openAdd}>
          <UserPlus />
          Add Technician
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? 'Loading…' : `${technicians.length} technician${technicians.length === 1 ? '' : 's'}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Login</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {technicians.map((tech) => (
                  <TableRow key={tech.id}>
                    <TableCell className="font-medium">{tech.name}</TableCell>
                    <TableCell>{tech.phone ?? '—'}</TableCell>
                    <TableCell>
                      {tech.user_id ? (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                          Linked
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Not provisioned
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={tech.active}
                        disabled={togglingId === tech.id}
                        onCheckedChange={() => toggleActive(tech)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(tech)}>
                        <Pencil />
                        <span className="sr-only">Edit {tech.name}</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Technician' : 'Add Technician'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update this technician’s profile.'
                : 'This creates a technician profile. Their login account still needs to be ' +
                  'provisioned separately (Supabase dashboard or scripts/seedUsers.mjs).'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                type="tel"
                placeholder="e.g. 0123456789"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : editing ? 'Save Changes' : 'Add Technician'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
