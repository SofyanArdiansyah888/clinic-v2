import { ROLES, ROLE_PASSWORD, api } from './support'

// Creates one login per non-admin role in the e2e database (idempotent).
export default async function globalSetup() {
  const admin = await api('admin')
  const res = await admin.get('/api/user?per_page=200')
  const existing = new Set<string>(((await res.json()).data ?? []).map((u: { username: string }) => u.username))
  for (const role of ROLES) {
    const username = `e2e_${role}`
    if (existing.has(username)) continue
    const r = await admin.post('/api/user', {
      data: { name: `E2E ${role}`, email: `${username}@e2e.test`, username, password: ROLE_PASSWORD, role, is_active: true },
    })
    if (!r.ok()) throw new Error(`create ${username}: ${r.status()} ${await r.text()}`)
  }
  await admin.dispose()
}
