import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { specProxyPlugin } from './vite-plugin-spec-proxy'

export default defineConfig({
  plugins: [solid(), tailwindcss(), specProxyPlugin()],
})
