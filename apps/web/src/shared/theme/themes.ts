export type ThemeId = 'rose' | 'teal' | 'dark' | 'brutal'

export type ThemeOption = {
  id: ThemeId
  label: string
  description: string
  // Mini preview: page background, card, brand, text.
  swatch: [string, string, string, string]
}

export const THEMES: ThemeOption[] = [
  {
    id: 'rose',
    label: 'Default (Rose)',
    description: 'Tampilan bawaan Clinic OS',
    swatch: ['#f8fafc', '#ffffff', '#e11d48', '#0f172a'],
  },
  {
    id: 'teal',
    label: 'Klinis Teal',
    description: 'Hijau-biru yang tenang',
    swatch: ['#f6faf9', '#ffffff', '#0d9488', '#0f2a2a'],
  },
  {
    id: 'dark',
    label: 'Mode Gelap',
    description: 'Nyaman untuk ruangan redup',
    swatch: ['#0b1120', '#131c2e', '#f43f5e', '#e2e8f0'],
  },
  {
    id: 'brutal',
    label: 'Neo Brutalism',
    description: 'Border tebal, warna flat, bayangan keras',
    swatch: ['#fdf6e3', '#ffffff', '#ff5fa2', '#000000'],
  },
]

export const DEFAULT_THEME: ThemeId = 'rose'
export const THEME_STORAGE_KEY = 'clinic_theme'

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value)
}
