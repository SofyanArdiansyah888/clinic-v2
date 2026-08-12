import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Eye, EyeOff, HeartPulse } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuthStore } from '@/features/auth/store'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

export function LoginPage() {
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin123')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await login(username, password)
      void navigate({ to: '/' })
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err as Error).message ??
        'Login gagal'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 text-slate-900 antialiased">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl md:grid-cols-2">
        <div className="relative flex flex-col justify-between overflow-hidden bg-slate-900 p-8 text-white">
          <div className="absolute -right-10 -bottom-10 h-48 w-48 rounded-full bg-rose-600/20 blur-2xl" />
          <div className="relative z-10">
            <div className="mb-6 flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-rose-600 to-pink-500 text-white shadow-lg shadow-rose-600/30">
                <HeartPulse className="h-6 w-6" strokeWidth={2.5} />
              </div>
              <span className="text-xl font-bold tracking-tight">Clinic OS</span>
            </div>
            <h2 className="mb-2 text-2xl font-bold tracking-tight">
              Sistem Informasi & Operasional Klinik Terpadu
            </h2>
            <p className="mb-6 text-xs leading-relaxed text-slate-300">
              Platform manajemen rekam medis, pendaftaran antrian, depo obat, dan modul kasir dengan standar
              ergonomi tinggi.
            </p>
          </div>
          <div className="relative z-10 border-t border-slate-800 pt-4">
            <p className="text-[11px] font-semibold text-rose-300">Cabang Operasional Active:</p>
            <p className="text-xs text-slate-200">Klinik Utama Sehat — Jakarta Selatan</p>
          </div>
        </div>

        <div className="flex flex-col justify-center p-8">
          <h3 className="mb-1 text-lg font-bold text-slate-900">Masuk ke Akun Staf</h3>
          <p className="mb-6 text-xs text-slate-500">Masukkan username terdaftar untuk mengakses sistem.</p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="username" className="mb-1 text-xs font-semibold text-slate-700">
                Username / Email Pegawai <span className="text-rose-600">*</span>
              </Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-10 rounded-md border-slate-300 font-mono text-xs"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <Label htmlFor="password" className="mb-1 text-xs font-semibold text-slate-700">
                Kata Sandi <span className="text-rose-600">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 rounded-md border-slate-300 pr-10 font-mono text-xs"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}

            <Button
              type="submit"
              disabled={loading}
              className="flex h-11 w-full items-center justify-center space-x-2 rounded-xl text-xs font-semibold"
            >
              <span>{loading ? 'Memproses...' : 'Masuk Sistem Operasional'}</span>
              {!loading ? <ArrowRight className="h-4 w-4" /> : null}
            </Button>

            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-[11px] text-rose-800">
              Demo: <span className="font-semibold">admin / admin123</span>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
