import { createContext, createEffect, createSignal, useContext, type ParentProps } from 'solid-js'
import { applyTheme, getStoredTheme, persistTheme, type Theme } from './theme'

interface ThemeContextValue {
  theme: () => Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>()

export function ThemeProvider(props: ParentProps) {
  const [theme, setThemeState] = createSignal<Theme>(getStoredTheme())

  createEffect(() => {
    const current = theme()
    applyTheme(current)
    persistTheme(current)
  })

  const setTheme = (next: Theme) => setThemeState(next)

  const toggleTheme = () => {
    setThemeState((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {props.children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
