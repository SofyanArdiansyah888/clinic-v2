import { createContext, useContext, useRef, useState, type FormEvent } from 'react'

/** Field key → message. Keyed by the control's id (what a <Field htmlFor> points at). */
export type FieldErrors = Record<string, string>

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

/** Indonesian message for a control that fails native constraint validation. */
export function validityMessage(el: Control): string {
  const v = el.validity
  if (v.valueMissing) return el instanceof HTMLSelectElement || el.type === 'file' || el.type === 'checkbox' || el.dataset.field ? 'Wajib dipilih' : 'Wajib diisi'
  if (v.typeMismatch) {
    if (el.type === 'email') return 'Format email tidak valid'
    if (el.type === 'url') return 'Format URL tidak valid'
    return 'Format tidak valid'
  }
  if (v.rangeUnderflow && 'min' in el) return `Minimal ${el.min}`
  if (v.rangeOverflow && 'max' in el) return `Maksimal ${el.max}`
  if (v.tooShort && 'minLength' in el) return `Minimal ${el.minLength} karakter`
  if (v.tooLong && 'maxLength' in el) return `Maksimal ${el.maxLength} karakter`
  if (v.stepMismatch) return 'Nilai tidak valid'
  if (v.badInput) return 'Isi dengan angka'
  if (v.patternMismatch) return el.title || 'Format tidak valid'
  return el.validationMessage || 'Isian tidak valid'
}

function isControl(el: Element): el is Control {
  return el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement
}

/**
 * Validates every control in the form. A control may carry `data-field="<id>"`
 * to report under another element's id (SearchableSelect's hidden input reports
 * under its trigger button). Marks failing targets with aria-invalid.
 */
function collectErrors(form: HTMLFormElement): FieldErrors {
  const out: FieldErrors = {}
  for (const el of Array.from(form.elements)) {
    if (!isControl(el) || !el.willValidate) continue
    const key = el.dataset.field || el.id || el.name
    if (!key) continue
    const target = el.dataset.field ? document.getElementById(el.dataset.field) : el
    if (el.validity.valid) {
      if (!out[key]) target?.removeAttribute('aria-invalid')
      continue
    }
    out[key] ??= validityMessage(el)
    target?.setAttribute('aria-invalid', 'true')
  }
  return out
}

/**
 * Inline validation for a <form> that keeps using native constraints
 * (required, type="email", min...). Spread `formProps` on the form and wrap its
 * fields in `<FieldErrorsContext.Provider value={errors}>` so each <Field>
 * shows its own message. The form's own onSubmit only runs when it is valid.
 */
export function useFormValidation() {
  const [errors, setErrors] = useState<FieldErrors>({})
  const submitted = useRef(false)

  function onSubmitCapture(e: FormEvent<HTMLFormElement>) {
    // A portalled child form (quick-create dialog) bubbles through this form in
    // React's tree; only validate submits of this form itself.
    if (e.target !== e.currentTarget) return
    const next = collectErrors(e.currentTarget)
    setErrors(next)
    if (Object.keys(next).length === 0) {
      submitted.current = false
      return
    }
    submitted.current = true
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }

  // After a failed submit, clear messages as soon as the user fixes a field.
  function recheck(e: { currentTarget: HTMLFormElement }) {
    if (!submitted.current) return
    const form = e.currentTarget
    // Next tick: let controlled inputs and SearchableSelect commit their value first.
    window.setTimeout(() => {
      if (form.isConnected) setErrors(collectErrors(form))
    })
  }

  function reset() {
    submitted.current = false
    setErrors({})
  }

  return {
    errors,
    reset,
    formProps: {
      noValidate: true,
      onSubmitCapture,
      onInputCapture: recheck,
      onChangeCapture: recheck,
      onClickCapture: recheck,
    },
  }
}

export const FieldErrorsContext = createContext<FieldErrors>({})

export function useFieldError(id?: string) {
  const errors = useContext(FieldErrorsContext)
  return id ? errors[id] : undefined
}

// ── Server-side validation ──

function humanizeField(name: string) {
  const words = name
    .replace(/ID$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const TAG_MESSAGE: Record<string, string> = {
  required: 'wajib diisi',
  email: 'format tidak valid',
  min: 'terlalu kecil/pendek',
  gt: 'harus lebih dari 0',
  gte: 'terlalu kecil',
  max: 'terlalu besar/panjang',
  lte: 'terlalu besar',
  oneof: 'pilihan tidak valid',
  len: 'panjang tidak sesuai',
}

/**
 * Turns the API's binding errors (gin validator text such as
 * "Field validation for 'Nama' failed on the 'required' tag") into
 * "Nama wajib diisi". Returns null when the text isn't a validator message.
 */
export function translateServerValidation(errors: unknown): string | null {
  if (typeof errors !== 'string') return null
  const found = [...errors.matchAll(/Field validation for '(\w+)' failed on the '(\w+)' tag/g)]
  if (found.length > 0) {
    return found.map(([, field, tag]) => `${humanizeField(field)} ${TAG_MESSAGE[tag] ?? 'tidak valid'}`).join(', ')
  }
  const typeErr = errors.match(/Go struct field \w+\.(\w+) of type (\w+)/)
  if (typeErr) {
    return `${humanizeField(typeErr[1])} ${/int|float/.test(typeErr[2]) ? 'harus berupa angka' : 'tidak valid'}`
  }
  return null
}
