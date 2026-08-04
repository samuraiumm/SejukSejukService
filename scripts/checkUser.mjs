import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const email = process.argv[2]
const { data, error } = await admin.auth.admin.listUsers()
if (error) throw error

const user = data.users.find((u) => u.email === email)
if (!user) {
  console.log(`No auth user found with email "${email}"`)
} else {
  console.log({
    id: user.id,
    email: user.email,
    email_confirmed_at: user.email_confirmed_at,
    banned_until: user.banned_until,
    created_at: user.created_at,
  })
}
