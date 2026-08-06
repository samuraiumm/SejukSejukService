import { createWorker } from 'tesseract.js'

/**
 * Runs client-side OCR on an image file and returns the raw extracted text.
 * Loads English + Malay together since real documents in this business (Malaysian
 * customer names, addresses, and often mixed-language labels) may use either.
 */
export async function extractTextFromImage(file: File): Promise<string> {
  const worker = await createWorker(['eng', 'msa'])
  try {
    const {
      data: { text },
    } = await worker.recognize(file)
    return text
  } finally {
    await worker.terminate()
  }
}
