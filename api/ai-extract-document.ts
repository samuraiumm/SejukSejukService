import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

interface VercelLikeRequest {
  method?: string
  body?: unknown
  headers?: Record<string, string | string[] | undefined>
}

interface VercelLikeResponse {
  status: (code: number) => VercelLikeResponse
  json: (body: unknown) => void
}

function extractBearerToken(req: VercelLikeRequest): string | null {
  const header = req.headers?.authorization
  const value = Array.isArray(header) ? header[0] : header
  if (!value?.startsWith('Bearer ')) return null
  return value.slice('Bearer '.length)
}

export interface ExtractedDocumentFields {
  customer_name: string | null
  phone: string | null
  address: string | null
  service_type: string | null
  service_details: string | null
  amount: number | null
  date: string | null
}

export class DocumentExtractAuthError extends Error {
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
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  })
}

async function requireAdmin(supabase: ReturnType<typeof supabaseServer>) {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    throw new DocumentExtractAuthError('Not signed in.', 401)
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', userData.user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    throw new DocumentExtractAuthError('Only admins can use document extraction.', 403)
  }
}

const EMPTY_RESULT: ExtractedDocumentFields = {
  customer_name: null,
  phone: null,
  address: null,
  service_type: null,
  service_details: null,
  amount: null,
  date: null,
}

function parseModelJson(raw: string): ExtractedDocumentFields {
  try {
    const parsed = JSON.parse(raw) as Partial<ExtractedDocumentFields>
    return {
      customer_name: typeof parsed.customer_name === 'string' ? parsed.customer_name : null,
      phone: typeof parsed.phone === 'string' ? parsed.phone : null,
      address: typeof parsed.address === 'string' ? parsed.address : null,
      service_type: typeof parsed.service_type === 'string' ? parsed.service_type : null,
      service_details: typeof parsed.service_details === 'string' ? parsed.service_details : null,
      amount: typeof parsed.amount === 'number' ? parsed.amount : null,
      date: typeof parsed.date === 'string' ? parsed.date : null,
    }
  } catch {
    return EMPTY_RESULT
  }
}

/**
 * OCR text -> structured fields via DeepSeek. Unlike the AI Query module, there's no
 * useful non-AI fallback here (there's nothing to template-format), so a missing key
 * or a failed call surfaces as an explicit error rather than a degraded answer.
 */
export async function extractDocumentFields(
  ocrText: string,
  accessToken: string | null,
): Promise<ExtractedDocumentFields> {
  const supabase = supabaseServer(accessToken)
  await requireAdmin(supabase)

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    throw new Error('AI document extraction is not configured (missing DEEPSEEK_API_KEY).')
  }

  if (!ocrText.trim()) {
    return EMPTY_RESULT
  }

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You extract structured fields from raw OCR text of a scanned aircon service document. ' +
            'Return a JSON object with exactly these keys: customer_name, phone, address, service_type, ' +
            'service_details, amount, date. Every value must be copied or directly derived from the OCR ' +
            'text given — never invent a value. phone should keep only the digits/dashes as written. ' +
            'amount must be a plain number (no currency symbol) or null. date should be the date as it ' +
            'literally appears in the text, or null. If a field is not present in the text, its value must ' +
            'be null. Output only the JSON object, no other text.',
        },
        { role: 'user', content: `OCR text:\n${ocrText}` },
      ],
    }),
  })

  if (!res.ok) {
    throw new Error(`DeepSeek request failed (${res.status})`)
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const content = json.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('DeepSeek returned no content')
  }
  return parseModelJson(content)
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const body = (req.body ?? {}) as { text?: string }
  const text = typeof body.text === 'string' ? body.text : ''
  if (!text.trim()) {
    res.status(400).json({ error: 'Missing "text" in request body' })
    return
  }

  try {
    const result = await extractDocumentFields(text, extractBearerToken(req))
    res.status(200).json(result)
  } catch (err) {
    if (err instanceof DocumentExtractAuthError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    res.status(500).json({ error: err instanceof Error ? err.message : 'Document extraction failed' })
  }
}
