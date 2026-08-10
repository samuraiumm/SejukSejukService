// One-off local script: seeds ~25 realistic-looking demo orders spread over
// the last 30 days, with a full status mix (New/Assigned/In Progress/Job
// Done/Reviewed/Closed/Cancelled), matching audit_log trails, and a couple of
// order_reschedules. Customer names/addresses are fictional; phone numbers
// are deliberately dummy placeholders, not real numbers.
//
// No completion_attachments are created (no real photo files to attach from
// a script) — some completed orders will correctly show the existing
// "no photos uploaded" flag, which is realistic.
//
// Uses the service role key (SUPABASE_SERVICE_ROLE_KEY in .env.local) — this key
// bypasses RLS entirely. Run locally only: `node scripts/seedRealisticOrders.mjs`.
// Intended to run against an empty `orders` table (see clearOrdersData.mjs).

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

const SERVICE_CHECKLISTS = {
  'Aircond cleaning': [
    'Clean air filters',
    'Clean evaporator coil',
    'Clean condenser coil',
    'Check and clear drain pipe',
    'Test cooling performance',
    'Clean unit exterior',
    'Check thermostat operation',
  ],
  'Aircond repair': [
    'Diagnose reported fault',
    'Replace faulty component',
    'Test unit operation after repair',
    'Check refrigerant pressure',
    'Verify electrical connections',
    'Clean accessible parts',
  ],
  'Gas refill': [
    'Check for refrigerant leaks',
    'Evacuate old refrigerant',
    'Vacuum system',
    'Refill refrigerant to specification',
    'Test cooling after refill',
    'Record final pressure readings',
  ],
  'Installation': [
    'Site inspection and measurement',
    'Mount indoor unit with bracket',
    'Mount outdoor unit on pad/bracket',
    'Connect refrigerant piping',
    'Connect electrical wiring',
    'Vacuum and pressure test',
    'Test run all modes',
    'Explain operation to customer',
  ],
  'Inspection': [
    'Visual inspection of indoor unit',
    'Visual inspection of outdoor unit',
    'Check refrigerant pressure',
    'Inspect electrical connections',
    'Clean or replace filters as needed',
    'Test cooling and heating',
    'Provide condition report',
  ],
}

const SERVICE_TYPES = Object.keys(SERVICE_CHECKLISTS)

const PROBLEM_DESCRIPTIONS = {
  'Aircond cleaning': [
    'Unit smells musty when switched on, needs a full service.',
    'Aircond hasn\'t been cleaned in over a year, weak airflow.',
    'Requesting routine cleaning before the warranty check.',
    'Water dripping slightly from indoor unit, suspect clogged filter.',
  ],
  'Aircond repair': [
    'Unit not cooling at all, only blowing warm air.',
    'Making a loud rattling noise when it starts up.',
    'Aircond trips the circuit breaker a few minutes after turning on.',
    'Remote control not responding, unit stuck on last setting.',
  ],
  'Gas refill': [
    'Aircond cooling has gotten noticeably weaker over the past month.',
    'Technician suspects a slow refrigerant leak, needs check and refill.',
    'Ice forming on the indoor unit pipes.',
    'Cooling fine in the morning but weak by the afternoon.',
  ],
  'Installation': [
    'New unit purchased, needs installation in the master bedroom.',
    'Relocating aircond from old house, needs reinstallation.',
    'Installing a second unit in the living room.',
    'Old unit removed, replacing with a new inverter model.',
  ],
  'Inspection': [
    'Annual maintenance check requested by building management.',
    'Unit is due for a general health check before the warranty expires.',
    'Pre-purchase inspection for a unit left by the previous tenant.',
    'Routine quarterly inspection under the service contract.',
  ],
}

const CUSTOMERS = [
  { name: 'Ahmad Faiz', address: 'No. 12, Jalan Meranti 3, Seksyen 7, Shah Alam, Selangor' },
  { name: 'Siti Norlina', address: 'A-3-5, Pangsapuri Sri Damai, Jalan Damai, Shah Alam, Selangor' },
  { name: 'Kumar Selvam', address: 'No. 45, Jalan SS15/4, Subang Jaya, Selangor' },
  { name: 'Wei Ling Tan', address: '18, Jalan Puteri 2/3, Bandar Puteri, Puchong, Selangor' },
  { name: 'Farah Hanani', address: 'No. 7, Jalan Anggerik 5, Taman Bukit Rimau, Shah Alam, Selangor' },
  { name: 'Raju Muniandy', address: 'No. 22, Jalan Kenanga 8, Taman Sentosa, Klang, Selangor' },
  { name: 'Nurul Aina', address: 'B-12-3, Residensi Cyber, Jalan Cyber, Cyberjaya, Selangor' },
  { name: 'Chong Wei Sen', address: 'No. 3, Jalan USJ 9/5, Subang Jaya, Selangor' },
  { name: 'Aminah Zulkifli', address: 'No. 56, Jalan Perdana 2, Taman Perdana, Klang, Selangor' },
  { name: 'Vijay Kumar', address: 'No. 9, Jalan Bunga Raya, Taman Bunga, Petaling Jaya, Selangor' },
  { name: 'Halim Rosli', address: 'No. 31, Jalan Sepakat, Taman Sepakat, Shah Alam, Selangor' },
  { name: 'Meera Devi', address: 'No. 14, Jalan Cempaka 4, Taman Ehsan, Kepong, Kuala Lumpur' },
  { name: 'Zackary Lim', address: '2-4-8, Menara Suria, Jalan Suria, Shah Alam, Selangor' },
  { name: 'Suresh Rao', address: 'No. 27, Jalan Impian, Taman Impian Ehsan, Ampang, Selangor' },
  { name: 'Aisyah Kamal', address: 'No. 5, Jalan Delima 3, Taman Delima, Klang, Selangor' },
  { name: 'Devi Ramasamy', address: 'No. 61, Jalan Mawar 2, Taman Mawar, Shah Alam, Selangor' },
  { name: 'Hafiz Azman', address: 'No. 8, Jalan Damansara Utama, Damansara Utama, Petaling Jaya, Selangor' },
  { name: 'Grace Wong', address: 'No. 19, Jalan PJU 5/6, Kota Damansara, Petaling Jaya, Selangor' },
  { name: 'Rosli Ibrahim', address: 'No. 40, Jalan Kristal, Taman Kristal, Klang, Selangor' },
  { name: 'Nurhidayah Salleh', address: 'No. 16, Jalan Mutiara 6, Taman Mutiara, Shah Alam, Selangor' },
  { name: 'Ben Tan', address: 'No. 33, Jalan Utama 12, Taman Utama, Klang, Selangor' },
  { name: 'Puvanes Ravi', address: 'No. 21, Jalan Angkasa, Taman Angkasa, Petaling Jaya, Selangor' },
  { name: 'Liyana Rahman', address: 'No. 10, Jalan Idaman 3, Taman Idaman, Shah Alam, Selangor' },
  { name: 'Faridah Yaacob', address: 'No. 4, Jalan Harmoni, Taman Harmoni, Klang, Selangor' },
  { name: 'Sanjay Nair', address: 'No. 29, Jalan Impian Jaya, Bandar Impian, Klang, Selangor' },
]

const REMARKS_POOL = [
  'Customer was very cooperative and confirmed the unit is cooling well now.',
  'Advised customer to schedule the next service in 6 months.',
  'Customer requested a quote for a second unit — passed to office.',
  'Minor part was worn out, replaced with customer\'s approval.',
  null,
  null,
  'Customer not home during arrival, waited 15 minutes before starting.',
  'Recommended replacing the unit soon due to its age, customer to consider.',
]

const CANCEL_REASONS = [
  'Customer rescheduled to a personal technician instead.',
  'Customer no longer needs the service — unit fixed by someone else.',
  'Duplicate booking, already handled under another order.',
]

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

// Dummy Malaysian-mobile-style number — deliberately fake, not a real contact.
function dummyPhone() {
  return `601${randomInt(10000000, 99999999)}`
}

function daysAgoAt(daysAgo, hour = randomInt(9, 18), minute = randomInt(0, 59)) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, minute, 0, 0)
  return d
}

function buildWorkDone(serviceType) {
  const checklist = SERVICE_CHECKLISTS[serviceType]
  const doneCount = randomInt(Math.ceil(checklist.length * 0.7), checklist.length)
  const done = checklist.slice(0, doneCount).map((item) => `- [x] ${item}`)
  return done.join('\n')
}

async function main() {
  const { data: technicians, error: techError } = await admin
    .from('technicians')
    .select('id, name')
    .in('name', ['Ali', 'Bala', 'John', 'Yusoff'])
  if (techError) throw techError
  if (technicians.length < 4) {
    throw new Error('Expected technicians Ali, Bala, John, Yusoff to exist — run scripts/seedUsers.mjs first')
  }
  const techByName = new Map(technicians.map((t) => [t.name, t.id]))
  const techNames = [...techByName.keys()]

  // [status, count] — weighted toward completed/closed like a real pipeline,
  // with more of the completed ones landing in the last 7 days so the AI
  // "this week" queries have real data too.
  const PLAN = [
    { status: 'New', count: 2 },
    { status: 'Assigned', count: 3 },
    { status: 'In Progress', count: 1 },
    { status: 'Job Done', count: 6 },
    { status: 'Reviewed', count: 5 },
    { status: 'Closed', count: 6 },
    { status: 'Cancelled', count: 2 },
  ]

  const customerPool = [...CUSTOMERS]
  let created = 0
  let rescheduled = 0

  for (const { status, count } of PLAN) {
    for (let i = 0; i < count; i++) {
      const customer = customerPool.length > 0
        ? customerPool.splice(randomInt(0, customerPool.length - 1), 1)[0]
        : pick(CUSTOMERS)
      const serviceType = pick(SERVICE_TYPES)
      const quotedPrice = randomInt(80, 320)
      const techName = pick(techNames)
      const techId = techByName.get(techName)

      const orderPayload = {
        customer_name: customer.name,
        phone: dummyPhone(),
        address: customer.address,
        problem_description: pick(PROBLEM_DESCRIPTIONS[serviceType]),
        service_type: serviceType,
        quoted_price: quotedPrice,
        status,
      }

      let completedDaysAgo = null

      if (status === 'New') {
        // Unassigned, no schedule yet.
      } else if (status === 'Cancelled') {
        orderPayload.assigned_technician_id = Math.random() < 0.5 ? techId : null
        orderPayload.admin_notes = `Cancelled: ${pick(CANCEL_REASONS)}`
      } else if (status === 'Assigned') {
        orderPayload.assigned_technician_id = techId
        const sched = new Date()
        sched.setDate(sched.getDate() + randomInt(1, 6))
        sched.setHours(randomInt(9, 17), pick([0, 30]), 0, 0)
        orderPayload.scheduled_at = sched.toISOString()
      } else if (status === 'In Progress') {
        orderPayload.assigned_technician_id = techId
        const sched = daysAgoAt(0, randomInt(8, 11))
        orderPayload.scheduled_at = sched.toISOString()
      } else {
        // Job Done / Reviewed / Closed
        orderPayload.assigned_technician_id = techId
        completedDaysAgo = Math.random() < 0.6 ? randomInt(0, 6) : randomInt(7, 29)
      }

      const { data: orderNo, error: orderNoError } = await admin.rpc('next_order_no')
      if (orderNoError) throw orderNoError
      orderPayload.order_no = orderNo

      // Backdate creation to just before completion for finished orders; keep
      // still-open orders (New/Assigned/In Progress/Cancelled) recently
      // created so the pipeline reads as live rather than neglected.
      const createdAt =
        completedDaysAgo !== null
          ? daysAgoAt(completedDaysAgo + randomInt(0, 2))
          : daysAgoAt(randomInt(0, 5))
      orderPayload.created_at = createdAt.toISOString()

      const { data: order, error: orderError } = await admin
        .from('orders')
        .insert(orderPayload)
        .select('id')
        .single()
      if (orderError) throw orderError

      const auditEntries = [
        { action: 'Order created', actor_role: 'admin', actor_name: 'Admin', created_at: createdAt.toISOString() },
      ]

      if (orderPayload.assigned_technician_id) {
        auditEntries.push({
          action: 'Order assigned',
          actor_role: 'admin',
          actor_name: 'Admin',
          created_at: new Date(createdAt.getTime() + 30 * 60000).toISOString(),
        })
      }

      if (status === 'Cancelled') {
        auditEntries.push({
          action: orderPayload.admin_notes,
          actor_role: 'admin',
          actor_name: 'Admin',
          created_at: new Date(createdAt.getTime() + 60 * 60000).toISOString(),
        })
      }

      if (status === 'In Progress') {
        auditEntries.push({
          action: 'Job started',
          actor_role: 'technician',
          actor_name: techName,
          created_at: daysAgoAt(0, randomInt(8, 11)).toISOString(),
        })
      }

      if (status === 'Job Done' || status === 'Reviewed' || status === 'Closed') {
        const startedAt = daysAgoAt(completedDaysAgo, randomInt(8, 14))
        const completedAt = new Date(startedAt.getTime() + randomInt(35, 110) * 60000)
        const extraCharges = Math.random() < 0.25 ? randomInt(20, 80) : 0
        const finalAmount = quotedPrice + extraCharges

        const { error: completionError } = await admin.from('service_completions').insert({
          order_id: order.id,
          work_done: buildWorkDone(serviceType),
          extra_charges: extraCharges,
          final_amount: finalAmount,
          remarks: pick(REMARKS_POOL),
          technician_name: techName,
          started_at: startedAt.toISOString(),
          completed_at: completedAt.toISOString(),
        })
        if (completionError) throw completionError

        auditEntries.push({
          action: 'Job started',
          actor_role: 'technician',
          actor_name: techName,
          created_at: startedAt.toISOString(),
        })
        auditEntries.push({
          action: 'Job completed',
          actor_role: 'technician',
          actor_name: techName,
          created_at: completedAt.toISOString(),
        })

        if (status === 'Reviewed' || status === 'Closed') {
          auditEntries.push({
            action: 'Job reviewed',
            actor_role: 'manager',
            actor_name: 'Helmi',
            created_at: new Date(completedAt.getTime() + randomInt(1, 20) * 3600000).toISOString(),
          })
        }
        if (status === 'Closed') {
          auditEntries.push({
            action: 'Order closed',
            actor_role: 'manager',
            actor_name: 'Helmi',
            created_at: new Date(completedAt.getTime() + randomInt(21, 48) * 3600000).toISOString(),
          })
        }

        // A couple of these completed orders get a reschedule history entry,
        // for realism and so the "Postpone/Reschedule" KPI isn't always zero.
        if (rescheduled < 2 && Math.random() < 0.3) {
          const previous = new Date(startedAt.getTime() - randomInt(1, 3) * 86400000)
          await admin.from('order_reschedules').insert({
            order_id: order.id,
            previous_scheduled_at: previous.toISOString(),
            new_scheduled_at: startedAt.toISOString(),
            reason: 'Customer requested a later time slot.',
            changed_by_name: 'Admin',
          })
          rescheduled += 1
        }
      }

      await admin.from('audit_log').insert(
        auditEntries.map((e) => ({ ...e, order_id: order.id })),
      )

      created += 1
    }
  }

  console.log(`\nSeeded ${created} realistic orders (${rescheduled} with reschedule history).`)
  console.log('No completion photos were attached (script has no real image files) —')
  console.log('completed orders will correctly show "no photos uploaded" until real jobs add some.\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
