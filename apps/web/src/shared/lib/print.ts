/**
 * Opens the browser's print dialog for the current page. The document title becomes the
 * default PDF file name; a landscape report swaps the page size only while printing.
 */
export function printReport(fileName: string, orientation: 'portrait' | 'landscape' = 'portrait') {
  const prevTitle = document.title
  document.title = fileName
  let style: HTMLStyleElement | null = null
  if (orientation === 'landscape') {
    style = document.createElement('style')
    style.textContent = '@page { size: A4 landscape; margin: 12mm; }'
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
