// One-off local script: creates demo orders + service_completions spread across
// this week, with an uneven workload across technicians, so the AI Operational
// Insight query ("Which technician might be overloaded this week?") has real
// data to flag against instead of a single-technician week.
//
// Uses the service role key (SUPABASE_SERVICE_ROLE_KEY in .env.local) — this key
// bypasses RLS entirely. Run locally only: `node scripts/seedDemoData.mjs`.
// Safe to re-run: each run inserts a fresh batch of orders (new order numbers),
// it does not delete or reuse existing demo data.

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

const SERVICE_TYPES = ['Aircond cleaning', 'Aircond repair', 'Gas refill', 'Installation', 'Inspection']

// Days-ago offsets for each technician's completions this week — Bala is
// deliberately loaded far above the others so the overload flag
// (>=3 jobs and >1.4x team average) has an obvious case to catch.
const PLAN = {
  Bala: [0, 1, 1, 2, 2, 3, 4, 5, 6],
  Ali: [0, 3, 6],
  John: [1, 4, 6],
  Yusoff: [2, 5],
}

const CUSTOMER_NAMES = [
  'Ahmad', 'Siti', 'Kumar', 'Wei Ling', 'Farah', 'Raju', 'Nurul', 'Tan',
  'Aminah', 'Vijay', 'Chong', 'Halim', 'Meera', 'Zack', 'Suresh', 'Aisyah',
  'Devi', 'Hafiz', 'Grace', 'Rosli',
]

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(9 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60), 0, 0)
  return d
}

async function main() {
  const { data: technicians, error: techError } = await admin.from('technicians').select('id, name')
  if (techError) throw techError

  const byName = new Map(technicians.map((t) => [t.name, t.id]))
  for (const name of Object.keys(PLAN)) {
    if (!byName.has(name)) throw new Error(`Technician "${name}" not found — run scripts/seedUsers.mjs first`)
  }

  let created = 0

  for (const [technicianName, offsets] of Object.entries(PLAN)) {
    for (const offset of offsets) {
      const completedAt = daysAgo(offset)
      const serviceType = SERVICE_TYPES[Math.floor(Math.random() * SERVICE_TYPES.length)]
      const quotedPrice = 80 + Math.floor(Math.random() * 220)
      const customerName = CUSTOMER_NAMES[Math.floor(Math.random() * CUSTOMER_NAMES.length)]

      const { data: orderNo, error: orderNoError } = await admin.rpc('next_order_no')
      if (orderNoError) throw orderNoError

      const { data: order, error: orderError } = await admin
        .from('orders')
        .insert({
          order_no: orderNo,
          customer_name: customerName,
          phone: '60123456789',
          address: 'No. 1, Jalan Demo, Shah Alam',
          problem_description: `${serviceType} request (sample data)`,
          service_type: serviceType,
          quoted_price: quotedPrice,
          assigned_technician_id: byName.get(technicianName),
          admin_notes: 'This is sample data, added to test the AI insights feature.',
          status: 'Job Done',
        })
        .select('id')
        .single()
      if (orderError) throw orderError

      const { error: completionError } = await admin.from('service_completions').insert({
        order_id: order.id,
        work_done: `${serviceType} completed. (sample data)`,
        extra_charges: 0,
        final_amount: quotedPrice,
        remarks: 'Sample completion record.',
        technician_name: technicianName,
        completed_at: completedAt.toISOString(),
      })
      if (completionError) throw completionError

      created += 1
    }
  }

  console.log(`\nSeeded ${created} demo orders + completions this week:\n`)
  console.table(
    Object.entries(PLAN).map(([name, offsets]) => ({ technician: name, jobs_this_week: offsets.length })),
  )
  console.log('\nTry asking the AI assistant: "Which technician might be overloaded this week?"\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
