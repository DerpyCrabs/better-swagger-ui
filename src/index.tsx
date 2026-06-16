/* @refresh reload */
import { render } from 'solid-js/web'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './lib/theme-context'

const root = document.getElementById('root')

render(
  () => (
    <ThemeProvider>
      <App />
    </ThemeProvider>
  ),
  root!,
)
