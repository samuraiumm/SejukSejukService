import { useState } from 'react'
import { ExternalLink, FileText, Receipt, ZoomIn } from 'lucide-react'
import type { CompletionAttachment } from '../types'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'

export function isImageAttachment(type: string): boolean {
  return type.startsWith('image/')
}

function Thumbnail({ url, onPreview }: { url: string; onPreview: (url: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPreview(url)}
      className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
    >
      <img src={url} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
      <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
        <ZoomIn className="size-5 text-white drop-shadow" />
      </div>
    </button>
  )
}

export default function CompletionAttachmentsGallery({
  attachments,
  receiptPhotoUrl,
}: {
  attachments: Pick<CompletionAttachment, 'file_url' | 'file_type'>[]
  receiptPhotoUrl?: string | null
}) {
  const [preview, setPreview] = useState<string | null>(null)

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
                <Thumbnail key={att.file_url} url={att.file_url} onPreview={setPreview} />
              ) : (
                <a
                  key={att.file_url}
                  href={att.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border bg-muted text-muted-foreground transition-colors hover:bg-accent"
                >
                  <FileText className="size-5" />
                  <span className="text-[10px] font-medium">File</span>
                </a>
              ),
            )}
          </div>
        </div>
      )}

      {receiptPhotoUrl && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Receipt className="size-3" />
            Receipt
          </p>
          <div className="max-w-[140px]">
            <Thumbnail url={receiptPhotoUrl} onPreview={setPreview} />
          </div>
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-h-[85vh] overflow-hidden p-2 sm:max-w-2xl">
          <DialogTitle className="sr-only">Attachment preview</DialogTitle>
          {preview && (
            <div className="space-y-2">
              <img
                src={preview}
                alt=""
                className="max-h-[70vh] w-full rounded-md border object-contain"
              />
              <a
                href={preview}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
              >
                <ExternalLink className="size-3.5" />
                Open original in new tab
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
