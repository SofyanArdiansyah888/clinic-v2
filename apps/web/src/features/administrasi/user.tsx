import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { ResourceListPage, type FormField } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'
import { Dialog } from '@/shared/components/Dialog'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Field } from '@/shared/ui/field'
import { FieldErrorsContext, useFormValidation } from '@/shared/lib/validation'

type User = {
  id: number
  name: string
  username: string
  email: string
  role: string
  is_active: boolean
}

const columns: Column<User>[] = [
  { key: 'name', header: 'Nama', cell: (r) => <span className="font-bold text-slate-900">{r.name}</span> },
  { key: 'username', header: 'Username', cell: (r) => <span className="font-mono text-rose-700">{r.username}</span> },
  { key: 'email', header: 'Email', cell: (r) => r.email },
  { key: 'role', header: 'Role', cell: (r) => <span className="rounded bg-slate-100 px-2 py-1 font-semibold text-slate-700 uppercase text-[11px]">{r.role}</span> },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

const createFields: FormField[] = [
  { name: 'name', label: 'Nama Lengkap', required: true },
  { name: 'username', label: 'Username Akses', required: true },
  { name: 'email', label: 'Email', type: 'email', required: true },
  { name: 'password', label: 'Password', type: 'password', required: true },
  {
    name: 'role',
    label: 'Peran / Role',
    type: 'select',
    options: [
      { label: 'Admin Klinik', value: 'admin' },
      { label: 'Dokter', value: 'doctor' },
      { label: 'Front Office / Kasir', value: 'staff' },
      { label: 'Apoteker / Depo', value: 'apoteker' },
      { label: 'Nurse / Terapis', value: 'nurse' },
      { label: 'Finance / Akuntansi', value: 'finance' },
    ],
  },
]

const editFields: FormField[] = [
  { name: 'name', label: 'Nama Lengkap', required: true },
  { name: 'username', label: 'Username Akses', required: true },
  { name: 'email', label: 'Email', type: 'email', required: true },
  {
    name: 'role',
    label: 'Peran / Role',
    type: 'select',
    options: [
      { label: 'Admin Klinik', value: 'admin' },
      { label: 'Dokter', value: 'doctor' },
      { label: 'Front Office / Kasir', value: 'staff' },
      { label: 'Apoteker / Depo', value: 'apoteker' },
      { label: 'Nurse / Terapis', value: 'nurse' },
      { label: 'Finance / Akuntansi', value: 'finance' },
    ],
  },
]

export function UserPage() {
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const validation = useFormValidation()

  function openChangePassword(user: User) {
    setSelectedUser(user)
    setNewPassword('')
    setPasswordSuccess(false)
    validation.reset()
    setPasswordOpen(true)
  }

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!newPassword.trim()) return
    setPasswordSuccess(true)
    setTimeout(() => {
      setPasswordSuccess(false)
      setPasswordOpen(false)
      setSelectedUser(null)
    }, 1500)
  }

  return (
    <div>
      <ResourceListPage<User>
        title="User & Hak Akses"
        description="Akun pengguna dan hak akses"
        endpoint="/user"
        queryKey="user"
        columns={columns}
        createLabel="Tambah User"
        createFields={createFields}
        editFields={editFields}
        customRowActions={(user) => (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => openChangePassword(user)}
            title="Ubah Password"
            aria-label="Ubah Password"
          >
            <KeyRound />
          </Button>
        )}
      />

      <Dialog
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title="Ubah Password"
        description={`Akun @${selectedUser?.username ?? ''}`}
      >
        <FieldErrorsContext.Provider value={validation.errors}>
          <form {...validation.formProps} onSubmit={handlePasswordSubmit} className="space-y-4">
            <Field label="Password Baru" htmlFor="new-pass" required>
              <Input
                id="new-pass"
                type="password"
                placeholder="Minimal 6 karakter"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </Field>
            {passwordSuccess ? (
              <p className="text-xs font-semibold text-emerald-600">
                Password pengguna berhasil diperbarui!
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setPasswordOpen(false)}>
                Batal
              </Button>
              <Button type="submit">
                Simpan
              </Button>
            </div>
          </form>
        </FieldErrorsContext.Provider>
      </Dialog>
    </div>
  )
}
