import { supabase } from './supabaseClient'

interface NotifyPayload {
  title: string
  body: string
  orderId?: string
  link?: string
}

async function insertNotifications(userIds: string[], payload: NotifyPayload) {
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return
  await supabase.from('notifications').insert(
    ids.map((userId) => ({
      user_id: userId,
      order_id: payload.orderId ?? null,
      title: payload.title,
      body: payload.body,
      link: payload.link ?? null,
    })),
  )
}

/** Notifies one technician, addressed by their `technicians.id` (not their auth user id). */
export async function notifyTechnician(technicianId: string, payload: NotifyPayload) {
  const { data } = await supabase
    .from('technicians')
    .select('user_id')
    .eq('id', technicianId)
    .single()
  if (data?.user_id) await insertNotifications([data.user_id], payload)
}

export async function notifyManagers(payload: NotifyPayload) {
  const { data } = await supabase.from('profiles').select('user_id').eq('role', 'manager')
  await insertNotifications((data ?? []).map((p) => p.user_id), payload)
}

export async function notifyAdmins(payload: NotifyPayload) {
  const { data } = await supabase.from('profiles').select('user_id').eq('role', 'admin')
  await insertNotifications((data ?? []).map((p) => p.user_id), payload)
}
