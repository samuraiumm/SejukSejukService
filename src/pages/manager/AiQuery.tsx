import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowUp, Bot, Info, Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { cn } from '../../lib/utils'

interface ChatEntry {
  question: string
  answer: string
}

const EXAMPLES = [
  'What jobs did technician Ali complete this week?',
  'Which technician completed the most jobs this week?',
  'How many jobs were completed today?',
  'Which technician might be overloaded this week?',
]

const SCOPE_NOTE =
  "This assistant only answers 4 kinds of questions: jobs completed in a period (today / this week / last week), " +
  'which technician completed the most jobs, which technician might be overloaded, or what a named technician completed. ' +
  "Other questions — pricing, customer details, scheduling changes, etc. — won't be understood."

function ThinkingBubble() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50" />
    </div>
  )
}

function Avatar() {
  return (
    <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Bot className="size-4" />
    </div>
  )
}

export default function AiQuery() {
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState<ChatEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [history, loading])

  async function ask(q: string) {
    if (!q.trim() || loading) return
    setError(null)
    setLoading(true)
    setQuestion('')
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

  const composer = (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-1.5 rounded-full border bg-card py-1.5 pr-1.5 pl-4 shadow-sm"
    >
      <Input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ask about jobs, technicians, or completions…"
        className="h-auto border-0 bg-transparent px-0 py-1 shadow-none focus-visible:ring-0"
      />
      <Button
        type="submit"
        size="icon-sm"
        className="shrink-0 rounded-full"
        disabled={loading || !question.trim()}
      >
        <ArrowUp />
      </Button>
    </form>
  )

  if (history.length === 0) {
    return (
      <div className="flex min-h-[65vh] flex-col items-center justify-center px-4">
        <div className="w-full max-w-2xl space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </div>
            <h1 className="text-xl font-semibold">Ask about your operations</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Jobs, technicians, and completions — ask in plain English.
            </p>
          </div>

          {composer}

          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => void ask(ex)}
                className="rounded-full border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
              >
                {ex}
              </button>
            ))}
          </div>

          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <p>{SCOPE_NOTE}</p>
          </div>

          {error && <p className="text-center text-sm text-destructive">{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <div className="space-y-6 pb-4">
        {history.map((entry, i) => (
          <div key={i} className="space-y-4">
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                {entry.question}
              </div>
            </div>
            <div className="flex gap-3">
              <Avatar />
              <p className="flex-1 pt-1 text-sm leading-relaxed whitespace-pre-line">{entry.answer}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <Avatar />
            <ThinkingBubble />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div ref={bottomRef} />
      </div>

      <div className={cn('sticky bottom-4 z-10 space-y-2 bg-background pt-2')}>
        <div className="flex flex-wrap justify-center gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => void ask(ex)}
              disabled={loading}
              className="rounded-full border bg-card px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>
        {composer}
        <div className="flex items-start justify-center gap-1.5 px-2 text-center text-[11px] text-muted-foreground">
          <Info className="mt-0.5 size-3 shrink-0" />
          <p>{SCOPE_NOTE}</p>
        </div>
      </div>
    </div>
  )
}
