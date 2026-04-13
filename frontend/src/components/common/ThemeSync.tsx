import { useEffect } from 'react'
import { useThemeStore } from '@/stores/themeStore'

/** 将 Zustand 主题同步到 html[data-theme]，供 CSS 变量与 color-scheme 使用 */
export default function ThemeSync() {
  const theme = useThemeStore((s) => s.theme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark'
  }, [theme])

  return null
}
