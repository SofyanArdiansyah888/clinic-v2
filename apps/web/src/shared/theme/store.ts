import { create } from 'zustand'
import { DEFAULT_THEME, isThemeId, THEME_STORAGE_KEY, type ThemeId } from '@/shared/theme/themes'

// The chosen theme lives on <html data-theme>. index.html applies the saved value before
// React loads (no flash); this store keeps React in sync and persists changes per browser.

function readSaved(): ThemeId {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeId(saved) ? saved : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function applyTheme(theme: ThemeId) {
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme === 'dark' ? 'dark' : 'light'
}

type ThemeStore = {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: readSaved(),
  setTheme: (theme) => {
    applyTheme(theme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Storage blocked (private mode): the theme still applies for this visit.
    }
    set({ theme })
  },
}))
