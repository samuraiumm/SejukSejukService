import { createClient } from '@supabase/supabase-js'
import { MOCK_TECHNICIANS } from '../src/types'

export interface AiQueryResult {
  answer: string
  matchedQueryType: string | null
  rows: unknown[]
}

type Range = 'today' | 'this_week' | 'last_week'

function rangeBounds(range: Range): { from: Date; to: Date } {
  const now = new Date()
  if (range === 'today') {
    const from = new Date(now)
    from.setHours(0, 0, 0, 0)
    return { from, to: now }
  }
  if (range === 'this_week') {
    const from = new Date(now)
    from.setDate(from.getDate() - 7)
    return { from, to: now }
  }
  // last_week: the 7-day window before this rolling week
  const to = new Date(now)
  to.setDate(to.getDate() - 7)
  const from = new Date(to)
  from.setDate(from.getDate() - 7)
  return { from, to }
}

function detectRange(question: string): { range: Range; label: string } {
  const q = question.toLowerCase()
  if (q.includes('last week')) return { range: 'last_week', label: 'last week' }
  if (q.includes('today')) return { range: 'today', label: 'today' }
  return { range: 'this_week', label: 'this week' }
}

function detectTechnician(question: string): string | null {
  const q = question.toLowerCase()
  return MOCK_TECHNICIANS.find((name) => q.includes(name.toLowerCase())) ?? null
}

export class AiQueryAuthError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function supabaseServer(accessToken: string | null) {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Supabase server credentials are not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  }
  // Attaching the caller's own access token means every query below runs
  // under their real identity, so RLS naturally scopes what they can see —
  // this client has no elevated privileges of its own.
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  })
}

async function requireManager(supabase: ReturnType<typeof supabaseServer>) {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    throw new AiQueryAuthError('Not signed in.', 401)
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', userData.user.id)
    .single()
  if (!profile || profile.role !== 'manager') {
    throw new AiQueryAuthError('Only managers can use the AI query assistant.', 403)
  }
}

async function phraseWithDeepSeek(prompt: string, fallback: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return fallback

  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You are an operations assistant for an aircon service company. ' +
              'You are given retrieved job records as JSON in the user message — this is the ONLY data you may use. ' +
              'Every order number, technician name, and figure you write must be copied verbatim from that JSON. ' +
              'Never write an order number, service type, or count that does not literally appear there — not even as ' +
              'a plausible-looking example. If the JSON has no per-order details (e.g. it only has technician names ' +
              'and counts), summarize only those counts/names and do not mention any order numbers at all. ' +
              'Reply in 2-4 short sentences or a compact list. If the data is empty, say plainly that no matching jobs were found.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    })
    if (!res.ok) return fallback
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    return json.choices?.[0]?.message?.content?.trim() || fallback
  } catch {
    return fallback
  }
}

export async function answerOperationsQuery(
  question: string,
  accessToken: string | null,
): Promise<AiQueryResult> {
  const supabase = supabaseServer(accessToken)
  await requireManager(supabase)
  const q = question.toLowerCase()

  // Query type 1: "how many jobs (were) completed today/this week/last week"
  if (/how many jobs/.test(q)) {
    const { range, label } = detectRange(q)
    const { from, to } = rangeBounds(range)
    const { data } = await supabase
      .from('service_completions')
      .select('id, technician_name, completed_at, orders ( order_no, service_type )')
      .gte('completed_at', from.toISOString())
      .lte('completed_at', to.toISOString())
    const rows = data ?? []
    const fallback = `${rows.length} job(s) were completed ${label}.`
    const answer = await phraseWithDeepSeek(
      `Question: "${question}"\nRetrieved data: ${JSON.stringify(rows)}`,
      fallback,
    )
    return { answer, matchedQueryType: 'count_jobs_in_range', rows }
  }

  // Query type 2: "which technician completed the most jobs"
  if (/most jobs|top technician|busiest/.test(q)) {
    const { range, label } = detectRange(q)
    const { from, to } = rangeBounds(range)
    const { data } = await supabase
      .from('service_completions')
      .select('id, technician_name, completed_at, final_amount')
      .gte('completed_at', from.toISOString())
      .lte('completed_at', to.toISOString())
    const rows = data ?? []
    const counts = new Map<string, number>()
    for (const r of rows) counts.set(r.technician_name, (counts.get(r.technician_name) ?? 0) + 1)
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
    const fallback =
      ranked.length === 0
        ? `No jobs were completed ${label}.`
        : `${ranked[0][0]} completed the most jobs ${label}, with ${ranked[0][1]} job(s).`
    const answer = await phraseWithDeepSeek(
      `Question: "${question}"\nJobs completed per technician (${label}): ${JSON.stringify(
        ranked,
      )}`,
      fallback,
    )
    return { answer, matchedQueryType: 'top_technician', rows }
  }

  // Query type 3: "which technician might be overloaded (this week)?"
  if (/overload|too many jobs|too busy|workload/.test(q)) {
    const { range, label } = detectRange(q)
    const { from, to } = rangeBounds(range)
    const { data } = await supabase
      .from('service_completions')
      .select('id, technician_name, completed_at')
      .gte('completed_at', from.toISOString())
      .lte('completed_at', to.toISOString())
    const rows = data ?? []
    const counts = new Map<string, number>()
    for (const r of rows) counts.set(r.technician_name, (counts.get(r.technician_name) ?? 0) + 1)
    const perTechnician = [...counts.entries()].sort((a, b) => b[1] - a[1])
    const activeCount = perTechnician.length
    const average = activeCount > 0 ? rows.length / activeCount : 0
    // Flag a technician as overloaded only when there's an actual team to compare
    // against (2+ active technicians) and their count is both meaningfully above
    // average and not just noise from one or two jobs.
    const OVERLOAD_RATIO = 1.4
    const MIN_JOBS = 3
    const overloaded =
      activeCount > 1
        ? perTechnician.filter(([, count]) => count >= MIN_JOBS && count > average * OVERLOAD_RATIO)
        : []
    const fallback =
      activeCount === 0
        ? `No jobs were completed ${label}, so there's no workload data to compare.`
        : overloaded.length === 0
          ? `No technician appears overloaded ${label} — job counts are fairly balanced (team average ${average.toFixed(1)}).`
          : overloaded
              .map(
                ([name, count]) =>
                  `Technician ${name} completed ${count} jobs ${label}, which is significantly higher than the team average of ${average.toFixed(1)}.`,
              )
              .join(' ')
    const answer = await phraseWithDeepSeek(
      `Question: "${question}"\nJobs completed per technician (${label}): ${JSON.stringify(
        perTechnician,
      )}\nTeam average: ${average.toFixed(1)}`,
      fallback,
    )
    return {
      answer,
      matchedQueryType: 'overloaded_technician',
      rows: perTechnician.map(([technician_name, jobs_completed]) => ({ technician_name, jobs_completed })),
    }
  }

  // Query type 4: "what jobs did technician <name> complete ..."
  const technician = detectTechnician(q)
  if (technician && /job/.test(q)) {
    const { range, label } = detectRange(q)
    const { from, to } = rangeBounds(range)
    const { data } = await supabase
      .from('service_completions')
      .select('id, technician_name, completed_at, work_done, orders ( order_no, service_type )')
      .eq('technician_name', technician)
      .gte('completed_at', from.toISOString())
      .lte('completed_at', to.toISOString())
    const rows = data ?? []
    const fallback =
      rows.length === 0
        ? `Technician ${technician} completed no jobs ${label}.`
        : `Technician ${technician} completed ${rows.length} job(s) ${label}.`
    const answer = await phraseWithDeepSeek(
      `Question: "${question}"\nRetrieved data: ${JSON.stringify(rows)}`,
      fallback,
    )
    return { answer, matchedQueryType: 'technician_jobs', rows }
  }

  return {
    answer:
      "I can only answer questions about: jobs completed in a period (today / this week / last week), " +
      'which technician completed the most jobs, which technician might be overloaded, or what jobs a ' +
      'named technician completed. Try rephrasing, e.g. "What jobs did Ali complete this week?"',
    matchedQueryType: null,
    rows: [],
  }
}
