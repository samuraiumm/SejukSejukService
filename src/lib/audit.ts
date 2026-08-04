import { supabase } from './supabaseClient'
import type { Role } from '../types'

export async function logAction(params: {
  orderId: string
  action: string
  actorRole: Role
  actorName: string
}) {
  const { orderId, action, actorRole, actorName } = params
  await supabase.from('audit_log').insert({
    order_id: orderId,
    action,
    actor_role: actorRole,
    actor_name: actorName,
  })
}
