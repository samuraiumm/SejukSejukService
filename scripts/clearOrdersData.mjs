// One-off local script: deletes ALL orders and everything that cascades from
// them (service_completions, completion_attachments, audit_log,
// order_reschedules, notifications), plus the matching files in the
// `job-attachments` storage bucket. Does NOT touch technicians, profiles, or
// auth accounts — those are left exactly as-is.
//
// Uses the service role key (SUPABASE_SERVICE_ROLE_KEY in .env.local) — this key
// bypasses RLS entirely. Run locally only: `node scripts/clearOrdersData.mjs`.

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const { data: orders, error: ordersError } = await admin.from('orders').select('id, order_no')
  if (ordersError) throw ordersError

  if (orders.length === 0) {
    console.log('No orders found — nothing to clear.')
    return
  }

  console.log(`Found ${orders.length} orders. Removing storage files...`)

  let filesRemoved = 0
  for (const order of orders) {
    const { data: files, error: listError } = await admin.storage
      .from('job-attachments')
      .list(order.id, { limit: 1000 })
    if (listError) {
      console.error(`  Failed to list files for ${order.order_no}: ${listError.message}`)
      continue
    }
    if (files && files.length > 0) {
      const paths = files.map((f) => `${order.id}/${f.name}`)
      const { error: removeError } = await admin.storage.from('job-attachments').remove(paths)
      if (removeError) {
        console.error(`  Failed to remove files for ${order.order_no}: ${removeError.message}`)
      } else {
        filesRemoved += paths.length
      }
    }
  }

  console.log(`Removed ${filesRemoved} storage file(s).`)
  console.log('Deleting orders (cascades to completions, attachments rows, audit log, reschedules, notifications)...')

  const { error: deleteError } = await admin
    .from('orders')
    .delete()
    .in('id', orders.map((o) => o.id))
  if (deleteError) throw deleteError

  console.log(`Deleted ${orders.length} orders and all related data.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
