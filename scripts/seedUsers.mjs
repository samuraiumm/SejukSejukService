// One-off local script: creates the 6 real accounts (Admin, Manager, 4 technicians),
// their `profiles` rows, and links `technicians.user_id`.
//
// Uses the service role key (SUPABASE_SERVICE_ROLE_KEY in .env.local) — this key
// bypasses RLS entirely. Run locally only: `node scripts/seedUsers.mjs`.
// Never import this script's client setup into anything that ships to the browser.

import { config } from 'dotenv'
import { randomBytes } from 'node:crypto'
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

const ACCOUNTS = [
  { email: 'admin@sejuksejuk.local', role: 'admin', name: 'Admin' },
  { email: 'manager@sejuksejuk.local', role: 'manager', name: 'Siti' },
  { email: 'ali@sejuksejuk.local', role: 'technician', name: 'Ali', technicianName: 'Ali' },
  { email: 'john@sejuksejuk.local', role: 'technician', name: 'John', technicianName: 'John' },
  { email: 'bala@sejuksejuk.local', role: 'technician', name: 'Bala', technicianName: 'Bala' },
  { email: 'yusoff@sejuksejuk.local', role: 'technician', name: 'Yusoff', technicianName: 'Yusoff' },
]

function randomPassword() {
  return randomBytes(9).toString('base64url')
}

async function findExistingUserByEmail(email) {
  const { data, error } = await admin.auth.admin.listUsers()
  if (error) throw error
  return data.users.find((u) => u.email === email) ?? null
}

async function main() {
  const results = []

  for (const account of ACCOUNTS) {
    let userId
    let password = null

    const existing = await findExistingUserByEmail(account.email)
    if (existing) {
      userId = existing.id
    } else {
      password = randomPassword()
      const { data, error } = await admin.auth.admin.createUser({
        email: account.email,
        password,
        email_confirm: true,
      })
      if (error) throw new Error(`Failed to create ${account.email}: ${error.message}`)
      userId = data.user.id
    }

    const { error: profileError } = await admin
      .from('profiles')
      .upsert({ user_id: userId, role: account.role, name: account.name }, { onConflict: 'user_id' })
    if (profileError) throw new Error(`Failed to upsert profile for ${account.email}: ${profileError.message}`)

    if (account.technicianName) {
      const { error: techError } = await admin
        .from('technicians')
        .update({ user_id: userId })
        .eq('name', account.technicianName)
      if (techError) {
        throw new Error(`Failed to link technician ${account.technicianName}: ${techError.message}`)
      }
    }

    results.push({
      name: account.name,
      role: account.role,
      email: account.email,
      password: password ?? '(already existed — password unchanged)',
    })
  }

  console.log('\nSeeded accounts:\n')
  console.table(results)
  console.log('Save these passwords now — they are not stored anywhere and cannot be shown again.\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
