// One-off local script: resets the password for every seeded account to a fixed value.
// Uses the service role key (SUPABASE_SERVICE_ROLE_KEY in .env.local) — run locally only.

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

const NEW_PASSWORD = process.argv[2]
if (!NEW_PASSWORD) {
  console.error('Usage: node scripts/resetAllPasswords.mjs <newPassword>')
  process.exit(1)
}

const EMAILS = [
  'admin@sejuksejuk.local',
  'manager@sejuksejuk.local',
  'ali@sejuksejuk.local',
  'john@sejuksejuk.local',
  'bala@sejuksejuk.local',
  'yusoff@sejuksejuk.local',
]

async function main() {
  const { data, error } = await admin.auth.admin.listUsers()
  if (error) throw error

  for (const email of EMAILS) {
    const user = data.users.find((u) => u.email === email)
    if (!user) {
      console.error(`No auth user found with email "${email}" — skipping`)
      continue
    }
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      password: NEW_PASSWORD,
    })
    if (updateError) {
      console.error(`Failed to update ${email}: ${updateError.message}`)
      continue
    }
    console.log(`Password updated for ${email}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
