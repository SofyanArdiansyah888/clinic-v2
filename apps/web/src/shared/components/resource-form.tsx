import { Input } from '@/shared/ui/input'
import { Field } from '@/shared/ui/field'
import { RupiahInput } from '@/shared/ui/rupiah-input'
import { StaffSelect } from '@/shared/components/StaffSelect'
import { WIDE_FORM, type FormField, type FormValues } from '@/shared/lib/form'

// Same look as <Input>, for inputs rendered without it.
const INPUT_CLASS =
  'flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs transition-colors placeholder:text-slate-400 focus-visible:border-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500'

type ResourceFormFieldsProps = {
  fields: FormField[]
  values: FormValues
  onChange: (values: FormValues) => void
  /** Prefix for input ids, unique per form on the page. */
  idPrefix: string
}

export function ResourceFormFields({ fields, values, onChange, idPrefix }: ResourceFormFieldsProps) {
  const set = (name: string, value: string) => onChange({ ...values, [name]: value })

  const wide = fields.length > WIDE_FORM
  return (
    <div className={wide ? 'grid gap-4 sm:grid-cols-2' : 'space-y-4'}>
      {fields.map((field, index) => {
        const id = `${idPrefix}-${field.name}`
        const value = values[field.name] ?? ''
        return (
          <Field
            key={field.name}
            label={field.label}
            htmlFor={id}
            required={field.required}
            className={wide && field.type === 'textarea' ? 'sm:col-span-2' : undefined}
          >
            {field.type === 'select' ? (
              <select
                id={id}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-xs focus:ring-2 focus:ring-rose-500"
                value={value}
                onChange={(e) => set(field.name, e.target.value)}
                required={field.required}
              >
                {(field.options ?? []).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : field.type === 'currency' ? (
              <RupiahInput
                id={id}
                className={INPUT_CLASS}
                placeholder={field.placeholder}
                required={field.required}
                autoFocus={index === 0}
                value={value}
                onValueChange={(raw) => set(field.name, raw)}
              />
            ) : field.type === 'staff' ? (
              <StaffSelect
                id={id}
                value={value === '0' ? '' : value}
                onChange={(v) => set(field.name, v)}
                placeholder="Tidak terhubung ke staff"
                allowAny
              />
            ) : field.type === 'textarea' ? (
              <textarea
                id={id}
                className="flex min-h-[80px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500"
                placeholder={field.placeholder}
                required={field.required}
                value={value}
                onChange={(e) => set(field.name, e.target.value)}
              />
            ) : (
              <Input
                id={id}
                type={field.type ?? 'text'}
                placeholder={field.placeholder}
                required={field.required}
                autoFocus={index === 0}
                value={value}
                onChange={(e) => set(field.name, e.target.value)}
              />
            )}
          </Field>
        )
      })}
    </div>
  )
}
