import { Moon, Sun } from '../icons'
import { useTheme } from '../lib/theme-context'

export function ThemeToggle(props: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      class={`inline-flex shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-zinc-100 text-zinc-700 transition hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 ${
        props.compact ? 'p-1.5' : 'rounded-lg p-2'
      }`}
    >
      {theme() === 'dark' ? <Sun size={props.compact ? 16 : 18} /> : <Moon size={props.compact ? 16 : 18} />}
    </button>
  )
}
