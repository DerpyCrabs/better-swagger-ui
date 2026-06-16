/* @refresh reload */
import { render } from 'solid-js/web'
import './index.css'
import { ThemeProvider } from './lib/theme-context'
import App from './App.tsx'

const root = document.getElementById('root')

render(
  () => (
    <ThemeProvider>
      <App />
    </ThemeProvider>
  ),
  root!,
)
