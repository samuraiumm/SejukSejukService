import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const email = process.argv[2]
const newPassword = process.argv[3]

const { data, error } = await admin.auth.admin.listUsers()
if (error) throw error

const user = data.users.find((u) => u.email === email)
if (!user) {
  console.error(`No auth user found with email "${email}"`)
  process.exit(1)
}

const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
  password: newPassword,
})
if (updateError) throw updateError

console.log(`Password updated for ${email}`)
