import { FileText, Receipt } from 'lucide-react'
import type { CompletionAttachment } from '../types'

export function isImageAttachment(type: string): boolean {
  return type.startsWith('image/')
}

export default function CompletionAttachmentsGallery({
  attachments,
  receiptPhotoUrl,
}: {
  attachments: Pick<CompletionAttachment, 'file_url' | 'file_type'>[]
  receiptPhotoUrl?: string | null
}) {
  if (attachments.length === 0 && !receiptPhotoUrl) return null

  return (
    <div className="space-y-4">
      {attachments.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Attachments ({attachments.length})
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {attachments.map((att) =>
              isImageAttachment(att.file_type) ? (
                <a
                  key={att.file_url}
                  href={att.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="relative aspect-square overflow-hidden rounded-lg border"
                >
                  <img src={att.file_url} alt="" className="h-full w-full object-cover" />
                </a>
              ) : (
                <a
                  key={att.file_url}
                  href={att.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex aspect-square items-center justify-center rounded-lg border bg-accent/50 text-xs text-muted-foreground"
                >
                  <FileText className="size-5" />
                </a>
              ),
            )}
          </div>
        </div>
      )}

      {receiptPhotoUrl && (
        <div className="space-y-1">
          <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Receipt className="size-3" />
            Receipt
          </p>
          <a
            href={receiptPhotoUrl}
            target="_blank"
            rel="noreferrer"
            className="block max-w-xs overflow-hidden rounded-lg border"
          >
            <img src={receiptPhotoUrl} alt="Receipt" className="w-full object-cover" />
          </a>
        </div>
      )}
    </div>
  )
}
