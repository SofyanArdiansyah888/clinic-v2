import { ROLES, ROLE_PASSWORD, api, ownStaffName } from './support'

const JABATAN: Record<(typeof ROLES)[number], string> = {
  doctor: 'Dokter',
  staff: 'Kasir',
  apoteker: 'Apoteker',
  nurse: 'Beautician',
  finance: 'Finance',
}

// Creates one login per non-admin role in the e2e database and links it to its own staff
// record, since non-admin transactions are recorded under the account's staff (idempotent).
export default async function globalSetup() {
  const admin = await api('admin')
  const list = async <T,>(path: string) => ((await (await admin.get(path)).json()).data ?? []) as T[]

  const users = await list<{ id: number; username: string; name: string; email: string; staff_id?: number | null }>('/api/user?per_page=200')
  const staffs = await list<{ id: number; nama: string }>('/api/staff?per_page=200')

  for (const role of ROLES) {
    const username = `e2e_${role}`
    let user = users.find((u) => u.username === username)
    if (!user) {
      const r = await admin.post('/api/user', {
        data: { name: `E2E ${role}`, email: `${username}@e2e.test`, username, password: ROLE_PASSWORD, role, is_active: true },
      })
      if (!r.ok()) throw new Error(`create ${username}: ${r.status()} ${await r.text()}`)
      user = (await r.json()).data
    }

    let staff = staffs.find((s) => s.nama === ownStaffName(role))
    if (!staff) {
      const r = await admin.post('/api/staff', { data: { nama: ownStaffName(role), jabatan: JABATAN[role], is_active: true } })
      if (!r.ok()) throw new Error(`create staff for ${username}: ${r.status()} ${await r.text()}`)
      staff = (await r.json()).data
    }

    if (user!.staff_id !== staff!.id) {
      const r = await admin.put(`/api/user/${user!.id}`, {
        data: { name: user!.name, email: user!.email, username, staff_id: staff!.id },
      })
      if (!r.ok()) throw new Error(`link ${username} to staff: ${r.status()} ${await r.text()}`)
    }
  }
  await admin.dispose()
}
