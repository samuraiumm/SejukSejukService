import { CheckCircle2 } from 'lucide-react'

interface ParsedWorkDone {
  checklist: string[]
  notes: string
}

const CHECKLIST_LINE = /^- \[x\] (.+)$/

export function parseWorkDone(workDone: string): ParsedWorkDone {
  const checklist: string[] = []
  const noteLines: string[] = []
  for (const line of workDone.split('\n')) {
    const match = line.match(CHECKLIST_LINE)
    if (match) {
      checklist.push(match[1])
    } else if (line.trim()) {
      noteLines.push(line)
    }
  }
  return { checklist, notes: noteLines.join('\n').trim() }
}

export default function WorkDoneDisplay({
  workDone,
  className = '',
}: {
  workDone: string
  className?: string
}) {
  const { checklist, notes } = parseWorkDone(workDone)

  if (checklist.length === 0) {
    return <p className={`whitespace-pre-wrap text-sm ${className}`}>{workDone}</p>
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <ul className="space-y-1">
        {checklist.map((item) => (
          <li key={item} className="flex items-start gap-1.5 text-sm">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {notes && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{notes}</p>}
    </div>
  )
}
