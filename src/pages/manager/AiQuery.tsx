import { useState, type FormEvent } from 'react'
import { Bot, Send, Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Card, CardContent } from '../../components/ui/card'

interface ChatEntry {
  question: string
  answer: string
}

const EXAMPLES = [
  'What jobs did technician Ali complete this week?',
  'Which technician completed the most jobs this week?',
  'How many jobs were completed today?',
]

export default function AiQuery() {
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState<ChatEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ask(q: string) {
    if (!q.trim()) return
    setError(null)
    setLoading(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const res = await fetch('/api/ai-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ question: q }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Request failed')
      setHistory((h) => [...h, { question: q, answer: data.answer }])
      setQuestion('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reach AI assistant')
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    void ask(question)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Sparkles className="size-5 text-primary" />
          Ask AI — Operations Query
        </h1>
        <p className="text-sm text-muted-foreground">
          Answers are generated only from data retrieved through controlled queries — not
          unrestricted database access.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <Button key={ex} variant="outline" size="sm" onClick={() => void ask(ex)}>
            {ex}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4">
          {history.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Bot className="size-4" />
              Ask a question or tap an example above.
            </p>
          ) : (
            history.map((entry, i) => (
              <div key={i} className="space-y-2">
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
                  {entry.question}
                </div>
                <div className="flex max-w-[85%] items-start gap-2">
                  <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <Bot className="size-3.5" />
                  </div>
                  <div className="whitespace-pre-line rounded-2xl rounded-bl-sm bg-muted px-4 py-2 text-sm">
                    {entry.answer}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about jobs, technicians, or completions…"
        />
        <Button type="submit" disabled={loading}>
          {loading ? (
            'Asking…'
          ) : (
            <>
              <Send />
              Ask
            </>
          )}
        </Button>
      </form>
    </div>
  )
}
