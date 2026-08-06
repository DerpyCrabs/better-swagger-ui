import { Moon, Sun } from '../icons'
import { useTheme } from '../lib/theme-context'

export function ThemeToggle(props: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      class={`inline-flex shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-800 transition hover:bg-zinc-50 dark:border-dm-border dark:bg-dm-input dark:text-dm-text dark:hover:bg-zinc-800 ${
        props.compact ? 'p-1.5' : 'rounded-lg p-2'
      }`}
    >
      {theme() === 'dark' ? <Sun size={props.compact ? 16 : 18} /> : <Moon size={props.compact ? 16 : 18} />}
    </button>
  )
}
