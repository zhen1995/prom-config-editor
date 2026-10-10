import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type ThemeName = 'dark' | 'light'

const STORAGE_KEY = 'prom-editor.theme'

function initialTheme(): ThemeName {
  return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
}

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<ThemeName>(initialTheme())

  function apply(): void {
    localStorage.setItem(STORAGE_KEY, theme.value)
    document.documentElement.dataset.theme = theme.value
    document.body.style.background = theme.value === 'dark' ? '#0e0e11' : '#f4f4f7'
  }

  watch(theme, apply)
  apply()

  function toggle(): void {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  return { theme, toggle }
})
