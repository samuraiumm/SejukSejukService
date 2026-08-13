import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Dev-only middleware so `npm run dev` can exercise /api/ai-query without
 * needing `vercel dev`. On Vercel, api/ai-query.ts is used directly instead.
 */
function aiQueryDevMiddleware(env: Record<string, string>): Plugin {
  return {
    name: 'ai-query-dev-middleware',
    configureServer(server) {
      server.middlewares.use('/api/ai-query', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }
        process.env.VITE_SUPABASE_URL ??= env.VITE_SUPABASE_URL
        process.env.VITE_SUPABASE_ANON_KEY ??= env.VITE_SUPABASE_ANON_KEY
        process.env.DEEPSEEK_API_KEY ??= env.DEEPSEEK_API_KEY

        let raw = ''
        for await (const chunk of req) raw += chunk
        const { answerOperationsQuery, AiQueryAuthError } = await server.ssrLoadModule(
          '/api/ai-query.ts',
        )
        try {
          const body = raw ? JSON.parse(raw) : {}
          const question = typeof body.question === 'string' ? body.question.trim() : ''
          if (!question) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Missing "question" in request body' }))
            return
          }
          const authHeader = req.headers.authorization
          const accessToken = authHeader?.startsWith('Bearer ')
            ? authHeader.slice('Bearer '.length)
            : null
          const result = await answerOperationsQuery(question, accessToken)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        } catch (err) {
          // AiQueryAuthError comes from ssrLoadModule's untyped namespace (effectively
          // `any`), so `instanceof` here doesn't narrow `err` for TypeScript even though
          // it works correctly at runtime — cast explicitly instead of fighting that.
          if (err instanceof AiQueryAuthError) {
            const authErr = err as { status: number; message: string }
            res.statusCode = authErr.status
            res.end(JSON.stringify({ error: authErr.message }))
            return
          }
          res.statusCode = 500
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'AI query failed' }))
        }
      })
    },
  }
}

/**
 * Same purpose as aiQueryDevMiddleware, for /api/ai-extract-document.
 */
function documentExtractDevMiddleware(env: Record<string, string>): Plugin {
  return {
    name: 'ai-extract-document-dev-middleware',
    configureServer(server) {
      server.middlewares.use('/api/ai-extract-document', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }
        process.env.VITE_SUPABASE_URL ??= env.VITE_SUPABASE_URL
        process.env.VITE_SUPABASE_ANON_KEY ??= env.VITE_SUPABASE_ANON_KEY
        process.env.DEEPSEEK_API_KEY ??= env.DEEPSEEK_API_KEY

        let raw = ''
        for await (const chunk of req) raw += chunk
        const { extractDocumentFields, DocumentExtractAuthError } = await server.ssrLoadModule(
          '/api/ai-extract-document.ts',
        )
        try {
          const body = raw ? JSON.parse(raw) : {}
          const text = typeof body.text === 'string' ? body.text : ''
          if (!text.trim()) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Missing "text" in request body' }))
            return
          }
          const authHeader = req.headers.authorization
          const accessToken = authHeader?.startsWith('Bearer ')
            ? authHeader.slice('Bearer '.length)
            : null
          const result = await extractDocumentFields(text, accessToken)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        } catch (err) {
          if (err instanceof DocumentExtractAuthError) {
            const authErr = err as { status: number; message: string }
            res.statusCode = authErr.status
            res.end(JSON.stringify({ error: authErr.message }))
            return
          }
          res.statusCode = 500
          res.end(
            JSON.stringify({ error: err instanceof Error ? err.message : 'Document extraction failed' }),
          )
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), aiQueryDevMiddleware(env), documentExtractDevMiddleware(env)],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      // Bind to all network interfaces (not just localhost) so the dev
      // server is reachable from a phone or other device on the same Wi-Fi.
      host: true,
    },
  }
})
