import { Input } from '@/shared/ui/input'
import { Field } from '@/shared/ui/field'
import type { FormField, FormValues } from '@/shared/lib/form'

type ResourceFormFieldsProps = {
  fields: FormField[]
  values: FormValues
  onChange: (values: FormValues) => void
  /** Prefix for input ids, unique per form on the page. */
  idPrefix: string
}

export function ResourceFormFields({ fields, values, onChange, idPrefix }: ResourceFormFieldsProps) {
  const set = (name: string, value: string) => onChange({ ...values, [name]: value })

  return (
    <>
      {fields.map((field, index) => {
        const id = `${idPrefix}-${field.name}`
        const value = values[field.name] ?? ''
        return (
          <Field key={field.name} label={field.label} htmlFor={id} required={field.required}>
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
    </>
  )
}
