import { ref, watchEffect } from 'vue'

export type ThemeMode = 'light' | 'dark'

const KEY = 'ui.theme'

const theme = ref<ThemeMode>(localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light')
let initialized = false

/** 深浅色主题切换：html.dark + CSS 变量，偏好持久化到 localStorage */
export function useTheme() {
  if (!initialized) {
    initialized = true
    watchEffect(() => {
      document.documentElement.classList.toggle('dark', theme.value === 'dark')
      localStorage.setItem(KEY, theme.value)
    })
  }
  const toggleTheme = () => {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }
  return { theme, toggleTheme }
}
