/** Paper sizes used by printed documents. */
export const PAGE_CSS = {
  A4: '@page { size: A4; margin: 14mm 12mm; }',
  'A4-landscape': '@page { size: A4 landscape; margin: 12mm; }',
  A5: '@page { size: A5; margin: 8mm; }',
  '80mm': '@page { size: 80mm auto; margin: 3mm; }',
} as const

export type PageFormat = keyof typeof PAGE_CSS

/**
 * Opens the browser's print dialog for the current page. The document title becomes the
 * default PDF file name; pageCss (an @page rule) overrides the paper size only while printing.
 */
export function printDocument(fileName: string, pageCss?: string) {
  const prevTitle = document.title
  document.title = fileName
  let style: HTMLStyleElement | null = null
  if (pageCss) {
    style = document.createElement('style')
    style.textContent = pageCss
    document.head.appendChild(style)
  }
  const restore = () => {
    document.title = prevTitle
    style?.remove()
    window.removeEventListener('afterprint', restore)
  }
  window.addEventListener('afterprint', restore)
  window.print()
}

/** Waits for every <img> on the page (signatures, logos) so they are not blank on paper. */
export async function waitForImages(timeoutMs = 5000) {
  const pending = Array.from(document.images).filter((img) => !img.complete)
  if (pending.length === 0) return
  await Promise.race([
    Promise.all(
      pending.map(
        (img) =>
          new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          }),
      ),
    ),
    new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
  ])
}

/** Report pages: A4 portrait, or A4 landscape for wide tables. */
export function printReport(fileName: string, orientation: 'portrait' | 'landscape' = 'portrait') {
  printDocument(fileName, orientation === 'landscape' ? PAGE_CSS['A4-landscape'] : undefined)
}

/** Opens a /cetak/... print page in its own tab; the page prints itself once its data is loaded. */
export function openPrintTab(path: string) {
  window.open(path, '_blank')
}
