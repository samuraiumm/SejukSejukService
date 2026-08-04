import 'dotenv/config'
import { AiQueryAuthError, answerOperationsQuery } from '../server/aiQueryCore'

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

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const body = (req.body ?? {}) as { question?: string }
  const question = typeof body.question === 'string' ? body.question.trim() : ''
  if (!question) {
    res.status(400).json({ error: 'Missing "question" in request body' })
    return
  }

  try {
    const result = await answerOperationsQuery(question, extractBearerToken(req))
    res.status(200).json(result)
  } catch (err) {
    if (err instanceof AiQueryAuthError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    res.status(500).json({ error: err instanceof Error ? err.message : 'AI query failed' })
  }
}
