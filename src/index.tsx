/* @refresh reload */
import { render } from 'solid-js/web'
import './index.css'
import { AppQueryProvider } from './lib/query-client'
import { ThemeProvider } from './lib/theme-context'
import App from './App.tsx'

const root = document.getElementById('root')

render(
  () => (
    <AppQueryProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </AppQueryProvider>
  ),
  root!,
)
