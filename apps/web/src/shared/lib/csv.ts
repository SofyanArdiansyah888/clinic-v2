export type CsvValue = string | number | null | undefined

function escapeCell(value: CsvValue) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// Downloads rows as a CSV file. It uses ';' as the separator and a UTF-8 BOM so
// Excel with an Indonesian locale (where ',' is the decimal mark) opens it in columns.
export function downloadCsv(filename: string, headers: string[], rows: CsvValue[][]) {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(';'))
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
