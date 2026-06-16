import { Moon, Sun } from 'lucide-solid'
import { useTheme } from '../lib/theme-context'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      class="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-zinc-100 p-2 text-zinc-700 transition hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
    >
      {theme() === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
